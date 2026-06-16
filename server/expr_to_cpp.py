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

__version__ = "3.3.0"
__updated__ = "2026-06-15"  # 3.3.2: unknown AO/AI signal warnings now list the available channel names (diagnostic for name mismatches). 3.3.1: AO signal map now includes ALL analog-output channels regardless of the include flag (matches DO handling) and indexes them by physical position to align with the AO snapshot array (get_ao_snapshot/_ao_vals) -- fixes "AO:Name" reads returning 0.0 in expressions when the channel was not include-flagged. 3.3.0: restored Scale: support in the compiled DLL -- scale_map in SignalMap (reads scales.json), SCALE handled in get_signal_index, a 16th double* scale parameter threaded through per-expr + batch C++ signatures and the batch call site, scales.json loaded by compile_all_expressions, scale_map written to metadata. "Scale:Name" now emits scale[index] and reads the real serial-scale value. Keeps the 3.2.3 print/printf/min/max fixes. DLL signature 15 -> 16 params (delete any stale expressions.dll). 3.2.3: print()/printf() with a leading MESSAGE string now emit a real printf (your expressions use print("text", args) logging) instead of printf(0.0); integer format specifiers (%d etc.) are coerced to %g since all expression values are doubles; printf is treated as an alias of print; a quoted string that is not a real TYPE:name reference resolves to 0.0 instead of being mis-parsed as a signal (fixes the "min lox not reached[0]" garble from messages containing a colon). Scale: refs still emit a 0.0 placeholder (no scale array in the DLL signature) and are reported by name at build time. 3.2.2: compile_all_expressions() accepts scales_file= and **kwargs so a newer server.py passing scales_file does not crash with TypeError. This generator does not emit C++ for Scale: refs; it warns if any expression uses one. 3.2.1: CALL codegen now translates min/max to std::min/std::max with double casts, and print(...) to an expr_print/expr_print_multi helper (added to the C++ prelude with <cstdio>/<cstdarg>). Fixes C3861 'print' / 'min' not found and the printf double-arg error when expressions use print()/min()/max(). The bare func-name passthrough only ever worked for <cmath> names.

import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Dict, List, Tuple, Optional, Set

# Import expression engine
sys.path.insert(0, str(Path(__file__).parent / "server"))
from expr_engine import Lexer, Parser


_VFD_CMD_TOKENS = {"ENABLE","DISABLE","RUN","STOP","RPM","HZ","FREQ","DIR","DIRECTION","REVERSE","REV","FORWARD","FWD","FAULT_RESET","RESET"}  # semantic VFD write targets (routed to controller methods)

