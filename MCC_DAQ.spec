# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec for MCC DAQ System
Bundles server, web files, and all dependencies into single executable
"""

block_cipher = None

a = Analysis(
    ['server/server.py'],
    pathex=[],
    binaries=[],
    datas=[
        ('web/', 'web'),  # Whole web directory
        ('server/config/', 'server/config'),  # Whole config directory
        ('server/*.py', 'server'),
    ],
    hiddenimports=[
        'win32timezone',
        'win32api',
        'win32con',
        'pywintypes',
        'winshell',
        'ctypes',
        'numpy',
        'fastapi',
        'uvicorn',
        'uvicorn.loops',
        'uvicorn.loops.auto',
        'uvicorn.protocols',
        'uvicorn.protocols.http',
        'uvicorn.protocols.http.auto',
        'uvicorn.protocols.websockets',
        'uvicorn.protocols.websockets.auto',
        'uvicorn.lifespan',
        'uvicorn.lifespan.on',
        'mcculw',
        'uldaq',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        'matplotlib',
        'pandas',
        'scipy',
        'PIL',
        'tkinter',
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,  # Include binaries IN the exe
    a.zipfiles,  # Include zipfiles IN the exe
    a.datas,     # Include data files IN the exe
    [],
    name='MCC_DAQ',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,  # Keep console for server logs
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon='web/favicon.ico' if os.path.exists('web/favicon.ico') else None,
)

# Remove COLLECT - not needed for onefile mode
