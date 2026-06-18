# MCC DAQ System - Build Instructions

## Overview

This build system creates a **self-contained installer** with a GUI that prompts users for:
- Application name (e.g., "MyDAQ", "Test_System", etc.)
- Install location
- Shortcut preferences

The installer bundles **everything** including current config, layout, and checklist files.

## Requirements

```bash
pip install pyinstaller pywin32 winshell
```

## Building the Installer

### Quick Build (Recommended)

```bash
build_installer.bat
```

This creates: `dist/MCC_DAQ_Installer.exe`

### Manual Build Steps

If you need more control:

```bash
# 1. Build main application
pyinstaller MCC_DAQ.spec

# 2. Copy current config files to dist
xcopy /Y /I server\config\*.json dist\MCC_DAQ\server\config\
xcopy /Y layout*.json dist\MCC_DAQ\
xcopy /Y checklist*.json dist\MCC_DAQ\

# 3. Build installer
pyinstaller installer.spec
```

## What Gets Built

### Main Application (`MCC_DAQ.spec`)
- Server code bundled into executable
- Web interface files included
- All Python dependencies embedded
- Creates: `dist/MCC_DAQ/MCC_DAQ.exe`

### Installer (`installer.spec`)
- GUI installer with tkinter dialogs
- Bundles the entire `dist/MCC_DAQ/` directory
- Includes current config, layout, and checklist
- Creates: `dist/MCC_DAQ_Installer.exe` (single file!)

## Distribution

**Distribute only:** `dist/MCC_DAQ_Installer.exe`

Users run it and get:
1. GUI dialog to choose application name
2. GUI dialog to choose install location
3. Options for shortcuts and auto-launch
4. Complete installation

## User Experience

### Installation Dialog

```
┌─────────────────────────────────────┐
│  MCC DAQ System Installer           │
├─────────────────────────────────────┤
│                                     │
│ Application Name:                   │
│ [MCC_DAQ        ].exe               │
│                                     │
│ Install Location:                   │
│ [C:\Users\...   ] [Browse...]       │
│                                     │
│ ☑ Create shortcuts                  │
│ ☑ Launch after installation         │
│                                     │
│         [Cancel]  [Install]         │
└─────────────────────────────────────┘
```

### What Gets Installed

```
<chosen_location>/
├── <app_name>.exe           # Renamed based on user input
├── config/                  # Config files
│   ├── config.json
│   ├── expressions.json
│   ├── pid.json
│   ├── script.json
│   └── motor.json
├── layout*.json             # Current layout
├── checklist*.json          # Current checklist
├── logs/                    # Created empty
├── compiled/                # Created empty (for C++ expr hot-reload)
└── web/                     # Web interface
    ├── index.html
    ├── app.js
    ├── styles.css
    └── favicon.ico
```

## Customization

### Change Default App Name

Edit `installer.py`:
```python
self.app_name = tk.StringVar(value="YOUR_NAME_HERE")
```

### Change Default Install Location

Edit `installer.py`:
```python
self.install_dir = tk.StringVar(value=r"C:\Your\Path\Here")
```

### Include Additional Files

Edit `MCC_DAQ.spec` or `installer.spec`:
```python
datas=[
    ('your_file.txt', '.'),
    ('your_folder/*', 'your_folder'),
],
```

## Troubleshooting

### "PyInstaller not found"
```bash
pip install pyinstaller
```

### "Module not found" errors during build
```bash
pip install pywin32 winshell
```

### Installer doesn't find executable
Check that `dist/MCC_DAQ/MCC_DAQ.exe` exists after step 2

### Want to test without rebuilding
```bash
# Test just the installer (must have dist/MCC_DAQ/ from previous build)
pyinstaller installer.spec
dist\MCC_DAQ_Installer.exe
```

## Advanced: Two-Stage Build

If you want to build main app once, then rebuild installer multiple times:

```bash
# Build main app (slow, do once)
pyinstaller MCC_DAQ.spec

# Update config files
copy my_new_config.json dist\MCC_DAQ\config\

# Rebuild installer (fast, includes new config)
pyinstaller installer.spec
```

## File Sizes

Typical sizes:
- Main application: ~30-50 MB
- Installer (includes app): ~30-50 MB (similar, single file)

The installer is a **single .exe** that unpacks and installs everything.

## Notes

- Installer uses **GUI dialogs** (tkinter) - no command line interaction
- User can install multiple times with **different names** to same location
- Old DLL files from hot-reload will accumulate in `compiled/` - safe to delete manually
- Config files are copied from build machine - user gets your current settings
- Layout and checklist are included - user starts with your current setup

## Support

For issues, check:
1. All files exist before building
2. PyInstaller installed (`pip install pyinstaller`)
3. Building from project root directory
4. No spaces in file paths (can cause issues)