class SignalMap:
    """Maps signal names to array indices"""
    
    def __init__(self, config: Dict, scales_cfg: Optional[List[Dict]] = None):
        self.ai_map = {}
        self.ao_map = {}
        self.do_map = {}
        self.tc_map = {}
        self.pid_map = {}
        self.scale_map = {}  # Serial scale name -> index (read-only inputs)
        
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
            
            # Include ALL AOs regardless of include flag (expressions may
            # reference them), indexed by physical position so the index matches
            # the AO snapshot array (get_ao_snapshot/_ao_vals). Mirrors DO above.
            for ch in board.get('analogOutputs', []):
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

        # Serial scales come from scales.json (separate from board config).
        # Index i corresponds to the value SerialScaleManager.get_values()[i].
        if scales_cfg:
            for i, sc in enumerate(scales_cfg):
                name = sc.get('name', f'Scale{i}')
                self.scale_map[name] = i
    
    def get_signal_index(self, sig_type: str, sig_name: str) -> int:
        """Get array index for a signal"""
        sig_type = sig_type.upper()
        
        if sig_type == 'AI':
            if sig_name in self.ai_map:
                return self.ai_map[sig_name]
            elif sig_name.isdigit():
                return int(sig_name)
            else:
                print(f"[CPP-WARN] Unknown AI signal '{sig_name}' not in config, using index 0")
                print(f"[CPP-WARN] Available AIs: {list(self.ai_map.keys())}")
                return 0
        elif sig_type == 'AO':
            if sig_name in self.ao_map:
                return self.ao_map[sig_name]
            elif sig_name.isdigit():
                return int(sig_name)
            else:
                print(f"[CPP-WARN] Unknown AO signal '{sig_name}' not in config, using index 0")
                print(f"[CPP-WARN] Available AOs: {list(self.ao_map.keys())}")
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
        elif sig_type == 'SCALE':
            if sig_name in self.scale_map:
                return self.scale_map[sig_name]
            elif sig_name.isdigit():
                return int(sig_name)
            else:
                print(f"[CPP-WARN] Unknown Scale signal: {sig_name}, using index 0")
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
        # VFD register/param reads (vfd_in[]) and writes (vfd_out[]) -- approach B
        self.vfd_reads = []        # ordered [{drive,token,kind}]; index = position
        self.vfd_read_index = {}   # canonical key -> index
        self.vfd_writes = []       # ordered [{drive,token,kind}]
        self.vfd_write_index = {}
    
    import re as _re
    _VFD_RE = _re.compile(r'^(?:VFD:)?([A-Za-z0-9_\- ]+?)(\.[A-Za-z0-9_.]+|#0[xX][0-9A-Fa-f]+|#[0-9]+)$')
    def _parse_vfd_inquote(self, value):
        m = self._VFD_RE.match(str(value).strip())
        if not m: return (None, None, None)
        name = m.group(1).strip(); ref = m.group(2)
        if ref.startswith('#'): return (name, ref, 'raw')
        return (name, ref[1:], 'param')
    def _vfd_read_idx(self, drive, token, kind):
        key = kind + ':' + drive + '.' + token
        if key not in self.vfd_read_index:
            self.vfd_read_index[key] = len(self.vfd_reads)
            self.vfd_reads.append({'drive': drive, 'token': token, 'kind': kind})
        return self.vfd_read_index[key]
    def _vfd_write_idx(self, drive, token, kind, cmd=None):
        key = (cmd or kind) + ':' + drive + '.' + token
        if key not in self.vfd_write_index:
            self.vfd_write_index[key] = len(self.vfd_writes)
            self.vfd_writes.append({'drive': drive, 'token': token, 'kind': kind, 'cmd': cmd})
        return self.vfd_write_index[key]

    def indent(self) -> str:
        return "    " * self.indent_level

    _KNOWN_SIG_TYPES = ('AI', 'AO', 'DO', 'TC', 'PID', 'MATH', 'LE', 'EXPR', 'SCALE')

    def _is_real_signal(self, sigval: str) -> bool:
        """True if a SIGNAL string is a real 'TYPE:name' reference (known type),
        False if it is free text (a print message that merely happens to be
        quoted, possibly containing a ':')."""
        if ':' not in sigval:
            return False
        head = sigval.split(':', 1)[0].strip().upper()
        return head in self._KNOWN_SIG_TYPES

    @staticmethod
    def _coerce_printf_format(fmt: str) -> str:
        """All expression values are C doubles. Rewrite integer/char format
        specifiers (%d %i %u %x %X %o %c) to %g so doubles print correctly and
        MSVC does not error on type mismatch. Leaves %f/%g/%e and width/precision
        forms like %3.1f intact. %% is preserved."""
        import re as _re
        def repl(m):
            spec = m.group(0)
            if spec == '%%':
                return spec
            conv = spec[-1]
            if conv in 'diouxXc':
                # keep any flags/width but drop precision that is invalid for %g?
                # Simplest robust choice: replace the whole specifier with %g,
                # preserving leading flags/width (not precision) is overkill;
                # %g is fine for logging.
                return '%g'
            return spec
        return _re.sub(r'%[-+ 0-9.#]*[diouxXeEfFgGcs%]', repl, fmt)

    @staticmethod
    def _c_string_escape(text: str) -> str:
        """Escape a Python string for embedding as a C string literal."""
        out = []
        for ch in text:
            if ch == '\\':
                out.append('\\\\')
            elif ch == '"':
                out.append('\\"')
            elif ch == '\n':
                out.append('\\n')
            elif ch == '\r':
                out.append('\\r')
            elif ch == '\t':
                out.append('\\t')
            else:
                out.append(ch)
        return ''.join(out)
    
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
        code.append("    double* scale,")
        code.append("    double* vfd_in, double* vfd_out,")
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
            if isinstance(node.value, str) and node.value[:4].upper() == 'VFD:':
                drive, token, kind = self._parse_vfd_inquote(node.value)
                if drive is not None:
                    return f"vfd_in[{self._vfd_read_idx(drive, token, kind)}]"
                return "0.0"
            # AI:name / DO:name / Scale:name etc. A quoted string that is NOT a
            # real "TYPE:name" reference (e.g. a print message) resolves to 0.0
            # rather than being mis-parsed as a signal.
            if not self._is_real_signal(node.value):
                return "0.0"
            sig_type, sig_name = node.value.split(':', 1)
            sig_type_u = sig_type.strip().upper()
            idx = self.signal_map.get_signal_index(sig_type_u, sig_name)
            array_name = sig_type_u.lower()
            if sig_type_u == 'DO':
                array_name = 'do_state'
            return f"{array_name}[{idx}]"
        
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

        elif node_type == 'SIGNAL_PROP':
            # "VFD:Name".RPM etc. -> live status read via vfd_in[]; others -> 0.0
            ref, prop = node.value if isinstance(node.value, (tuple, list)) else (node.value, '')
            if isinstance(ref, str) and ref[:4].upper() == 'VFD:':
                drive = ref.split(':', 1)[1].strip()
                return f"vfd_in[{self._vfd_read_idx(drive, str(prop).upper(), 'status')}]"
            return "0.0"

        elif node_type == 'VFD_ASSIGN':
            # "VFD:Name.token" = expr -> queue via vfd_out[] (NaN sentinel = unwritten)
            drive, token, kind = self._parse_vfd_inquote(node.value)
            expr = self.generate_node(node.children[0]) if node.children else "0.0"
            if drive is None:
                return f"result = ({expr});"
            cmd = token.upper() if (token and token.upper() in _VFD_CMD_TOKENS) else None
            if cmd: kind = 'cmd'
            idx = self._vfd_write_idx(drive, token, kind, cmd)
            return f"result = vfd_out[{idx}] = {expr};"
        
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
            func_name = (node.value or "").lower()
            args = [self.generate_node(arg) for arg in node.children]
            args_str = ", ".join(args)

            # min/max must be std:: and operate on doubles (bare min/max are
            # undeclared in C++ here; passing ints/doubles also needs care).
            if func_name == 'min':
                if len(args) >= 2:
                    expr = args[0]
                    for a in args[1:]:
                        expr = f"std::min((double)({expr}), (double)({a}))"
                    return expr
                return args[0] if args else "0.0"
            if func_name == 'max':
                if len(args) >= 2:
                    expr = args[0]
                    for a in args[1:]:
                        expr = f"std::max((double)({expr}), (double)({a}))"
                    return expr
                return args[0] if args else "0.0"

            # print(...) -> printf to the C runtime stdout (captured by the
            # console fd-capture and forwarded to the browser console widget).
            #
            # Your expressions use printf-style logging:
            #   print("Starting TEST")
            #   print("Min LOX not reached: %f", L0)
            #   print("Fuel(%d) -> %d", fuelOut, state)
            # The FIRST argument is a message/format string (a string-literal
            # SIGNAL node). If present, we emit a real printf with that format
            # and the remaining numeric args. If there is no leading string, we
            # fall back to the numeric expr_print helpers.
            if func_name in ('print', 'printf'):
                children = node.children
                if children and children[0].type == 'SIGNAL' \
                        and not self._is_real_signal(children[0].value):
                    fmt = self._c_string_escape(self._coerce_printf_format(children[0].value))
                    rest = [self.generate_node(c) for c in children[1:]]
                    # printf returns an int; cast to double so print() is usable
                    # inline and matches the expression engine's double type.
                    if rest:
                        joined = ", ".join(rest)
                        return f'(double)printf("[EXPR] {fmt}\\n", {joined})'
                    return f'(double)printf("[EXPR] {fmt}\\n")'
                # No leading message string: numeric print.
                if len(args) == 0:
                    return "expr_print(0.0)"
                if len(args) == 1:
                    return f"expr_print({args[0]})"
                inner = ", ".join(args)
                return f"expr_print_multi({len(args)}, {inner})"

            # Direct <cmath> functions pass through unchanged.
            return f"{func_name}({args_str})"
        
        else:
            return f"/* Unhandled: {node_type} */"


