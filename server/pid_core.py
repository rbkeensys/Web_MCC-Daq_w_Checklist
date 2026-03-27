# server/pid_core.py - PID with anti-windup on OUTPUT saturation
from dataclasses import dataclass
from typing import List, Dict, Optional

@dataclass
class LoopDef:
    enabled: bool
    kind: str           # "analog" | "digital" | "var"
    src: str            # "ai" | "tc" | "ao" | "pid" | "expr"
    ai_ch: int
    out_ch: int         # AO idx for analog, DO idx for digital
    target: float       # Fixed setpoint value
    sp_source: str = "fixed"  # "fixed", "ao", "expr", "pid"
    sp_channel: int = 0
    kp: float = 0.0
    ki: float = 0.0
    kd: float = 0.0
    out_min: Optional[float] = None  # Output clamp min
    out_max: Optional[float] = None  # Output clamp max
    i_min: Optional[float] = None    # Integral clamp min
    i_max: Optional[float] = None    # Integral clamp max
    name: str = ""
    enable_gate: bool = False
    enable_kind: str = "do"  # 'do' or 'expr'
    enable_index: int = 0
    execution_rate_hz: Optional[float] = None

class _PID:
    def __init__(self, d: LoopDef):
        self.d = d
        self.integral = 0.0
        self.prev_measurement = None
        self.tick_counter = 0
        self.last_u = 0.0
        # Telemetry cache
        self.last_pv = 0.0
        self.last_sp = 0.0
        self.last_err = 0.0
        self.last_p = 0.0
        self.last_d = 0.0

    def step(self, pv: float, sp: float, dt: float):
        """
        Execute PID step with anti-windup on OUTPUT saturation
        
        Algorithm:
        - Calculate P, I, D
        - Predict output BEFORE updating integral
        - Saturate output
        - Anti-windup: only integrate if output NOT saturated, 
          or if integrating helps unwind
        """
        # Error
        error = sp - pv
        
        # Proportional
        P = self.d.kp * error
        
        # Derivative on measurement (filtered, no setpoint kick)
        D = 0.0
        if self.prev_measurement is not None:
            d_meas = (pv - self.prev_measurement) / max(1e-6, dt)
            D = -self.d.kd * d_meas
        self.prev_measurement = pv
        
        # Predict output BEFORE updating integral
        output_unsat = P + self.integral + D
        
        # Saturate output
        output = output_unsat
        if self.d.out_min is not None and output < self.d.out_min:
            output = self.d.out_min
        if self.d.out_max is not None and output > self.d.out_max:
            output = self.d.out_max
        
        # --- Anti-windup logic ---
        if output == output_unsat:
            # Not saturated → safe to integrate
            self.integral += self.d.ki * error * dt
        else:
            # Saturated → only integrate if it helps unwind
            if (output == self.d.out_max and error < 0) or \
               (output == self.d.out_min and error > 0):
                self.integral += self.d.ki * error * dt
            # else: don't integrate (anti-windup)
        
        # Clamp integral
        if self.d.i_min is not None and self.integral < self.d.i_min:
            self.integral = self.d.i_min
        if self.d.i_max is not None and self.integral > self.d.i_max:
            self.integral = self.d.i_max
        
        # Cache for telemetry
        self.last_pv = pv
        self.last_sp = sp
        self.last_err = error
        self.last_p = P
        self.last_d = D
        self.last_u = output
        
        return output, error, P, self.integral, D

