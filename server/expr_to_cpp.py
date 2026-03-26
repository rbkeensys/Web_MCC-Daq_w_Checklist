"""
Expression to C++ Compiler - WORKING VERSION
Version: 3.2.0
Updated: 2026-03-20

PER-EXPRESSION WRITE TRACKING with separate flag arrays!

ALL assignments chain to result! result = var = expr; result = DO = expr; etc.

Complete rewrite to handle actual expr_engine.py AST node types:
- ASSIGN, STATIC_ASSIGN, DO_ASSIGN, AO_ASSIGN
- VAR, STATIC_VAR, BUTTONVAR, SIGNAL
- IF, CALL, COMPARE, AND, OR, NOT
- NUMBER, PLUS, MINUS, MULT, DIV, MOD, POWER
"""

__version__ = "3.2.0"
__updated__ = "2026-03-20"

import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Dict, List, Tuple, Optional, Set

# Import expression engine
sys.path.insert(0, str(Path(__file__).parent / "server"))
from expr_engine import Lexer, Parser


class SignalMap:
    """Maps signal names to array indices"""
    
    def __init__(self, config: Dict):
        self.ai_map = {}
        self.ao_map = {}
        self.do_map = {}
        self.tc_map = {}
        self.pid_map = {}
        
        # Build maps from board-centric config
        ai_index = 0
        do_index = 0
        ao_index = 0
        
        for board in config.get('boards1608', []):
            if not board.get('enabled', True):
                continue
            
            for ch in board.get('analogs', []):
                if ch.get('include', True):
                    self.ai_map[ch['name']] = ai_index
                    ai_index += 1
            
            # Include ALL DOs regardless of include flag (expressions may reference them)
            for ch in board.get('digitalOutputs', []):
                self.do_map[ch['name']] = do_index
                do_index += 1
            
            for ch in board.get('analogOutputs', []):
                if ch.get('include', True):
                    self.ao_map[ch['name']] = ao_index
                    ao_index += 1
        
        # TC channels
        tc_index = 0
        for board in config.get('boardsetc', []):
            if not board.get('enabled', True):
                continue
            
            for ch in board.get('thermocouples', []):
                if ch.get('include', True):
                    self.tc_map[ch['name']] = tc_index
                    tc_index += 1
    
    def get_signal_index(self, sig_type: str, sig_name: str) -> int:
        """Get array index for a signal"""
        sig_type = sig_type.upper()
        
        if sig_type == 'AI':
            if sig_name in self.ai_map:
                return self.ai_map[sig_name]
            elif sig_name.isdigit():
                return int(sig_name)
            else:
                print(f"[CPP-WARN] Unknown AI signal: {sig_name}, using index 0")
                return 0
        elif sig_type == 'AO':
            if sig_name in self.ao_map:
                return self.ao_map[sig_name]
            elif sig_name.isdigit():
                return int(sig_name)
            else:
                print(f"[CPP-WARN] Unknown AO signal: {sig_name}, using index 0")
                return 0
        elif sig_type == 'DO':
            if sig_name in self.do_map:
                return self.do_map[sig_name]
            elif sig_name.isdigit():
                return int(sig_name)
            else:
                print(f"[CPP-WARN] Unknown DO signal '{sig_name}' not in config, using index 0")
                print(f"[CPP-WARN] Available DOs: {list(self.do_map.keys())}")
                return 0
        elif sig_type == 'TC':
            if sig_name in self.tc_map:
                return self.tc_map[sig_name]
            elif sig_name.isdigit():
                return int(sig_name)
            else:
                print(f"[CPP-WARN] Unknown TC signal: {sig_name}, using index 0")
                return 0
        else:
            return 0


