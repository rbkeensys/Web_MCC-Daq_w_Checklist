"""
C++ Expression Backend
Version: 3.2.0
Updated: 2026-03-26

Provides high-performance expression evaluation using compiled DLL

CHANGELOG:
3.2.0 (2026-03-26):
  • Added metadata loading (staticvar_map, buttonvar_map, local_var_names)
  • Added runtime static variable editing support
  • Fixed per-expression DO/AO write tracking
3.0.0 (2026-02-15):
  • Added button_vars support
  • Added per-expression hardware write tracking
1.0.0 (2026-02-12):
  • Initial release
  • Batch expression evaluation (50-500× faster than Python)
  • Automatic fallback to Python if DLL unavailable
  • Hardware write support (DO, AO)
  • Static and global variable support
"""
__version__ = "3.2.0"
__updated__ = "2026-03-26"

import ctypes
import json
from pathlib import Path
from typing import Dict, List, Optional
import numpy as np

class CPPExpressionBackend:
    def __init__(self, dll_path: str = "compiled/expressions.dll"):
        self.dll_path = Path(dll_path)
        self.dll = None
        self.batch_func = None
        self.num_expressions = 0
        
        # Metadata (loaded from expr_metadata.json)
        self.local_var_names = {}      # {expr_index: [var1, var2, ...]}
        self.staticvar_map = {}        # {varName: index}
        self.buttonvar_map = {}        # {varName: index}
        
        # Data arrays (pre-allocated for performance)
        self.ai = np.zeros(64, dtype=np.float64)
        self.ao = np.zeros(16, dtype=np.float64)
        self.tc = np.zeros(64, dtype=np.float64)
        self.do_state = np.zeros(64, dtype=np.float64)
        self.pid = np.zeros(50, dtype=np.float64)
        self.do_out = np.zeros(64, dtype=np.float64)
        self.ao_out = np.zeros(16, dtype=np.float64)
        self.static_vars = np.zeros(100, dtype=np.float64)
        self.button_vars = np.zeros(100, dtype=np.float64)
        self.expr_results = np.zeros(50, dtype=np.float64)
        self.local_vars_out = np.zeros(500, dtype=np.float64)  # Up to 10 locals per expr
        
        # Per-expression hardware writes (for tracking which expr wrote what)
        self.do_writes_per_expr = np.zeros((50, 64), dtype=np.float64)
        self.do_was_written_per_expr = np.zeros((50, 64), dtype=np.float64)
        self.ao_writes_per_expr = np.zeros((50, 16), dtype=np.float64)
        self.ao_was_written_per_expr = np.zeros((50, 16), dtype=np.float64)
        
        self._load_metadata()
        self._load_dll()
    
    def _load_metadata(self):
        """Load expression metadata from expr_metadata.json"""
        metadata_path = Path("compiled/expr_metadata.json")
        if not metadata_path.exists():
            print(f"[CPP-EXPR] Warning: {metadata_path} not found, metadata not loaded")
            return
        
        try:
            with open(metadata_path, 'r') as f:
                metadata = json.load(f)
            
            self.num_expressions = metadata.get('num_expressions', 0)
            self.local_var_names = metadata.get('local_var_names', {})
            self.staticvar_map = metadata.get('staticvar_map', {})
            self.buttonvar_map = metadata.get('buttonvar_map', {})
            
            # Initialize static_vars from metadata (default values)
            if 'static_var_defaults' in metadata:
                for var_name, default_val in metadata['static_var_defaults'].items():
                    if var_name in self.staticvar_map:
                        index = self.staticvar_map[var_name]
                        self.static_vars[index] = default_val
            
            # Initialize button_vars to 0 (OFF)
            for var_name, index in self.buttonvar_map.items():
                self.button_vars[index] = 0.0
            
            print(f"[CPP-EXPR] Loaded metadata: {self.num_expressions} expressions")
            if self.local_var_names:
                print(f"[CPP-EXPR] LocalVars: {len(self.local_var_names)} expressions with locals")
                for expr_idx, var_names in self.local_var_names.items():
                    print(f"[CPP-EXPR]   Expr {expr_idx}: {var_names}")
            print(f"[CPP-EXPR] StaticVars: {len(self.staticvar_map)} variables: {list(self.staticvar_map.keys())}")
            print(f"[CPP-EXPR] ButtonVars: {len(self.buttonvar_map)} variables: {list(self.buttonvar_map.keys())}")
            
        except Exception as e:
            print(f"[CPP-EXPR] Error loading metadata: {e}")
    
    def _load_dll(self):
        """Load the compiled DLL"""
        if not self.dll_path.exists():
            raise FileNotFoundError(f"DLL not found: {self.dll_path}")
        
        print(f"[CPP-EXPR] cpp_expr_backend.py VERSION: {__version__} (updated {__updated__})")
        print(f"[CPP-EXPR] DLL Signature: 15 parameters (NEW)")
        
        self.dll = ctypes.CDLL(str(self.dll_path))
        
        # Load batch evaluation function
        self.batch_func = self.dll.evaluate_all_expressions
        self.batch_func.restype = None
        self.batch_func.argtypes = [
            ctypes.POINTER(ctypes.c_double),  # ai
            ctypes.POINTER(ctypes.c_double),  # ao
            ctypes.POINTER(ctypes.c_double),  # tc
            ctypes.POINTER(ctypes.c_double),  # do_state
            ctypes.POINTER(ctypes.c_double),  # pid
            ctypes.POINTER(ctypes.c_double),  # do_out
            ctypes.POINTER(ctypes.c_double),  # ao_out
            ctypes.POINTER(ctypes.c_double),  # static_vars
            ctypes.POINTER(ctypes.c_double),  # button_vars
            ctypes.POINTER(ctypes.c_double),  # expr_results
            ctypes.POINTER(ctypes.c_double),  # local_vars_out
            ctypes.POINTER(ctypes.c_double),  # do_writes_per_expr (flattened 50x64)
            ctypes.POINTER(ctypes.c_double),  # ao_writes_per_expr (flattened 50x16)
            ctypes.POINTER(ctypes.c_double),  # do_was_written_per_expr
            ctypes.POINTER(ctypes.c_double),  # ao_was_written_per_expr
        ]
        
        # Try to load PID function (may not exist if no PIDs configured)
        try:
            self.pid_func = self.dll.pid_step_all
            self.pid_func.restype = None
            self.pid_func.argtypes = [
                ctypes.POINTER(ctypes.c_double),  # ai
                ctypes.POINTER(ctypes.c_double),  # tc
                ctypes.POINTER(ctypes.c_double),  # ao_cache
                ctypes.POINTER(ctypes.c_double),  # do_state
                ctypes.POINTER(ctypes.c_double),  # expr_results
                ctypes.POINTER(ctypes.c_double),  # pid_outputs
                ctypes.POINTER(ctypes.c_double),  # do_out
                ctypes.POINTER(ctypes.c_double),  # ao_out
                ctypes.c_double,                   # dt
            ]
            print("[CPP-EXPR] ✓ PID function loaded")
            self.has_pids = True
        except AttributeError:
            self.pid_func = None
            self.has_pids = False
            print("[CPP-EXPR] No PID function in DLL (no PIDs configured)")
    
    def evaluate(
        self,
        ai_vals: List[float],
        ao_vals: List[float],
        tc_vals: List[float],
        do_vals: List[float],
        pid_vals: List[float],
        button_vars: Optional[Dict[str, float]] = None
    ) -> Dict:
        """
        Evaluate all expressions in one shot
        
        Args:
            button_vars: Dict of {varName: value} for button variables
        
        Returns:
            {
                'results': [expr0_result, expr1_result, ...],
                'do_writes': {channel: value, ...},
                'ao_writes': {channel: value, ...},
                'hw_writes_per_expr': [
                    {'do': {ch: val}, 'ao': {ch: val}},  # Expr 0
                    {'do': {ch: val}, 'ao': {ch: val}},  # Expr 1
                    ...
                ],
                'local_vars_per_expr': {
                    0: {var1: val1, var2: val2},  # Expr 0 locals
                    1: {var1: val1, var2: val2},  # Expr 1 locals
                    ...
                }
            }
        """
        # Copy input data to arrays
        self.ai[:len(ai_vals)] = ai_vals
        self.ao[:len(ao_vals)] = ao_vals
        self.tc[:len(tc_vals)] = tc_vals
        self.do_state[:len(do_vals)] = do_vals
        self.pid[:len(pid_vals)] = pid_vals
        
        # Update button_vars from dict
        # CRITICAL: Reset ALL button vars to 0 first, then update from dict
        # This ensures released buttons (not in dict) return to 0
        self.button_vars.fill(0.0)
        if button_vars:
            for var_name, value in button_vars.items():
                if var_name in self.buttonvar_map:
                    index = self.buttonvar_map[var_name]
                    self.button_vars[index] = float(value)
        
        # Reset outputs
        self.do_out.fill(0)
        self.ao_out.fill(0)
        self.do_writes_per_expr.fill(0)
        self.do_was_written_per_expr.fill(0)
        self.ao_writes_per_expr.fill(0)
        self.ao_was_written_per_expr.fill(0)
        
        # Call DLL (FAST!)
        self.batch_func(
            self.ai.ctypes.data_as(ctypes.POINTER(ctypes.c_double)),
            self.ao.ctypes.data_as(ctypes.POINTER(ctypes.c_double)),
            self.tc.ctypes.data_as(ctypes.POINTER(ctypes.c_double)),
            self.do_state.ctypes.data_as(ctypes.POINTER(ctypes.c_double)),
            self.pid.ctypes.data_as(ctypes.POINTER(ctypes.c_double)),
            self.do_out.ctypes.data_as(ctypes.POINTER(ctypes.c_double)),
            self.ao_out.ctypes.data_as(ctypes.POINTER(ctypes.c_double)),
            self.static_vars.ctypes.data_as(ctypes.POINTER(ctypes.c_double)),
            self.button_vars.ctypes.data_as(ctypes.POINTER(ctypes.c_double)),
            self.expr_results.ctypes.data_as(ctypes.POINTER(ctypes.c_double)),
            self.local_vars_out.ctypes.data_as(ctypes.POINTER(ctypes.c_double)),
            self.do_writes_per_expr.ctypes.data_as(ctypes.POINTER(ctypes.c_double)),
            self.ao_writes_per_expr.ctypes.data_as(ctypes.POINTER(ctypes.c_double)),
            self.do_was_written_per_expr.ctypes.data_as(ctypes.POINTER(ctypes.c_double)),
            self.ao_was_written_per_expr.ctypes.data_as(ctypes.POINTER(ctypes.c_double))
        )
        
        # Collect results
        results = {
            'results': self.expr_results[:self.num_expressions].tolist(),
            'do_writes': {},
            'ao_writes': {},
            'hw_writes_per_expr': [],
            'local_vars_per_expr': {}
        }
        
        # Collect global DO writes (check was_written flag, not value!)
        for i in range(64):
            # Check if ANY expression wrote to this DO
            was_written = False
            for expr_idx in range(self.num_expressions):
                if self.do_was_written_per_expr[expr_idx][i] > 0:
                    was_written = True
                    break
            if was_written:
                results['do_writes'][i] = bool(self.do_out[i] >= 1.0)
        
        # Collect global AO writes (check was_written flag, not value!)
        for i in range(16):
            # Check if ANY expression wrote to this AO
            was_written = False
            for expr_idx in range(self.num_expressions):
                if self.ao_was_written_per_expr[expr_idx][i] > 0:
                    was_written = True
                    break
            if was_written:
                results['ao_writes'][i] = self.ao_out[i]
        
        # Collect per-expression hardware writes
        for expr_idx in range(self.num_expressions):
            expr_hw = {'do': {}, 'ao': {}}
            
            # DO writes for this expression
            for ch in range(64):
                if self.do_was_written_per_expr[expr_idx][ch] > 0:
                    val = self.do_writes_per_expr[expr_idx][ch]
                    expr_hw['do'][ch] = bool(val >= 1.0)
            
            # AO writes for this expression
            for ch in range(16):
                if self.ao_was_written_per_expr[expr_idx][ch] > 0:
                    val = self.ao_writes_per_expr[expr_idx][ch]
                    expr_hw['ao'][ch] = val
            
            results['hw_writes_per_expr'].append(expr_hw)
        
        # Collect local variables
        local_offset = 0
        for expr_idx in range(self.num_expressions):
            expr_idx_str = str(expr_idx)
            if expr_idx_str in self.local_var_names:
                var_names = self.local_var_names[expr_idx_str]
                expr_locals = {}
                for i, var_name in enumerate(var_names):
                    expr_locals[var_name] = self.local_vars_out[local_offset + i]
                results['local_vars_per_expr'][expr_idx] = expr_locals
                local_offset += len(var_names)
        
        # Debug first call
        if not hasattr(self, '_debug_locals_shown'):
            self._debug_locals_shown = True
            print(f"[CPP-DEBUG] local_var_names keys: {list(self.local_var_names.keys())}")
            print(f"[CPP-DEBUG] local_vars_per_expr keys: {list(results['local_vars_per_expr'].keys())}")
            if results['local_vars_per_expr']:
                for idx, locals_dict in results['local_vars_per_expr'].items():
                    print(f"[CPP-DEBUG] Expr {idx} locals: {locals_dict}")
        
        return results
    
    def evaluate_pids(
        self,
        ai_vals: List[float],
        tc_vals: List[float],
        ao_cache: List[float],
        do_state: List[float],
        expr_results: List[float],
        num_pids: int,
        dt: float
    ) -> List[float]:
        """
        Evaluate PID controllers using C++ DLL
        Returns array of PID outputs
        """
        if not self.has_pids or self.pid_func is None:
            return [0.0] * num_pids
        
        # Prepare arrays
        ai_array = np.array(ai_vals, dtype=np.float64)
        tc_array = np.array(tc_vals, dtype=np.float64)
        ao_cache_array = np.array(ao_cache, dtype=np.float64)
        do_state_array = np.array(do_state, dtype=np.float64)
        expr_array = np.array(expr_results, dtype=np.float64)
        
        # Output arrays
        pid_outputs = np.zeros(num_pids, dtype=np.float64)
        do_out = np.zeros(64, dtype=np.float64)  # PID can write DOs
        ao_out = np.zeros(16, dtype=np.float64)  # PID can write AOs
        
        # Call DLL
        self.pid_func(
            ai_array.ctypes.data_as(ctypes.POINTER(ctypes.c_double)),
            tc_array.ctypes.data_as(ctypes.POINTER(ctypes.c_double)),
            ao_cache_array.ctypes.data_as(ctypes.POINTER(ctypes.c_double)),
            do_state_array.ctypes.data_as(ctypes.POINTER(ctypes.c_double)),
            expr_array.ctypes.data_as(ctypes.POINTER(ctypes.c_double)),
            pid_outputs.ctypes.data_as(ctypes.POINTER(ctypes.c_double)),
            do_out.ctypes.data_as(ctypes.POINTER(ctypes.c_double)),
            ao_out.ctypes.data_as(ctypes.POINTER(ctypes.c_double)),
            dt
        )
        
        return {
            'outputs': list(pid_outputs),
            'do_writes': {i: bool(v >= 1.0) for i, v in enumerate(do_out) if v != 0},
            'ao_writes': {i: v for i, v in enumerate(ao_out) if v != 0}
        }


# Global instance
_cpp_backend: Optional[CPPExpressionBackend] = None

def get_cpp_backend() -> Optional[CPPExpressionBackend]:
    """Get or create global C++ backend instance"""
    global _cpp_backend
    if _cpp_backend is None:
        try:
            _cpp_backend = CPPExpressionBackend()
            print("[CPP-EXPR] ✓ C++ expression backend loaded")
        except Exception as e:
            print(f"[CPP-EXPR] ✗ Failed to load C++ backend: {e}")
            print("[CPP-EXPR] Falling back to Python evaluation")
            return None
    return _cpp_backend