def compile_all_expressions(expressions_file: str, config_file: str, output_dir: str = "compiled",
                            scales_file: str = None, **_kwargs):
    """Compile all expressions to C++ DLL.

    scales_file: optional path to scales.json (separate from config.json). If
    None, the function looks for scales.json next to config_file. Missing
    scales.json is fine -- scale_map is empty and Scale: refs warn. Serial scale
    values are read in compiled expressions via "Scale:Name" -> scale[index],
    where index matches the order in scales.json (== SerialScaleManager order).
    """
    import os as _os
    print("[CPP] ========== COMPILING EXPRESSIONS ==========")
    print(f"[CPP] expr_to_cpp.py VERSION: {__version__} (updated {__updated__})")
    print(f"[CPP] DLL Signature: 18 parameters (adds vfd_in[]/vfd_out[])")
    print("[CPP] ===============================================")
    
    # Load config
    with open(config_file) as f:
        config = json.load(f)

    # Load scales config (separate file). If not provided, look next to config.
    scales_cfg = []
    if scales_file is None:
        scales_file = _os.path.join(_os.path.dirname(config_file), "scales.json")
    try:
        with open(scales_file) as f:
            scales_cfg = json.load(f).get("scales", [])
    except (FileNotFoundError, ValueError):
        scales_cfg = []

    signal_map = SignalMap(config, scales_cfg)
    print(f"[CPP] Signal map: {len(signal_map.ai_map)} AI, {len(signal_map.do_map)} DO, "
          f"{len(signal_map.ao_map)} AO, {len(signal_map.tc_map)} TC, "
          f"{len(signal_map.scale_map)} Scale")
    
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
#include <cstdio>
#include <cstdarg>

