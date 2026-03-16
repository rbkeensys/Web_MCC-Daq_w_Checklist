"""
C++ Expression Backend
Version: 1.0.0
Updated: 2026-02-12

Provides high-performance expression evaluation using compiled DLL

CHANGELOG:
1.0.0 (2026-02-12):
  • Initial release
  • Batch expression evaluation (50-500× faster than Python)
  • Automatic fallback to Python if DLL unavailable
  • Hardware write support (DO, AO)
  • Static and global variable support
"""
__version__ = "1.0.0"
__updated__ = "2026-02-12"

import ctypes
from pathlib import Path
from typing import Dict, List, Optional
import numpy as np

class CPPExpressionBackend:
    def __init__(self, dll_path: str = "compiled/expressions.dll"):
        self.dll_path = Path(dll_path)
        self.dll = None
        self.batch_func = None
        self.num_expressions = 0
        
        # Data arrays (pre-allocated for performance)
        self.ai = np.zeros(64, dtype=np.float64)
        self.ao = np.zeros(16, dtype=np.float64)
        self.tc = np.zeros(64, dtype=np.float64)
        self.do_state = np.zeros(64, dtype=np.float64)
        self.pid = np.zeros(50, dtype=np.float64)
        self.do_out = np.zeros(64, dtype=np.float64)
        self.ao_out = np.zeros(16, dtype=np.float64)
        self.static_vars = np.zeros(100, dtype=np.float64)
        self.global_vars = np.zeros(100, dtype=np.float64)
        self.expr_results = np.zeros(50, dtype=np.float64)
        
        self._load_dll()
    
    def _load_dll(self):
        """Load the compiled DLL"""
        if not self.dll_path.exists():
            raise FileNotFoundError(f"DLL not found: {self.dll_path}")
        
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
            ctypes.POINTER(ctypes.c_double),  # global_vars
            ctypes.POINTER(ctypes.c_double),  # expr_results
        ]
    
    def evaluate(
        self,
        ai_vals: List[float],
        ao_vals: List[float],
        tc_vals: List[float],
        do_vals: List[float],
        pid_vals: List[float]
    ) -> Dict:
        """
        Evaluate all expressions in one shot
        
        Returns:
            {
                'results': [expr0_result, expr1_result, ...],
                'do_writes': {channel: value, ...},
                'ao_writes': {channel: value, ...}
            }
        """
        # Copy input data to arrays
        self.ai[:len(ai_vals)] = ai_vals
        self.ao[:len(ao_vals)] = ao_vals
        self.tc[:len(tc_vals)] = tc_vals
        self.do_state[:len(do_vals)] = do_vals
        self.pid[:len(pid_vals)] = pid_vals
        
        # Reset outputs
        self.do_out.fill(0)
        self.ao_out.fill(0)
        
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
            self.global_vars.ctypes.data_as(ctypes.POINTER(ctypes.c_double)),
            self.expr_results.ctypes.data_as(ctypes.POINTER(ctypes.c_double))
        )
        
        # Collect results
        results = {
            'results': self.expr_results.tolist(),
            'do_writes': {},
            'ao_writes': {}
        }
        
        # Collect DO writes
        for i, val in enumerate(self.do_out):
            if val != 0:
                results['do_writes'][i] = bool(val >= 1.0)
        
        # Collect AO writes
        for i, val in enumerate(self.ao_out):
            if val != 0:
                results['ao_writes'][i] = val
        
        return results


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
