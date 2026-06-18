"""
expr_print.py
=============
Shared support for the expression-language ``print()`` function.

WHY THIS EXISTS
---------------
Expressions can call ``print("fmt", arg1, arg2, ...)`` to write a line to the
*server console* (stdout) during operation — useful for watching values that
you don't necessarily want surfaced in the browser UI.

The format string follows C ``printf`` conventions:

    print("Pressure %2.1f psi, valve=%d", static.pressure, buttonVars.valve)

This module centralizes the bits that BOTH evaluation backends need, so the
Python interpreter (expr_engine.py) and the C++ code generator
(expr_to_cpp.py) stay in agreement about what ``print`` means:

  * PRINT_FUNCS         - the set of names that are treated as a print call.
  * is_print_name()     - case-insensitive membership test.
  * parse_format_spec() - split a format string into literal/spec segments.
  * python_format()     - render a format + numeric args in Python (runtime
                          path for the interpreter backend).
  * cpp_printf_call()   - build a C ``printf(...)`` statement string for the
                          codegen backend.

DESIGN NOTES
------------
* All expression values are doubles at runtime. C-style integer specifiers
  (%d, %i, %x, %o, %c) therefore operate on the *integer part* of the value:
  - Python path: we int()-truncate before applying the spec.
  - C++ path:    we cast the argument to (int)/(long)/(unsigned) as needed.
* %s is intentionally NOT supported. Expression values are always numeric;
  there are no string variables to print, and allowing %s would just be a
  footgun (mismatched arg → crash). A %s in the format string is rejected.
* %% is a literal percent and consumes no argument (standard behavior).
* A trailing newline is appended automatically if the format string doesn't
  already end in one, so each print() call is its own console line.

__version__ history:
  1.0.0  initial — print()/printf() support for expressions
"""

__version__ = "1.0.0"
__updated__ = "2026-05-19"

import re

# Function names (lower-cased) that the parser should treat as a print call.
PRINT_FUNCS = ("print", "printf")

# A printf conversion spec:  %[flags][width][.precision][length]conversion
#   flags:       - + space # 0
#   width:       digits  (no '*' — we don't support dynamic width)
#   precision:   .digits
#   length:      l ll h hh   (accepted but ignored; everything is a double)
#   conversion:  d i u f F e E g G x X o c   (NOT s)
_SPEC_RE = re.compile(
    r"%"
    r"([-+ #0]*)"           # 1: flags
    r"(\d+)?"               # 2: width
    r"(?:\.(\d+))?"         # 3: precision
    r"(hh|h|ll|l)?"         # 4: length modifier (ignored)
    r"([diufFeEgGxXoc%])"   # 5: conversion
)

# Conversions that consume an integer argument (value is truncated to int).
_INT_CONVS = set("diuxXoc")
# Conversions that consume a floating-point argument.
_FLOAT_CONVS = set("fFeEgG")


class PrintFormatError(ValueError):
    """Raised when a print() format string is malformed or uses %s."""
    pass


def is_print_name(name: str) -> bool:
    """True if ``name`` (any case) is a print-style function."""
    return isinstance(name, str) and name.lower() in PRINT_FUNCS


def count_specifiers(fmt: str) -> int:
    """
    Return the number of argument-consuming conversion specifiers in ``fmt``.
    %% does not count. Used to validate arg counts and to warn on mismatch.
    """
    n = 0
    for m in _SPEC_RE.finditer(fmt):
        if m.group(5) != '%':
            n += 1
    return n


def validate_format(fmt: str) -> None:
    """
    Validate a format string. Raises PrintFormatError on:
      * an unsupported %s
      * a lone, malformed '%' not part of a recognized spec or '%%'
    """
    if not isinstance(fmt, str):
        raise PrintFormatError("print() format must be a string literal")

    if '%s' in fmt:
        raise PrintFormatError(
            "print() does not support %s — expression values are numeric. "
            "Use %f, %d, etc."
        )

    # Walk the string and make sure every '%' is part of a valid spec or '%%'.
    i = 0
    while i < len(fmt):
        if fmt[i] == '%':
            m = _SPEC_RE.match(fmt, i)
            if not m:
                raise PrintFormatError(
                    f"Invalid format specifier at position {i} in {fmt!r}"
                )
            i = m.end()
        else:
            i += 1