#define EXPORT extern "C" __declspec(dllexport)

inline double clamp(double x, double lo, double hi) {
    return std::max(lo, std::min(hi, x));
}

// print(x) from expressions: write to the C runtime stdout (the server's
// console fd-capture forwards this to the browser console widget) and return
// the value so print() can be used inline in an expression.
inline double expr_print(double x) {
    printf("[EXPR] %g\\n", x);
    fflush(stdout);
    return x;
}

// print(a, b, ...): print each value, return the last.
inline double expr_print_multi(int n, ...) {
    va_list ap;
    va_start(ap, n);
    double last = 0.0;
    for (int i = 0; i < n; ++i) {
        last = va_arg(ap, double);
        printf("[EXPR] %g%s", last, (i + 1 < n) ? " " : "\\n");
    }
    va_end(ap);
    fflush(stdout);
    return last;
}

""")
        
        # Function prototypes
        for i in range(len(expressions)):
            f.write(f"double expr_{i}(double*, double*, double*, double*, double*, double*, double*, double*, double*, double*, double*, double*, double*);\n")
        
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
        'staticvar_map': generator.staticvar_map,  # name -> index
        'scale_map': signal_map.scale_map,         # Scale name -> index (scales.json order)
        'vfd_read_refs': generator.vfd_reads,      # ordered [{drive,token,kind}] -> vfd_in[] index
        'vfd_write_refs': generator.vfd_writes     # ordered [{drive,token,kind}] -> vfd_out[] index
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
    code.append("    double* scale,")
    code.append("    double* vfd_in, double* vfd_out,")
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
        code.append(f"    expr_results[{i}] = expr_{i}(ai, ao, tc, do_state, pid, temp_do, temp_ao, scale, vfd_in, vfd_out, static_vars, buttonVars, local_vars_out + {local_offset});")
        
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
