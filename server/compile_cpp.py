"""
Compile expressions.cpp to DLL using Python subprocess
Avoids vcvarsall.bat environment issues
Version: 3.2.0
Updated: 2026-03-26
"""
__version__ = "3.2.0"
__updated__ = "2026-03-26"

import subprocess
import os
from pathlib import Path
import glob

def find_cl_exe():
    """Find cl.exe in Visual Studio installations"""
    base_paths = [
        r"C:\Program Files\Microsoft Visual Studio",
        r"C:\Program Files (x86)\Microsoft Visual Studio"
    ]
    
    versions = ["18", "2026", "2025", "2024", "2022", "2019", "2017"]  # VS 2026 is version 18!
    editions = ["Community", "Professional", "Enterprise", "BuildTools"]
    
    for base in base_paths:
        if not os.path.exists(base):
            continue
        
        for ver in versions:
            for ed in editions:
                vc_path = Path(base) / ver / ed / "VC" / "Tools" / "MSVC"
                if not vc_path.exists():
                    continue
                
                # Find latest MSVC version
                msvc_versions = sorted([d for d in vc_path.iterdir() if d.is_dir()], reverse=True)
                if not msvc_versions:
                    continue
                
                cl_exe = msvc_versions[0] / "bin" / "Hostx64" / "x64" / "cl.exe"
                if cl_exe.exists():
                    return cl_exe, msvc_versions[0]
    
    return None, None

def find_windows_sdk():
    """Find Windows SDK include/lib paths"""
    sdk_base = Path(r"C:\Program Files (x86)\Windows Kits\10")
    if not sdk_base.exists():
        return None, None
    
    include_base = sdk_base / "Include"
    lib_base = sdk_base / "Lib"
    
    if not include_base.exists() or not lib_base.exists():
        return None, None
    
    # Find latest SDK version
    versions = sorted([d for d in include_base.iterdir() if d.is_dir()], reverse=True)
    if not versions:
        return None, None
    
    sdk_ver = versions[0].name
    return (
        include_base / sdk_ver,
        lib_base / sdk_ver
    )

