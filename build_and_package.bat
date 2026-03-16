@echo off
REM build_and_package.bat - Complete MCC ROLL DAQ Build & Package System
REM 
REM This script:
REM   1. Builds MCC_ROLL_DAQ.exe with PyInstaller
REM   2. Creates proper directory structure
REM   3. Copies all necessary files
REM   4. Packages everything into MCC_ROLL_DAQ.zip
REM
REM Requirements:
REM   - Python 3.10+
REM   - pyinstaller: pip install pyinstaller
REM
REM Output:
REM   MCC_ROLL_DAQ.zip - Ready to distribute!
REM
REM Usage:
REM   1. Run this script from project root
REM   2. Distribute MCC_ROLL_DAQ.zip
REM   3. User extracts zip and runs install.bat

echo ============================================================
echo   MCC ROLL DAQ - Build and Package System
echo ============================================================
echo.

REM =====================================================
REM VERIFY WE'RE IN CORRECT DIRECTORY
REM =====================================================
if not exist "server\server.py" (
    echo ERROR: server\server.py not found!
    echo Please run this from the project root directory.
    echo.
    pause
    exit /b 1
)

if not exist "MCC_ROLL_DAQ.spec" (
    echo ERROR: MCC_ROLL_DAQ.spec not found!
    echo Please make sure MCC_ROLL_DAQ.spec is in the root directory.
    echo.
    pause
    exit /b 1
)

echo [Step 1/6] Cleaning old builds...
if exist "build" rmdir /s /q "build"
if exist "dist" rmdir /s /q "dist"
if exist "package_temp" rmdir /s /q "package_temp"
if exist "MCC_ROLL_DAQ.zip" del /q "MCC_ROLL_DAQ.zip"
echo            Done.
echo.

echo [Step 2/6] Building executable with PyInstaller...
echo            This may take 2-5 minutes...
echo.
pyinstaller MCC_ROLL_DAQ.spec
if errorlevel 1 (
    echo.
    echo ERROR: PyInstaller build failed!
    pause
    exit /b 1
)
echo            Done.
echo.

echo [Step 3/6] Verifying build...
if not exist "dist\MCC_ROLL_DAQ.exe" (
    echo ERROR: MCC_ROLL_DAQ.exe was not created!
    pause
    exit /b 1
)
echo            Verified OK.
echo.

echo [Step 4/6] Creating package structure...
mkdir package_temp
mkdir package_temp\dist
mkdir package_temp\server
mkdir package_temp\server\config
mkdir package_temp\web

REM Copy the executable
copy /Y "dist\MCC_ROLL_DAQ.exe" "package_temp\dist\" >nul
if errorlevel 1 (
    echo ERROR: Failed to copy executable!
    pause
    exit /b 1
)

REM Copy all config files
echo            Copying config files...
copy /Y "server\config\*.json" "package_temp\server\config\" >nul 2>nul
if not exist "package_temp\server\config\config.json" (
    echo WARNING: No config.json found - creating empty directory
)

REM Copy all web files
echo            Copying web files...
copy /Y "web\index.html" "package_temp\web\" >nul 2>nul
copy /Y "web\app.js" "package_temp\web\" >nul 2>nul
copy /Y "web\styles.css" "package_temp\web\" >nul 2>nul
copy /Y "web\favicon.ico" "package_temp\web\" >nul 2>nul

REM Copy install script
echo            Copying install script...
copy /Y "install.bat" "package_temp\" >nul
if errorlevel 1 (
    echo ERROR: install.bat not found!
    pause
    exit /b 1
)

