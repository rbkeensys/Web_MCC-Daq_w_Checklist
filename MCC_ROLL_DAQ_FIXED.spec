# -*- mode: python ; coding: utf-8 -*-
# PyInstaller spec file for MCC ROLL DAQ Application
# Usage: pyinstaller MCC_ROLL_DAQ.spec

import sys
from pathlib import Path

block_cipher = None

# Collect all server files
server_files = [
    ('server/app_models.py', 'server'),
    ('server/expr_engine.py', 'server'),
    ('server/expr_manager.py', 'server'),
    ('server/filters.py', 'server'),
    ('server/logger.py', 'server'),
    ('server/logic_elements.py', 'server'),
    ('server/math_ops.py', 'server'),
    ('server/mcc_bridge.py', 'server'),
    ('server/motor_controller.py', 'server'),
    ('server/pid_core.py', 'server'),
]

# Collect all web files (HTML/JS/CSS)
web_files = [
    ('web/index.html', 'web'),
    ('web/app.js', 'web'),
    ('web/styles.css', 'web'),
    ('web/favicon.ico', 'web'),
]

# NOTE: Config files are NOT included in the exe
# They will be copied to install directory by install.bat

a = Analysis(
    ['server/server.py'],  # ← CORRECT: Points to server.py source
    pathex=[],
    binaries=[],
    datas=server_files + web_files,
    hiddenimports=[
        'uvicorn',
        'uvicorn.logging',
        'uvicorn.loops',
        'uvicorn.loops.auto',
        'uvicorn.protocols',
        'uvicorn.protocols.http',
        'uvicorn.protocols.http.auto',
        'uvicorn.protocols.websockets',
        'uvicorn.protocols.websockets.auto',
        'uvicorn.lifespan',
        'uvicorn.lifespan.on',
        'fastapi',
        'pydantic',
        'websockets',
        'serial',
        'numpy',
        'starlette.applications',
        'starlette.middleware',
        'starlette.middleware.cors',
        'starlette.routing',
        'starlette.responses',
        'starlette.staticfiles',
        'starlette.websockets',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='MCC_ROLL_DAQ',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,  # Keep console visible for logs
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon='web/favicon.ico',
)
