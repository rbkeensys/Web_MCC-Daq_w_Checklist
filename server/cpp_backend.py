"""
C++ Backend Manager for Math Operators and Expressions
========================================================

Provides a unified interface to switch between Python and C++ evaluation backends.

Usage:
    # Initialize with C++ backend (if available)
    backend = CPPBackend()
    
    # Compile expression
    backend.compile_expression("AI0 * 2.5 + sin(AI1)", expr_id="math_0")
    
    # Set variables
    backend.set_variables({"AI0": 3.14, "AI1": 1.57})
    
    # Evaluate (FAST!)
    result = backend.evaluate("math_0")

Performance:
    Python eval():      ~100 µs per evaluation
    Python AST:         ~50 µs per evaluation  
    C++ ExprTk:         ~1-2 µs per evaluation (50-100× faster!)
"""

__version__ = "1.0.0"

import sys
from typing import Dict, Optional, Any

# Try to import C++ module
try:
    import mcc_cpp
    HAS_CPP = True
    print(f"[CPP-BACKEND] ✓ C++ ExprTk module loaded (v{mcc_cpp.__version__})")
except ImportError as e:
    HAS_CPP = False
    print(f"[CPP-BACKEND] ✗ C++ module not available: {e}")
    print("[CPP-BACKEND]   Falling back to Python evaluation")
    print("[CPP-BACKEND]   To enable C++: python setup.py build_ext --inplace")


class CPPBackend:
    """
    High-performance C++ expression evaluation backend
    
    Manages multiple compiled expressions and provides fast evaluation.
    Falls back to Python if C++ module is not available.
    """
    
    def __init__(self, use_cpp: bool = True):
        """
        Initialize backend
        
        Args:
            use_cpp: Try to use C++ backend if available (default: True)
        """
        self.use_cpp = use_cpp and HAS_CPP
        self.engines: Dict[str, Any] = {}  # expr_id -> ExprEngine
        self.python_fallbacks: Dict[str, Any] = {}  # For debugging/comparison
        
        if self.use_cpp:
            print(f"[CPP-BACKEND] Using C++ ExprTk backend")
        else:
            print(f"[CPP-BACKEND] Using Python eval() fallback")
    
    def compile_expression(self, expr_string: str, expr_id: str) -> bool:
        """
        Compile an expression
        
        Args:
            expr_string: Mathematical expression (e.g., "AI0 * 2.5 + sin(AI1)")
            expr_id: Unique identifier for this expression
            
        Returns:
            True if compilation succeeded, False otherwise
        """
        if self.use_cpp:
            # Use C++ ExprTk
            engine = mcc_cpp.ExprEngine()
            success = engine.compile(expr_string)
            
            if not success:
                error = engine.get_error()
                print(f"[CPP-BACKEND] ✗ Compilation failed for '{expr_id}': {error}")
                return False
            
            self.engines[expr_id] = engine
            print(f"[CPP-BACKEND] ✓ Compiled '{expr_id}': {expr_string}")
            return True
        else:
            # Python fallback - just store the string for eval()
            self.engines[expr_id] = {
                'expr': expr_string,
                'compiled': compile(expr_string, '<string>', 'eval')
            }
            return True
    
    def set_variables(self, variables: Dict[str, float]) -> None:
        """
        Set variable values for ALL compiled expressions
        
        Args:
            variables: Dictionary of {name: value} pairs
        """
        if self.use_cpp:
            # Update all C++ engines
            for engine in self.engines.values():
                if isinstance(engine, mcc_cpp.ExprEngine):
                    engine.set_variables(variables)
        else:
            # Store for Python eval() - will be used as namespace
            if not hasattr(self, '_python_namespace'):
                self._python_namespace = {}
            self._python_namespace.update(variables)
    
    def evaluate(self, expr_id: str) -> float:
        """
        Evaluate a compiled expression
        
        Args:
            expr_id: Expression identifier (from compile_expression)
            
        Returns:
            Result of evaluation
        """
        if expr_id not in self.engines:
            print(f"[CPP-BACKEND] ✗ Expression '{expr_id}' not compiled!")
            return 0.0
        
        if self.use_cpp:
            # C++ evaluation (FAST!)
            engine = self.engines[expr_id]
            return engine.evaluate()
        else:
            # Python fallback
            engine = self.engines[expr_id]
            try:
                return eval(engine['compiled'], {"__builtins__": {}}, self._python_namespace)
            except Exception as e:
                print(f"[CPP-BACKEND] ✗ Python eval error in '{expr_id}': {e}")
                return 0.0
    
    def evaluate_all(self, expr_ids: list) -> Dict[str, float]:
        """
        Evaluate multiple expressions at once
        
        Args:
            expr_ids: List of expression identifiers
            
        Returns:
            Dictionary of {expr_id: result}
        """
        results = {}
        for expr_id in expr_ids:
            results[expr_id] = self.evaluate(expr_id)
        return results
    
    def remove_expression(self, expr_id: str) -> None:
        """Remove a compiled expression"""
        if expr_id in self.engines:
            del self.engines[expr_id]
    
    def clear_all(self) -> None:
        """Remove all compiled expressions"""
        self.engines.clear()
        if hasattr(self, '_python_namespace'):
            self._python_namespace.clear()
    
    def get_stats(self) -> Dict[str, Any]:
        """Get backend statistics"""
        return {
            'backend': 'C++ ExprTk' if self.use_cpp else 'Python eval()',
            'num_expressions': len(self.engines),
            'cpp_available': HAS_CPP
        }


# Global backend instance
_global_backend: Optional[CPPBackend] = None


def get_backend(use_cpp: bool = True) -> CPPBackend:
    """
    Get or create the global backend instance
    
    Args:
        use_cpp: Try to use C++ backend if available
        
    Returns:
        CPPBackend instance
    """
    global _global_backend
    
    if _global_backend is None:
        _global_backend = CPPBackend(use_cpp=use_cpp)
    
    return _global_backend


# Convenience functions for direct use

def compile_expr(expr_string: str, expr_id: str) -> bool:
    """Compile an expression using the global backend"""
    return get_backend().compile_expression(expr_string, expr_id)


def set_vars(variables: Dict[str, float]) -> None:
    """Set variables using the global backend"""
    get_backend().set_variables(variables)


def eval_expr(expr_id: str) -> float:
    """Evaluate an expression using the global backend"""
    return get_backend().evaluate(expr_id)