class CPPCodeGenerator:
    """Generate C++ code from expr_engine AST"""
    
    def __init__(self, signal_map: SignalMap):
        self.signal_map = signal_map
        self.indent_level = 0
        self.local_vars: Set[str] = set()
        self.static_vars: Set[str] = set()
        
        # Build consistent mappings for buttonVars and static vars
        self.buttonvar_map: Dict[str, int] = {}  # name -> index
        self.staticvar_map: Dict[str, int] = {}  # name -> index
        self.buttonvar_counter = 0
        self.staticvar_counter = 0
    
    def indent(self) -> str:
        return "    " * self.indent_level
    
    def compile_expression(self, expr_text: str, expr_index: int) -> Tuple[str, List[str], List[str]]:
        """Compile one expression to C++ function"""
        self.local_vars = set()
        self.static_vars = set()
        self._static_assigns = set()  # Track which static vars are ASSIGNED in this expression
        self._at_top_level = True  # Track if we're at top level (not inside if/while/etc)
        
        # Parse expression
        lexer = Lexer(expr_text)
        tokens = lexer.tokenize()
        parser = Parser(tokens)
        ast = parser.parse()
        
        # Collect variables
        self._collect_variables(ast)
        
        # Generate function
        func_name = f"expr_{expr_index}"
        code = []
        code.append(f"double {func_name}(")
        code.append("    double* ai, double* ao, double* tc, double* do_state, double* pid,")
        code.append("    double* do_out, double* ao_out,")
        code.append("    double* static_vars, double* buttonVars,")
        code.append(f"    double* local_out_{expr_index}")
        code.append(") {")
        
        self.indent_level = 1
        
        # Declare result variable
        code.append(self.indent() + "double result = 0.0;")
        code.append("")
        
        # Declare local variables
        if self.local_vars:
            code.append(self.indent() + "// Local variables")
            for var in sorted(self.local_vars):
                code.append(self.indent() + f"double {var} = 0.0;")
            code.append("")
        
        # Generate body FIRST to populate _static_assigns
        body = self.generate_statements(ast)
        
        # NOW we know which static vars are assigned, so we can declare flags
        # These need to go BEFORE the body but AFTER local vars
        if self._static_assigns:
            code.append(self.indent() + "// One-time initialization flags for static vars")
            for var_name in sorted(self._static_assigns):
                code.append(self.indent() + f"static bool {var_name}_initialized = false;")
            code.append("")
        
        # Add body
        if body:
            code.append(body)
        
        # Export local vars
        if self.local_vars:
            code.append("")
            code.append(self.indent() + "// Export local vars")
            for i, var in enumerate(sorted(self.local_vars)):
                code.append(self.indent() + f"local_out_{expr_index}[{i}] = {var};")
        
        code.append("")
        code.append(self.indent() + "return result;")
        code.append("}")
        code.append("")
        
        return "\n".join(code), list(sorted(self.local_vars)), list(sorted(self.static_vars))
    
    def _collect_variables(self, node):
        """Collect all local and static variable names"""
        if node is None:
            return
        
        if isinstance(node, list):
            for n in node:
                self._collect_variables(n)
            return
        
        if not hasattr(node, 'type'):
            return
        
        if node.type == 'ASSIGN':
            # Local variable assignment
            self.local_vars.add(node.value)
        elif node.type == 'STATIC_ASSIGN':
            # Static variable assignment
            self.static_vars.add(node.value)
        
        # Recurse into children
        if hasattr(node, 'children'):
            for child in node.children:
                self._collect_variables(child)
    
    def generate_statements(self, ast) -> str:
        """Generate code for a list of statements"""
        if isinstance(ast, list):
            lines = []
            for node in ast:
                # Skip nodes that shouldn't generate code
                if hasattr(node, 'type') and node.type == 'VAR' and isinstance(node.value, str):
                    # Skip standalone variable references that are keywords
                    if node.value.lower() in ['endif', 'else', 'then', 'if']:
                        continue
                
                code = self.generate_node(node)
                if code and code.strip():
                    # Skip bare numbers or keywords
                    stripped = code.strip()
                    if stripped in ['0.0', 'endif', 'else', 'then']:
                        continue
                    
                    # Check if this node is a value expression (not a statement)
                    is_value_expr = False
                    if hasattr(node, 'type'):
                        # Value expressions that should assign to result
                        value_types = ['VAR', 'BUTTONVAR', 'SIGNAL', 'STATIC_VAR', 'NUMBER', 
                                     'PLUS', 'MINUS', 'MULT', 'DIV', 'MOD', 'POWER', 'NEGATE',
                                     'COMPARE', 'AND', 'OR', 'NOT', 'CALL']
                        is_value_expr = node.type in value_types
                    
                    # Add semicolon and possibly assign to result
                    if not code.rstrip().endswith((';', '}', '{')):
                        if is_value_expr:
                            code = f"result = {code};"
                        else:
                            code = code + ";"
                    
                    lines.append(self.indent() + code)
            return "\n".join(lines)
        else:
            code = self.generate_node(ast)
            if code and code.strip():
                # Skip bare numbers or keywords
                stripped = code.strip()
                if stripped in ['0.0', 'endif', 'else', 'then']:
                    return ""
                
                # Check if this is a value expression
                is_value_expr = False
                if hasattr(ast, 'type'):
                    value_types = ['VAR', 'BUTTONVAR', 'SIGNAL', 'STATIC_VAR', 'NUMBER',
                                 'PLUS', 'MINUS', 'MULT', 'DIV', 'MOD', 'POWER', 'NEGATE',
                                 'COMPARE', 'AND', 'OR', 'NOT', 'CALL']
                    is_value_expr = ast.type in value_types
                
                # Add semicolon and possibly assign to result
                if not code.rstrip().endswith((';', '}', '{')):
                    if is_value_expr:
                        code = f"result = {code};"
                    else:
                        code = code + ";"
                
                return self.indent() + code
            return ""
    
    def generate_node(self, node) -> str:
        """Generate C++ code for a single AST node"""
        if node is None:
            return ""
        
        if not hasattr(node, 'type'):
            return ""
        
        node_type = node.type
        
        # Literals
        if node_type == 'NUMBER':
            return str(node.value)
        
        # Variables
        elif node_type == 'VAR':
            # Local variable reference
            return node.value
        
        elif node_type == 'STATIC_VAR':
            # static.varName -> static_vars[index]
            var_name = node.value
            if var_name not in self.staticvar_map:
                self.staticvar_map[var_name] = self.staticvar_counter
                self.staticvar_counter += 1
            index = self.staticvar_map[var_name]
            return f"static_vars[{index}]"
        
        elif node_type == 'BUTTONVAR':
            # buttonVars.name -> buttonVars[index]
            var_name = node.value
            if var_name not in self.buttonvar_map:
                self.buttonvar_map[var_name] = self.buttonvar_counter
                self.buttonvar_counter += 1
            index = self.buttonvar_map[var_name]
            return f"buttonVars[{index}]"
        
        elif node_type == 'SIGNAL':
            # AI:name or DO:name etc
            parts = node.value.split(':', 1)
            if len(parts) == 2:
                sig_type, sig_name = parts
                idx = self.signal_map.get_signal_index(sig_type, sig_name)
                array_name = sig_type.lower()
                if sig_type == 'DO':
                    array_name = 'do_state'
                return f"{array_name}[{idx}]"
            return "0.0"
        
        # Assignments
        elif node_type == 'ASSIGN':
            # varName = expr (also update result)
            var_name = node.value
            expr = self.generate_node(node.children[0]) if node.children else "0.0"
            return f"result = {var_name} = {expr};"
        
        elif node_type == 'STATIC_ASSIGN':
            # static.varName = expr
            # Only treat as initialization if: (1) at top level AND (2) constant value
            var_name = node.value
            if var_name not in self.staticvar_map:
                self.staticvar_map[var_name] = self.staticvar_counter
                self.staticvar_counter += 1
            index = self.staticvar_map[var_name]
            expr = self.generate_node(node.children[0]) if node.children else "0.0"
            
            # Check if RHS is a simple numeric constant (e.g., "35.0" or "2000.0")
            import re
            is_constant = bool(re.match(r'^-?\d+\.?\d*$', expr.strip()))
            
            # Only initialize if BOTH top-level AND constant
            if self._at_top_level and is_constant:
                # Top-level constant initialization - only execute once (e.g., static.pressureSetPoint = 35)
                if not hasattr(self, '_static_assigns'):
                    self._static_assigns = set()
                self._static_assigns.add(var_name)
                # Generate conditional initialization + read
                return f"if (!{var_name}_initialized) {{ static_vars[{index}] = {expr}; {var_name}_initialized = true; }} result = static_vars[{index}];"
            else:
                # Runtime assignment - always execute (includes resets inside if blocks)
                return f"result = static_vars[{index}] = {expr};"
        
        elif node_type == 'DO_ASSIGN':
            # "DO:name" = expr (also update result)
            sig_name = node.value
            idx = self.signal_map.get_signal_index('DO', sig_name)
            expr = self.generate_node(node.children[0]) if node.children else "0.0"
            return f"result = do_out[{idx}] = ({expr}) >= 1.0 ? 1.0 : 0.0;"
        
        elif node_type == 'AO_ASSIGN':
            # "AO:name" = expr (also update result)
            sig_name = node.value
            idx = self.signal_map.get_signal_index('AO', sig_name)
            expr = self.generate_node(node.children[0]) if node.children else "0.0"
            return f"result = ao_out[{idx}] = {expr};"
        
        # Operators
        elif node_type == 'PLUS':
            left = self.generate_node(node.children[0])
            right = self.generate_node(node.children[1])
            return f"({left} + {right})"
        
        elif node_type == 'MINUS':
            left = self.generate_node(node.children[0])
            right = self.generate_node(node.children[1])
            return f"({left} - {right})"
        
        elif node_type == 'MULT':
            left = self.generate_node(node.children[0])
            right = self.generate_node(node.children[1])
            return f"({left} * {right})"
        
        elif node_type == 'DIV':
            left = self.generate_node(node.children[0])
            right = self.generate_node(node.children[1])
            return f"({left} / {right})"
        
        elif node_type == 'MOD':
            left = self.generate_node(node.children[0])
            right = self.generate_node(node.children[1])
            return f"fmod({left}, {right})"
        
        elif node_type == 'POWER':
            left = self.generate_node(node.children[0])
            right = self.generate_node(node.children[1])
            return f"pow({left}, {right})"
        
        elif node_type == 'NEGATE':
            operand = self.generate_node(node.children[0])
            return f"(-{operand})"
        
        # Logic
        elif node_type == 'AND':
            left = self.generate_node(node.children[0])
            right = self.generate_node(node.children[1])
            return f"(({left}) && ({right}))"
        
        elif node_type == 'OR':
            left = self.generate_node(node.children[0])
            right = self.generate_node(node.children[1])
            return f"(({left}) || ({right}))"
        
        elif node_type == 'NOT':
            operand = self.generate_node(node.children[0])
            return f"(!({operand}))"
        
        elif node_type == 'COMPARE':
            op = node.value
            left = self.generate_node(node.children[0])
            right = self.generate_node(node.children[1])
            return f"({left} {op} {right})"
        
        # Control flow
        elif node_type == 'BLOCK':
            # BLOCK contains multiple statements in children
            return self.generate_statements(node.children)
        
        elif node_type == 'IF':
            # IF has: children[0]=condition, children[1]=then_body, children[2]=else_body (optional)
            condition = self.generate_node(node.children[0])
            
            code = f"if ({condition}) {{\n"
            self.indent_level += 1
            # Mark that we're inside control flow (not top level)
            was_top_level = self._at_top_level
            self._at_top_level = False
            if len(node.children) > 1 and node.children[1]:
                then_body = self.generate_statements(node.children[1])
                if then_body:
                    code += then_body + "\n"
            self.indent_level -= 1
            code += self.indent() + "}"
            
            # Else branch
            if len(node.children) > 2 and node.children[2]:
                code += " else {\n"
                self.indent_level += 1
                else_body = self.generate_statements(node.children[2])
                if else_body:
                    code += else_body + "\n"
                self.indent_level -= 1
                code += self.indent() + "}"
            
            # Restore top level flag
            self._at_top_level = was_top_level
            
            return code
        
        # Function calls
        elif node_type == 'CALL':
            func_name = node.value
            args = [self.generate_node(arg) for arg in node.children]
            args_str = ", ".join(args)
            return f"{func_name}({args_str})"
        
        else:
            return f"/* Unhandled: {node_type} */"


