@echo off
REM build_roll_only.bat - Build MCC Roll-Mode-Only installer
REM 
REM This builds the classic roll chart viewer without scope mode or C++ features
REM
REM Requirements:
REM   - Python 3.10+
REM   - pyinstaller: pip install pyinstaller
REM   - Inno Setup 6: https://jrsoftware.org/isdl.php
REM
REM Usage:
REM   build_roll_only.bat

echo ============================================================
echo MCC Roll-Mode-Only Build Script
echo ============================================================
echo.

REM Check if in correct directory
if not exist "server\server.py" (
    echo ERROR: server\server.py not found!
    echo Please run this from the root directory of your project.
    pause
    exit /b 1
)

if not exist "MCC_Roll_Only.spec" (
    echo ERROR: MCC_Roll_Only.spec not found!
    echo Please make sure MCC_Roll_Only.spec is in the root directory.
    pause
    exit /b 1
)

echo [1/4] Cleaning old build...
if exist "build" rmdir /s /q "build"
if exist "dist\MCC_Roll_Only" rmdir /s /q "dist\MCC_Roll_Only"
echo       Done.
echo.

echo [2/4] Building with PyInstaller...
echo       This may take 2-5 minutes...
pyinstaller MCC_Roll_Only.spec
if errorlevel 1 (
    echo ERROR: PyInstaller build failed!
    pause
    exit /b 1
)
echo       Done.
echo.

echo [3/4] Verifying build...
if not exist "dist\MCC_Roll_Only\MCC_Roll_Only.exe" (
    echo ERROR: MCC_Roll_Only.exe was not created!
    pause
    exit /b 1
)

if not exist "dist\MCC_Roll_Only\web\index.html" (
    echo ERROR: Web files not copied!
    pause
    exit /b 1
)
echo       Verified OK.
echo.

echo [4/4] Build complete!
echo       Location: dist\MCC_Roll_Only\MCC_Roll_Only.exe
echo.
echo ============================================================
echo Next steps:
echo   1. Test the exe: cd dist\MCC_Roll_Only
echo                    MCC_Roll_Only.exe
echo.
echo   2. Build installer (optional):
echo      - Open MCC_Roll_Only_Setup.iss in Inno Setup Compiler
echo      - Click "Compile"
echo      - Installer will be in Output\MCC_Roll_Only_Setup.exe
echo ============================================================
echo.

pause
