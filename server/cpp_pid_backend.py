"""
C++ PID Backend
High-performance PID controller evaluation
"""

import ctypes
import numpy as np
from pathlib import Path
from typing import List, Dict

class PIDState(ctypes.Structure):
    _fields_ = [
        ("integral", ctypes.c_double),
        ("prev_error", ctypes.c_double),
        ("prev_pv", ctypes.c_double),
        ("initialized", ctypes.c_bool)
    ]

class PIDConfig(ctypes.Structure):
    _fields_ = [
        ("kp", ctypes.c_double),
        ("ki", ctypes.c_double),
        ("kd", ctypes.c_double),
        ("out_min", ctypes.c_double),
        ("out_max", ctypes.c_double),
        ("err_min", ctypes.c_double),
        ("err_max", ctypes.c_double),
        ("i_min", ctypes.c_double),
        ("i_max", ctypes.c_double),
        ("use_derivative_on_pv", ctypes.c_bool)
    ]

class CPPPIDBackend:
    def __init__(self, dll_path: str = "compiled/pid_controller.dll"):
        self.dll = ctypes.CDLL(dll_path)
        
        # Setup function signatures
        self.dll.pid_step_batch.argtypes = [
            ctypes.c_int,  # num_pids
            ctypes.POINTER(PIDState),  # states
            ctypes.POINTER(PIDConfig),  # configs
            ctypes.POINTER(ctypes.c_double),  # pvs
            ctypes.POINTER(ctypes.c_double),  # sps
            ctypes.c_double,  # dt
            ctypes.POINTER(ctypes.c_double)  # outputs
        ]
        self.dll.pid_step_batch.restype = None
        
        self.states = []
        self.configs = []
    
    def configure(self, pid_loops: List[Dict]):
        """Configure PID controllers from loop definitions"""
        self.states = (PIDState * len(pid_loops))()
        self.configs = (PIDConfig * len(pid_loops))()
        
        for i, loop in enumerate(pid_loops):
            cfg = self.configs[i]
            cfg.kp = loop.get('kp', 0.0)
            cfg.ki = loop.get('ki', 0.0)
            cfg.kd = loop.get('kd', 0.0)
            cfg.out_min = loop.get('out_min', -1e6)
            cfg.out_max = loop.get('out_max', 1e6)
            cfg.err_min = loop.get('err_min', -1e6)
            cfg.err_max = loop.get('err_max', 1e6)
            cfg.i_min = loop.get('i_min', -1e6)
            cfg.i_max = loop.get('i_max', 1e6)
            cfg.use_derivative_on_pv = True
    
    def step(self, pvs: List[float], sps: List[float], dt: float) -> List[float]:
        """Evaluate all PIDs at once"""
        num_pids = len(pvs)
        
        pv_array = (ctypes.c_double * num_pids)(*pvs)
        sp_array = (ctypes.c_double * num_pids)(*sps)
        out_array = (ctypes.c_double * num_pids)()
        
        self.dll.pid_step_batch(
            num_pids,
            self.states,
            self.configs,
            pv_array,
            sp_array,
            dt,
            out_array
        )
        
        return list(out_array)