def compile_all_expressions(expressions_file: str, config_file: str, output_dir: str = "compiled"):
    """Compile all expressions to C++ DLL"""
    print("[CPP] ========== COMPILING EXPRESSIONS ==========")
    print(f"[CPP] expr_to_cpp.py VERSION: {__version__} (updated {__updated__})")
    print(f"[CPP] DLL Signature: 15 parameters (NEW)")
    print("[CPP] ===============================================")
    
    # Load config
    with open(config_file) as f:
        config = json.load(f)
    
    signal_map = SignalMap(config)
    print(f"[CPP] Signal map: {len(signal_map.ai_map)} AI, {len(signal_map.do_map)} DO, {len(signal_map.ao_map)} AO")
    
    # Load expressions
    with open(expressions_file) as f:
        expr_data = json.load(f)
    
    expressions = expr_data.get('expressions', [])
    print(f"[CPP] Found {len(expressions)} expressions")
    
    # Compile each
    generator = CPPCodeGenerator(signal_map)
    functions = []
    all_local_vars = {}
    all_static_vars = set()
    
    for i, expr in enumerate(expressions):
        expr_text = expr.get('expression', '')
        expr_name = expr.get('name', f'Expr{i}')
        
        print(f"[CPP] Compiling #{i}: {expr_name}")
        
        try:
            func_code, local_vars, static_vars = generator.compile_expression(expr_text, i)
            functions.append(func_code)
            all_local_vars[i] = local_vars
            all_static_vars.update(static_vars)
            
            if local_vars:
                print(f"[CPP]   Local vars: {local_vars}")
            if static_vars:
                print(f"[CPP]   Static vars: {static_vars}")
        
        except Exception as e:
            print(f"[CPP] ERROR: {e}")
            import traceback
            traceback.print_exc()
            return False
    
    # Generate batch function
    batch_func = generate_batch_function(len(expressions), all_local_vars)
    
    # Write C++ file
    output_path = Path(output_dir)
    output_path.mkdir(exist_ok=True)
    
    cpp_file = output_path / "expressions.cpp"
    
    with open(cpp_file, 'w') as f:
        f.write("""// Auto-generated C++ expression evaluator
// DO NOT EDIT

#include <cmath>
#include <algorithm>

#define EXPORT extern "C" __declspec(dllexport)

inline double clamp(double x, double lo, double hi) {
    return std::max(lo, std::min(hi, x));
}

""")
        
        # Function prototypes
        for i in range(len(expressions)):
            f.write(f"double expr_{i}(double*, double*, double*, double*, double*, double*, double*, double*, double*, double*);\n")
        
        f.write("\n// Expression functions\n\n")
        
        # Functions
        for func in functions:
            f.write(func)
            f.write("\n")
        
        # Batch function
        f.write(batch_func)
    
    print("[CPP] ✓ Generated {cpp_file}")
    
    # Write metadata with variable mappings
    metadata = {
        'num_expressions': len(expressions),
        'local_var_names': {str(k): v for k, v in all_local_vars.items()},  # FIXED: was 'local_vars'
        'static_vars': list(sorted(all_static_vars)),
        'buttonvar_map': generator.buttonvar_map,  # name -> index
        'staticvar_map': generator.staticvar_map   # name -> index
    }
    
    with open(output_path / "expr_metadata.json", 'w') as f:
        json.dump(metadata, f, indent=2)
    
    print("[CPP] ✓ Wrote metadata")
    return True