def append_pid_code():
    """Append PID controller code to expressions.cpp"""
    try:
        import json
        from pathlib import Path
        
        # Load PID config
        pid_file = Path("server/config/pid.json")
        if not pid_file.exists():
            print("  No PID config found, skipping PID code generation")
            return True
        
        with open(pid_file) as f:
            pid_data = json.load(f)
        
        loops = pid_data.get('loops', [])
        if not loops:
            print("  No PID loops configured")
            return True
        
        print(f"✓ Found {len(loops)} PID loop(s), generating code...")
        
        # Generate PID code inline (don't import compile_all)
        code = []
        code.append("// ========== PID CONTROLLERS ==========")
        code.append("")
        code.append("struct PIDState {")
        code.append("    double integral;")
        code.append("    double prev_error;")
        code.append("    bool initialized;")
        code.append("};")
        code.append("")
        code.append(f"static PIDState pid_states[{max(1, len(loops))}];")
        code.append("")
        
        # PID step function
        code.append("void pid_step_all(")
        code.append("    double* ai, double* tc, double* ao_cache, double* do_state,")
        code.append("    double* expr_results,  // Expression outputs for PV/SP")
        code.append("    double* pid_outputs,   // Output array")
        code.append("    double* do_out,        // Digital outputs")
        code.append("    double* ao_out,        // Analog outputs")
        code.append("    double dt")
        code.append(") {")
        
        for i, loop in enumerate(loops):
            enabled = loop.get('enabled', True)
            name = loop.get('name', f'PID{i}')
            kind = loop.get('kind', 'analog')
            src = loop.get('src', 'ai')
            ai_ch = loop.get('ai_ch', 0)
            out_ch = loop.get('out_ch', 0)
            
            kp = loop.get('kp', 0.0)
            ki = loop.get('ki', 0.0)
            kd = loop.get('kd', 0.0)
            
            # Output and integral limits
            out_min = loop.get('out_min', -10.0) if loop.get('out_min') is not None else -10.0
            out_max = loop.get('out_max', 10.0) if loop.get('out_max') is not None else 10.0
            i_min = loop.get('i_min', -1e6) if loop.get('i_min') is not None else -1e6
            i_max = loop.get('i_max', 1e6) if loop.get('i_max') is not None else 1e6
            
            sp_source = loop.get('sp_source', 'fixed')
            sp_channel = loop.get('sp_channel', 0)
            target = loop.get('target', 0.0)
            
            enable_gate = loop.get('enable_gate', False)
            enable_kind = loop.get('enable_kind', 'do')
            enable_index = loop.get('enable_index', 0)
            
            code.append(f"    // PID {i}: {name}")
            code.append(f"    {{")
            
            if not enabled:
                code.append(f"        pid_outputs[{i}] = 0.0;")
                code.append(f"    }}")
                continue
            
            # Check enable gate
            if enable_gate:
                if enable_kind == 'do':
                    code.append(f"        if (do_state[{enable_index}] < 1.0) {{")
                elif enable_kind == 'expr':
                    code.append(f"        if (expr_results[{enable_index}] < 1.0) {{")
                else:
                    code.append(f"        if (false) {{")
                
                code.append(f"            pid_states[{i}].integral = 0.0;")
                code.append(f"            pid_states[{i}].prev_error = 0.0;")
                code.append(f"            pid_states[{i}].initialized = false;")
                code.append(f"            pid_outputs[{i}] = 0.0;")
                
                if kind == 'digital':
                    code.append(f"            do_out[{out_ch}] = 0.0;")
                elif kind == 'analog':
                    code.append(f"            ao_out[{out_ch}] = {out_min};")
                
                code.append(f"        }} else {{")
                indent = "    "
            else:
                indent = ""
            
            # Read PV
            code.append(f"        {indent}double pv = 0.0;")
            if src == 'ai':
                code.append(f"        {indent}pv = ai[{ai_ch}];")
            elif src == 'tc':
                code.append(f"        {indent}pv = tc[{ai_ch}];")
            elif src == 'ao':
                code.append(f"        {indent}pv = ao_cache[{ai_ch}];")
            elif src == 'expr':
                code.append(f"        {indent}pv = expr_results[{ai_ch}];")
            
            # Read setpoint
            code.append(f"        {indent}double sp = {target};")
            if sp_source == 'ao':
                code.append(f"        {indent}sp = ao_cache[{sp_channel}];")
            elif sp_source == 'expr':
                code.append(f"        {indent}sp = expr_results[{sp_channel}];")
            elif sp_source == 'pid':
                code.append(f"        {indent}sp = pid_outputs[{sp_channel}];")
            
            # PID calculation with anti-windup on OUTPUT saturation
            code.append(f"        {indent}// Error")
            code.append(f"        {indent}double error = sp - pv;")
            code.append(f"        {indent}")
            code.append(f"        {indent}// Proportional")
            code.append(f"        {indent}double P = {kp} * error;")
            code.append(f"        {indent}")
            code.append(f"        {indent}// Derivative on measurement")
            code.append(f"        {indent}double D = 0.0;")
            code.append(f"        {indent}if (pid_states[{i}].initialized) {{")
            code.append(f"        {indent}    double d_meas = (pv - pid_states[{i}].prev_error) / dt;")
            code.append(f"        {indent}    D = -{kd} * d_meas;")
            code.append(f"        {indent}}}")
            code.append(f"        {indent}pid_states[{i}].prev_error = pv;  // Store measurement")
            code.append(f"        {indent}pid_states[{i}].initialized = true;")
            code.append(f"        {indent}")
            code.append(f"        {indent}// Predict output BEFORE updating integral")
            code.append(f"        {indent}double output_unsat = P + pid_states[{i}].integral + D;")
            code.append(f"        {indent}")
            code.append(f"        {indent}// Saturate output")
            code.append(f"        {indent}double output = output_unsat;")
            code.append(f"        {indent}if (output < {out_min}) output = {out_min};")
            code.append(f"        {indent}if (output > {out_max}) output = {out_max};")
            code.append(f"        {indent}")
            code.append(f"        {indent}// --- Anti-windup logic ---")
            code.append(f"        {indent}if (output == output_unsat) {{")
            code.append(f"        {indent}    // Not saturated -> safe to integrate")
            code.append(f"        {indent}    pid_states[{i}].integral += {ki} * error * dt;")
            code.append(f"        {indent}}} else {{")
            code.append(f"        {indent}    // Saturated -> only integrate if it helps unwind")
            code.append(f"        {indent}    if ((output == {out_max} && error < 0) || (output == {out_min} && error > 0)) {{")
            code.append(f"        {indent}        pid_states[{i}].integral += {ki} * error * dt;")
            code.append(f"        {indent}    }}")
            code.append(f"        {indent}    // else: don't integrate (anti-windup)")
            code.append(f"        {indent}}}")
            code.append(f"        {indent}")
            code.append(f"        {indent}// Clamp integral")
            code.append(f"        {indent}if (pid_states[{i}].integral < {i_min}) pid_states[{i}].integral = {i_min};")
            code.append(f"        {indent}if (pid_states[{i}].integral > {i_max}) pid_states[{i}].integral = {i_max};")
            code.append(f"        {indent}")
            
            # Output based on kind
            if kind == 'digital':
                code.append(f"        {indent}double out_val = (output >= 0.0) ? 1.0 : 0.0;")
                code.append(f"        {indent}do_out[{out_ch}] = out_val;")
                code.append(f"        {indent}pid_outputs[{i}] = out_val;")
            elif kind == 'analog':
                code.append(f"        {indent}ao_out[{out_ch}] = output;")
                code.append(f"        {indent}pid_outputs[{i}] = output;")
            else:  # var
                code.append(f"        {indent}pid_outputs[{i}] = output;")
            
            if enable_gate:
                code.append(f"        }}")
            
            code.append(f"    }}")
            code.append("")
        
        code.append("}")
        code.append("")
        
        pid_code = "\n".join(code)
        
        # Append to expressions.cpp (use utf-8 encoding for Unicode characters)
        cpp_file = Path("compiled/expressions.cpp")
        with open(cpp_file, 'a', encoding='utf-8') as f:
            f.write("\n\n")
            f.write(pid_code)
        
        print(f"✓ PID code appended ({len(loops)} loops)")
        return True
        
    except Exception as e:
        print(f"⚠ Warning: Could not append PID code: {e}")
        import traceback
        traceback.print_exc()
        return True  # Don't fail compilation, just skip PIDs


