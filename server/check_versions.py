"""
Version Checker - Diagnose file version mismatches
Run this BEFORE starting server to verify all files are compatible
"""

import sys
from pathlib import Path

def check_version(filepath, expected_min_version=None):
    """Check version of a Python file"""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read(500)  # Read first 500 chars
            
        # Look for version markers
        for line in content.split('\n')[:30]:
            if '__version__' in line or 'Version:' in line:
                print(f"  {filepath}: {line.strip()}")
                return True
        
        print(f"  {filepath}: ⚠️  NO VERSION FOUND")
        return False
    except Exception as e:
        print(f"  {filepath}: ❌ ERROR - {e}")
        return False

print("=" * 70)
print("VERSION COMPATIBILITY CHECK")
print("=" * 70)

print("\n📋 CHECKING PYTHON FILES:")
check_version("expr_to_cpp.py")
check_version("compile_cpp.py")
check_version("cpp_expr_backend.py")
check_version("server/server.py")

print("\n📁 CHECKING COMPILED OUTPUT:")
dll_path = Path("compiled/expressions.dll")
metadata_path = Path("compiled/expr_metadata.json")
cpp_path = Path("compiled/expressions.cpp")

if dll_path.exists():
    import os
    mtime = os.path.getmtime(dll_path)
    from datetime import datetime
    dt = datetime.fromtimestamp(mtime)
    print(f"  ✓ expressions.dll exists (modified: {dt.strftime('%Y-%m-%d %H:%M:%S')})")
else:
    print(f"  ❌ expressions.dll MISSING - Run: python compile_cpp.py")

if metadata_path.exists():
    print(f"  ✓ expr_metadata.json exists")
    import json
    with open(metadata_path) as f:
        meta = json.load(f)
    print(f"     Expressions: {meta.get('num_expressions', 'unknown')}")
    print(f"     StaticVars: {len(meta.get('staticvar_map', {}))} - {list(meta.get('staticvar_map', {}).keys())}")
else:
    print(f"  ❌ expr_metadata.json MISSING - Run: python expr_to_cpp.py")

if cpp_path.exists():
    print(f"  ✓ expressions.cpp exists")
    # Check signature
    with open(cpp_path) as f:
        cpp_code = f.read(2000)
    if 'do_was_written_per_expr' in cpp_code:
        print(f"     ✓ Uses NEW 15-parameter signature")
    elif 'buttonVars' in cpp_code:
        print(f"     ⚠️  Uses OLD 11-parameter signature (needs update)")
    else:
        print(f"     ⚠️  Uses ANCIENT 10-parameter signature (needs update)")
else:
    print(f"  ❌ expressions.cpp MISSING - Run: python expr_to_cpp.py")

print("\n" + "=" * 70)
print("DIAGNOSIS:")
print("=" * 70)

# Check cpp_expr_backend version
try:
    import cpp_expr_backend
    version = getattr(cpp_expr_backend, '__version__', 'unknown')
    print(f"\ncpp_expr_backend.py version: {version}")
    
    if version == "3.2.0":
        print("  → Expects 15-parameter DLL signature")
        if cpp_path.exists():
            with open(cpp_path) as f:
                cpp_code = f.read(2000)
            if 'do_was_written_per_expr' not in cpp_code:
                print("\n❌ MISMATCH DETECTED!")
                print("   cpp_expr_backend.py expects NEW signature")
                print("   but expressions.cpp has OLD signature")
                print("\n   FIX: Run these commands:")
                print("   1. python expr_to_cpp.py")
                print("   2. python compile_cpp.py")
                sys.exit(1)
    elif version == "3.2.0-compat":
        print("  → Expects 10-parameter DLL signature (backward compatible)")
        
except ImportError as e:
    print(f"\n⚠️  Cannot import cpp_expr_backend: {e}")

print("\n✓ All files appear compatible")
print("=" * 70)
