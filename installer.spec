# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec for MCC DAQ Installer
Creates self-contained installer with GUI
"""

block_cipher = None

a = Analysis(
    ['installer.py'],
    pathex=[],
    binaries=[],
    datas=[
        # Include the single MCC_DAQ.exe (copied by build script before this runs)
        ('installer_bundle/dist/MCC_DAQ.exe', 'dist'),
        # Include web and config files
        ('installer_bundle/web/', 'web'),
        ('installer_bundle/server/config/', 'server/config'),
        # Include root .json and .txt files
        ('installer_bundle/*.json', '.'),
        ('installer_bundle/*.txt', '.'),
    ],
    hiddenimports=[
        'tkinter',
        'tkinter.filedialog',
        'tkinter.messagebox',
        'tkinter.ttk',
        'winshell',
        'win32com',
        'win32com.client',
        'win32com.shell',
        'win32com.shell.shell',
        'pywintypes',
        'win32api',
        'win32con',
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
    name='MCC_DAQ_Installer',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,  # No console for installer GUI
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon='web/favicon.ico' if os.path.exists('web/favicon.ico') else None,
)