def python_format(fmt: str, args) -> str:
    """
    Render ``fmt`` with numeric ``args`` using Python string formatting,
    matching C printf semantics closely enough for diagnostics.

    Integer conversions truncate the (float) argument toward zero first.
    Returns the formatted string WITH a trailing newline guaranteed.
    """
    validate_format(fmt)

    out = []
    arg_iter = iter(args)
    i = 0
    while i < len(fmt):
        ch = fmt[i]
        if ch != '%':
            out.append(ch)
            i += 1
            continue

        m = _SPEC_RE.match(fmt, i)
        if not m:
            # validate_format() already guarantees this won't happen, but be safe
            out.append(ch)
            i += 1
            continue

        flags, width, prec, _length, conv = m.groups()
        i = m.end()

        if conv == '%':
            out.append('%')
            continue

        try:
            raw = next(arg_iter)
        except StopIteration:
            # Too few args — emit the literal spec so the problem is visible
            out.append(m.group(0))
            continue

        # Rebuild a Python-compatible spec (drop the C length modifier).
        py_spec = '%' + (flags or '') + (width or '')
        if prec is not None:
            py_spec += '.' + prec

        try:
            if conv in _INT_CONVS:
                if conv == 'c':
                    # %c — character from code point
                    out.append((py_spec + 'c') % (int(raw) & 0xFFFF,))
                else:
                    out.append((py_spec + conv) % int(raw))
            elif conv in _FLOAT_CONVS:
                out.append((py_spec + conv) % float(raw))
            else:
                out.append(m.group(0))
        except (ValueError, TypeError):
            # Bad value for this spec — show the spec literally rather than crash
            out.append(m.group(0))

    text = ''.join(out)
    if not text.endswith('\n'):
        text += '\n'
    return text


def do_print(fmt: str, args, prefix: str = "[EXPR-PRINT] ") -> str:
    """
    Format and write a print() call to stdout. Returns the formatted text
    (without the prefix) so callers can also surface it in telemetry if they
    want. Never raises — formatting problems are converted to a visible
    diagnostic line instead, because a print() should never take down a
    control loop.
    """
    try:
        text = python_format(fmt, args)
    except PrintFormatError as e:
        text = f"<print format error: {e}>\n"
    # Write without adding another newline (python_format guarantees one).
    try:
        print(prefix + text, end='')
    except Exception:
        pass
    return text


def _c_string_literal(s: str) -> str:
    """Escape a Python string into a C double-quoted string literal."""
    out = ['"']
    for ch in s:
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
        elif 32 <= ord(ch) < 127:
            out.append(ch)
        else:
            # Non-printable / non-ASCII → octal escape, safe in C string
            out.append('\\%03o' % ord(ch))
    out.append('"')
    return ''.join(out)


def cpp_printf_call(fmt: str, arg_exprs, flush: bool = True) -> str:
    """
    Build a C ``printf(...)`` statement for the codegen backend.

    ``fmt``       : the format string from the expression source.
    ``arg_exprs`` : list of already-generated C expression strings (each
                    evaluates to a double at runtime).

    Because every argument is a C ``double``, we insert casts so the value
    matches what printf expects for each conversion:
      * integer conversions (d,i,u,x,X,o,c) → cast to (long)/(unsigned long)/(int)
      * float conversions   (f,F,e,E,g,G)   → leave as double
    A 'l' length modifier is injected for integer conversions so the cast
    width and the format width agree (printf("%ld", (long)x)).

    Returns a single C statement string (no trailing newline added to the
    code text itself; a '\\n' is appended to the *format* if missing, and an
    optional fflush(stdout) follows so output appears promptly).
    """
    validate_format(fmt)

    # Ensure the printed line ends in a newline.
    if not fmt.endswith('\n'):
        fmt = fmt + '\n'

    # Rewrite integer specs to use the 'l' length modifier (we cast to long),
    # and collect the casts to apply to each argument in order.
    casts = []          # one entry per argument-consuming spec
    rebuilt = []
    i = 0
    while i < len(fmt):
        ch = fmt[i]
        if ch != '%':
            rebuilt.append(ch)
            i += 1
            continue
        m = _SPEC_RE.match(fmt, i)
        flags, width, prec, _length, conv = m.groups()
        i = m.end()
        if conv == '%':
            rebuilt.append('%%')
            continue
        spec = '%' + (flags or '') + (width or '')
        if prec is not None:
            spec += '.' + prec
        if conv in _INT_CONVS:
            if conv == 'c':
                # %c stays %c; cast arg to (int)
                rebuilt.append(spec + 'c')
                casts.append('(int)')
            elif conv in ('u', 'x', 'X', 'o'):
                rebuilt.append(spec + 'l' + conv)   # %lu, %lx, ...
                casts.append('(unsigned long)')
            else:  # d, i
                rebuilt.append(spec + 'l' + conv)   # %ld, %li
                casts.append('(long)')
        else:  # float conversions
            rebuilt.append(spec + conv)
            casts.append('(double)')

    fmt_c = _c_string_literal(''.join(rebuilt))

    # Pair each generated arg expr with its cast (defensively zip to the
    # shorter of the two — validate happens elsewhere too).
    cast_args = []
    for cast, expr in zip(casts, arg_exprs):
        cast_args.append(f"{cast}({expr})")

    if cast_args:
        call = f"printf({fmt_c}, " + ", ".join(cast_args) + ");"
    else:
        call = f"printf({fmt_c});"

    if flush:
        call += " fflush(stdout);"
    return call