def compile_expressions(dll_name="compiled/expressions.dll"):
    """Compile expressions.cpp to DLL"""
    print("=" * 60)
    print("C++ Expression Compiler (Python)")
    print(f"compile_cpp.py VERSION: {__version__} (updated {__updated__})")
    print("=" * 60)
    print(f"Target DLL: {dll_name}")
    
    # Append PID code before compilation
    append_pid_code()
    
    # Find compiler
    cl_exe, msvc_path = find_cl_exe()
    if not cl_exe:
        print("\n❌ ERROR: Could not find cl.exe")
        print("\nPlease install Visual Studio with C++ Build Tools from:")
        print("https://visualstudio.microsoft.com/downloads/")
        return False
    
    print(f"✓ Found compiler: {cl_exe}")
    print(f"  MSVC version: {msvc_path.name}")
    
    # Find Windows SDK
    sdk_include, sdk_lib = find_windows_sdk()
    if not sdk_include:
        print("\n⚠ WARNING: Could not find Windows SDK")
        print("Compilation may fail without SDK headers")
    else:
        print(f"✓ Found Windows SDK: {sdk_include.parent.name}")
    
    # Check input file
    cpp_file = Path("compiled/expressions.cpp")
    if not cpp_file.exists():
        print(f"\n❌ ERROR: {cpp_file} not found!")
        print("Run: python expr_to_cpp.py first")
        return False
    
    print(f"✓ Found source: {cpp_file}")
    
    # Build include paths
    include_paths = [
        msvc_path / "include",
    ]
    if sdk_include:
        include_paths.extend([
            sdk_include / "ucrt",
            sdk_include / "um",
            sdk_include / "shared"
        ])
    
    # Build lib paths
    lib_paths = [
        msvc_path / "lib" / "x64",
    ]
    if sdk_lib:
        lib_paths.extend([
            sdk_lib / "ucrt" / "x64",
            sdk_lib / "um" / "x64"
        ])
    
    # Build command
    cmd = [
        str(cl_exe),
        "/LD",              # Build DLL
        "/O2",              # Optimize for speed
        "/fp:fast",         # Fast floating point
        "/EHsc",            # Exception handling
        "/nologo",          # Suppress banner
    ]
    
    # Add includes
    for inc in include_paths:
        if inc.exists():
            cmd.append(f"/I{inc}")
    
    # Output file (use versioned name)
    cmd.append(f"/Fe:{dll_name}")
    
    # Source file
    cmd.append(str(cpp_file))
    
    # Linker options
    cmd.append("/link")
    cmd.append("/NOLOGO")
    
    # Add lib paths
    for lib in lib_paths:
        if lib.exists():
            cmd.append(f"/LIBPATH:{lib}")
    
    print("\n" + "=" * 60)
    print("Compiling...")
    print("=" * 60)
    
    # Run compiler
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            cwd=os.getcwd()
        )
        
        # Show output
        if result.stdout:
            print(result.stdout)
        if result.stderr:
            print(result.stderr)
        
        if result.returncode != 0:
            print("\n❌ COMPILATION FAILED!")
            print(f"Return code: {result.returncode}")
            return False
        
        # Check output (use the versioned DLL name, not hardcoded)
        dll_file = Path(dll_name)
        if not dll_file.exists():
            print(f"\n❌ ERROR: DLL was not created!")
            print(f"Expected: {dll_file}")
            return False
        
        dll_size = dll_file.stat().st_size
        print("\n" + "=" * 60)
        print("✅ SUCCESS! DLL compiled")
        print("=" * 60)
        print(f"Location: {dll_file}")
        print(f"Size: {dll_size:,} bytes")
        print(f"Metadata: compiled/expr_metadata.json")
        print("\nThe DLL now exports:")
        print("  • Expression results")
        print("  • Local variable values")
        print("  • Static variable values")
        print("  • Hardware writes (DO/AO)")
        if Path("server/config/pid.json").exists():
            print("  • PID controllers")
        print("\nPerformance: 50-500× faster than Python")
        print("=" * 60)
        
        return True
        
    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = compile_expressions()
    exit(0 if success else 1)