class PIDManager:
    def __init__(self):
        self.loops: List[_PID] = []
        self.meta: List[LoopDef] = []
        self.last_gate_states: List[bool] = []

    def load(self, pid_file):
        # Preserve existing PID states when reloading config
        old_loops = {meta.name: (pid, meta) for pid, meta in zip(self.loops, self.meta)}
        
        new_loops = []
        new_meta = []
        new_gate_states = []
        
        for rec in pid_file.loops:
            # Convert to dict and remove deprecated fields for backward compatibility
            rec_dict = rec.dict()
            
            # Remove deprecated fields that no longer exist in LoopDef
            deprecated = ['err_min', 'err_max', 'out_min_source', 'out_max_source', 
                         'out_min_channel', 'out_max_channel', 'derivative_on_pv']
            for field in deprecated:
                rec_dict.pop(field, None)
            
            d = LoopDef(**rec_dict)
            
            # Check if this PID existed before
            if d.name in old_loops:
                old_pid, old_meta = old_loops[d.name]
                # Update config, keep state
                old_pid.d = d
                new_loops.append(old_pid)
            else:
                # New PID
                new_loops.append(_PID(d))
            
            new_meta.append(d)
            new_gate_states.append(True)
        
        # Atomic swap
        self.loops = new_loops
        self.meta = new_meta
        self.last_gate_states = new_gate_states

    def step(self, ai_vals: List[float], tc_vals: List[float], bridge, do_state=None, 
             le_state=None, pid_prev=None, math_outputs=None, expr_outputs=None, 
             sample_rate_hz=100.0) -> List[Dict]:
        dt = 1.0 / max(1.0, sample_rate_hz)
        tel = []
        
        for i, (p, d) in enumerate(zip(self.loops, self.meta)):
            if not d.enabled:
                # Reset state
                p.integral = 0.0
                p.prev_measurement = None
                p.tick_counter = 0
                
                # Force outputs to safe state
                if d.kind == "digital":
                    bridge.set_do(d.out_ch, False, active_high=True)
                elif d.kind == "analog":
                    bridge.set_ao(d.out_ch, 0.0)
                
                tel.append({"name": d.name, "pv": 0.0, "u": 0.0, "out": 0.0, "err": 0.0, "enabled": False})
                continue
            
            # Check enable gate
            gate_enabled = True
            gate_value = 1.0
            if d.enable_gate:
                if d.enable_kind == "do" and do_state is not None:
                    if d.enable_index < len(do_state):
                        gate_value = 1.0 if do_state[d.enable_index] else 0.0
                        gate_enabled = bool(do_state[d.enable_index])
                    else:
                        gate_value = 0.0
                        gate_enabled = False
                elif d.enable_kind == "expr" and expr_outputs is not None:
                    if d.enable_index < len(expr_outputs):
                        gate_value = expr_outputs[d.enable_index]
                        gate_enabled = gate_value >= 1.0
                    else:
                        gate_value = 0.0
                        gate_enabled = False
                
                # Handle state transitions
                if i < len(self.last_gate_states):
                    if gate_enabled != self.last_gate_states[i]:
                        gate_type = f"{d.enable_kind.upper()}{d.enable_index}"
                        state_str = "ENABLED" if gate_enabled else "DISABLED"
                        print(f"[PID-GATE] Loop '{d.name}': {gate_type} → {state_str}")
                        
                        if not gate_enabled:
                            p.integral = 0.0
                            p.prev_measurement = None
                            p.tick_counter = 0
                            print(f"[PID-GATE] Loop '{d.name}': State reset (i=0, prev=None)")
                            
                            # Force safe outputs
                            if d.kind == "digital":
                                bridge.set_do(d.out_ch, False, active_high=True)
                            elif d.kind == "analog":
                                bridge.set_ao(d.out_ch, 0.0)
                        
                        self.last_gate_states[i] = gate_enabled
            
            if not gate_enabled:
                tel.append({"name": d.name, "pv": 0.0, "u": 0.0, "out": 0.0, "err": 0.0, 
                           "enabled": True, "gated": True, "gate_value": gate_value})
                continue
            
            # Execution rate decimation
            should_execute = True
            if d.execution_rate_hz is not None and d.execution_rate_hz > 0:
                decimate = max(1, int(round(sample_rate_hz / d.execution_rate_hz)))
                p.tick_counter += 1
                should_execute = (p.tick_counter >= decimate)
                if should_execute:
                    p.tick_counter = 0
                    dt = decimate / sample_rate_hz
            
            if not should_execute:
                tel.append({
                    "name": d.name, "pv": p.last_pv, "u": p.last_u, "out": p.last_u,
                    "err": p.last_err, "p_term": p.last_p, "i_term": p.integral, "d_term": p.last_d,
                    "target": p.last_sp, "enabled": True, "gated": False, "gate_value": gate_value, "skipped": True
                })
                continue
            
            # Read PV
            try:
                pv = 0.0
                if d.src == "ai":
                    pv = ai_vals[d.ai_ch]
                elif d.src == "ao":
                    if d.ai_ch < len(bridge.ao_cache):
                        pv = bridge.ao_cache[d.ai_ch]
                elif d.src == "tc" and tc_vals:
                    pv = tc_vals[min(d.ai_ch, len(tc_vals)-1)]
                elif d.src == "pid" and pid_prev:
                    if d.ai_ch < len(pid_prev):
                        pv = pid_prev[d.ai_ch].get("out", 0.0)
                elif d.src == "expr" and expr_outputs:
                    if d.ai_ch < len(expr_outputs):
                        pv = expr_outputs[d.ai_ch]
                
                # Read setpoint
                sp = d.target
                if d.sp_source == "ao":
                    if d.sp_channel < len(bridge.ao_cache):
                        sp = bridge.ao_cache[d.sp_channel]
                elif d.sp_source == "expr" and expr_outputs:
                    if d.sp_channel < len(expr_outputs):
                        sp = expr_outputs[d.sp_channel]
                elif d.sp_source == "pid" and pid_prev:
                    if d.sp_channel < len(pid_prev):
                        sp = pid_prev[d.sp_channel].get("out", 0.0)
                
                # Run PID
                output, err, p_term, i_term, d_term = p.step(pv, sp, dt)
                
                # Output handling based on kind
                if d.kind == "digital":
                    ov = 1.0 if output >= 0 else 0.0
                    bridge.set_do(d.out_ch, output >= 0.0, active_high=True)
                elif d.kind == "var":
                    ov = output  # No hardware write
                else:  # analog
                    ov = output
                    bridge.set_ao(d.out_ch, output)
                
                tel.append({
                    "name": d.name, "pv": pv, "u": output, "out": ov, "err": err,
                    "p_term": p_term, "i_term": i_term, "d_term": d_term, "target": sp,
                    "enabled": True, "gated": False, "gate_value": gate_value
                })
                
            except Exception as e:
                print(f"[PID] Loop '{d.name}' failed: {e}")
                tel.append({"name": d.name, "pv": 0.0, "u": 0.0, "out": 0.0, "err": 0.0, 
                           "error": str(e), "enabled": True})
        
        return tel