REM Create README for the package
echo            Creating README...
(
echo ============================================================
echo   MCC ROLL DAQ - Installation Package
echo ============================================================
echo.
echo CONTENTS:
echo   - install.bat       : Installation script
echo   - dist\             : Executable directory
echo   - server\config\    : Configuration files
echo   - web\              : Web interface files
echo.
echo INSTALLATION INSTRUCTIONS:
echo   1. Extract this entire zip to desired location
echo   2. Run install.bat
echo   3. Follow on-screen prompts
echo.
echo WHAT INSTALL.BAT DOES:
echo   - Copies MCC_ROLL_DAQ.exe to current directory
echo   - Creates config\ and logs\ directories
echo   - Copies web files
echo   - Creates desktop shortcut
echo   - Creates Start Menu shortcuts
echo   - Launches application
echo.
echo REQUIREMENTS:
echo   - Windows 10 or later
echo   - .NET Framework 4.5+ (usually pre-installed^)
echo.
echo FIRST RUN:
echo   After installation, the application will:
echo   - Start a local web server on port 8000
echo   - Open your default browser to http://127.0.0.1:8000
echo   - Show console window with server logs
echo.
echo CONFIGURATION:
echo   Edit files in config\ directory to customize:
echo   - config.json        : Hardware and system settings
echo   - expressions.json   : Expression definitions
echo   - pid.json           : PID controller settings
echo   - script.json        : Automation scripts
echo   - motor.json         : Motor controller settings
echo.
echo LOGS:
echo   Application logs are saved in logs\ directory
echo   Format: logs\YYYYMMDD_HHMMSS\
echo.
echo UNINSTALL:
echo   1. Delete shortcuts from Desktop and Start Menu
echo   2. Delete installation directory
echo   Note: Config files are preserved if you want to keep them
echo.
echo SUPPORT:
echo   For help and documentation, see:
echo   [Your documentation URL here]
echo.
echo ============================================================
) > "package_temp\README.txt"

echo            Done.
echo.

echo [Step 5/6] Creating ZIP package...
echo            Compressing files...

REM Use PowerShell to create zip
powershell -Command "Compress-Archive -Path 'package_temp\*' -DestinationPath 'MCC_ROLL_DAQ.zip' -Force"
if errorlevel 1 (
    echo ERROR: Failed to create ZIP file!
    echo.
    echo Trying alternative method...
    REM Try alternative method using CertUtil and tar (Windows 10+)
    cd package_temp
    tar -a -c -f "..\MCC_ROLL_DAQ.zip" *
    cd ..
)

if not exist "MCC_ROLL_DAQ.zip" (
    echo ERROR: ZIP creation failed!
    echo Package contents are in package_temp\ directory
    pause
    exit /b 1
)

echo            Done.
echo.

echo [Step 6/6] Cleaning up...
rmdir /s /q "package_temp"
echo            Done.
echo.

REM =====================================================
REM GET FILE SIZE
REM =====================================================
for %%A in ("MCC_ROLL_DAQ.zip") do set SIZE=%%~zA
set /a SIZE_MB=%SIZE% / 1048576

echo.
echo ============================================================
echo   BUILD COMPLETE!
echo ============================================================
echo.
echo Package created: MCC_ROLL_DAQ.zip
echo Size: %SIZE_MB% MB
echo.
echo Contents:
echo   - MCC_ROLL_DAQ.exe (in dist\)
echo   - install.bat
echo   - server\config\ (all .json files)
echo   - web\ (HTML, JS, CSS, favicon)
echo   - README.txt
echo.
echo ============================================================
echo   DISTRIBUTION INSTRUCTIONS:
echo ============================================================
echo.
echo 1. Give users: MCC_ROLL_DAQ.zip
echo.
echo 2. Users should:
echo    - Extract zip to desired location
echo    - Run install.bat
echo    - Follow prompts
echo.
echo 3. Installation will create:
echo    - MCC_ROLL_DAQ.exe (in extraction directory)
echo    - config\ and logs\ directories
echo    - Desktop shortcut
echo    - Start Menu shortcuts
echo.
echo ============================================================
echo.
echo Next steps:
echo   - Test the package by extracting and running install.bat
echo   - Distribute MCC_ROLL_DAQ.zip to users
echo.
echo ============================================================
echo.
pause