def generate_batch_function(num_exprs: int, local_vars: Dict[int, List[str]]) -> str:
    """Generate batch evaluation function with per-expression write tracking"""
    code = []
    code.append("// Batch evaluation with per-expression write tracking")
    code.append("EXPORT void evaluate_all_expressions(")
    code.append("    double* ai, double* ao, double* tc, double* do_state, double* pid,")
    code.append("    double* do_out, double* ao_out,")
    code.append("    double* static_vars, double* buttonVars,")
    code.append("    double* expr_results,")
    code.append("    double* local_vars_out,")
    code.append("    double* do_writes_per_expr,      // Flattened [50*64] - DO values written")
    code.append("    double* ao_writes_per_expr,      // Flattened [50*16] - AO values written")
    code.append("    double* do_was_written_per_expr, // Flattened [50*64] - 1.0 if DO was written")
    code.append("    double* ao_was_written_per_expr  // Flattened [50*16] - 1.0 if AO was written")
    code.append(") {")
    code.append("    // One-time initialization of static vars (TEMPORARILY DISABLED FOR DEBUG)")
    code.append("    // static bool static_vars_initialized = false;")
    code.append("    // if (!static_vars_initialized) {")
    code.append("    //     printf(\"[C++] Initializing static vars...\\\\n\");")
    code.append("    //     // Run initialization expressions ONCE to set default values")
    code.append("    //     double init_do[64], init_ao[16];")
    code.append("    //     double init_locals[500] = {0};")
    code.append("    //     for (int i = 0; i < 64; i++) init_do[i] = 0.0;")
    code.append("    //     for (int i = 0; i < 16; i++) init_ao[i] = 0.0;")
    # init_local_offset = 0
    # for i in range(num_exprs):
    #     code.append(f"        expr_{i}(ai, ao, tc, do_state, pid, init_do, init_ao, static_vars, buttonVars, init_locals + {init_local_offset});")
    #     if local_vars.get(i):
    #         init_local_offset += len(local_vars[i])
    code.append("    //     printf(\"[C++] Static vars initialized!\\\\n\");")
    code.append("    //     static_vars_initialized = true;")
    code.append("    // }")
    code.append("")
    code.append("    // Reset combined outputs")
    code.append("    for (int i = 0; i < 64; i++) { do_out[i] = 0.0; }")
    code.append("    for (int i = 0; i < 16; i++) { ao_out[i] = 0.0; }")
    code.append("")
    code.append("    // Reset per-expression write tracking (flattened arrays)")
    for i in range(num_exprs):
        code.append(f"    for (int j = 0; j < 64; j++) {{ do_writes_per_expr[{i}*64 + j] = 0.0; do_was_written_per_expr[{i}*64 + j] = 0.0; }}")
        code.append(f"    for (int j = 0; j < 16; j++) {{ ao_writes_per_expr[{i}*16 + j] = 0.0; ao_was_written_per_expr[{i}*16 + j] = 0.0; }}")
    code.append("")
    code.append("    // Temporary arrays for each expression's writes")
    code.append("    double temp_do[64];")
    code.append("    double temp_ao[16];")
    code.append("")
    code.append("    // Evaluate expressions")
    
    local_offset = 0
    for i in range(num_exprs):
        code.append(f"    // Expression {i}")
        code.append(f"    for (int j = 0; j < 64; j++) {{ temp_do[j] = -1.0; }}")  # -1 = not written yet
        code.append(f"    for (int j = 0; j < 16; j++) {{ temp_ao[j] = -999999.0; }}")  # Sentinel for not written
        code.append(f"    expr_results[{i}] = expr_{i}(ai, ao, tc, do_state, pid, temp_do, temp_ao, static_vars, buttonVars, local_vars_out + {local_offset});")
        
        # Track offset for next expression
        if local_vars.get(i):
            local_offset += len(local_vars[i])
        
        code.append(f"    // Copy this expression's writes")
        code.append(f"    for (int j = 0; j < 64; j++) {{")
        code.append(f"        if (temp_do[j] >= 0.0) {{  // Expression wrote this DO (0.0 or 1.0)")
        code.append(f"            do_out[j] = temp_do[j];  // Combined output")
        code.append(f"            do_writes_per_expr[{i}*64 + j] = temp_do[j];  // Store value (flat index)")
        code.append(f"            do_was_written_per_expr[{i}*64 + j] = 1.0;  // Mark as written (flat index)")
        code.append(f"        }}")
        code.append(f"    }}")
        code.append(f"    for (int j = 0; j < 16; j++) {{")
        code.append(f"        if (temp_ao[j] != -999999.0) {{  // Expression wrote this AO")
        code.append(f"            ao_out[j] = temp_ao[j];  // Combined output")
        code.append(f"            ao_writes_per_expr[{i}*16 + j] = temp_ao[j];  // Store value (flat index)")
        code.append(f"            ao_was_written_per_expr[{i}*16 + j] = 1.0;  // Mark as written (flat index)")
        code.append(f"        }}")
        code.append(f"    }}")
        code.append("")
    
    code.append("}")
    code.append("")
    
    return "\n".join(code)


if __name__ == "__main__":
    compile_all_expressions(
        "server/config/expressions.json",
        "server/config/config.json",
        "compiled"
    )
