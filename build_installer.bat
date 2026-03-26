@echo off
REM MCC DAQ System - Complete Build and Package Script
REM 
REM This creates a self-extracting installer with GUI dialogs
REM User can choose app name and install location
REM
REM Output: MCC_DAQ_Installer.exe (self-contained, no zip needed!)

echo ============================================================
echo   MCC DAQ System - Build Installer
echo ============================================================
echo.

REM =====================================================
REM VERIFY ENVIRONMENT
REM =====================================================
if not exist "server\server.py" (
    echo ERROR: server\server.py not found!
    echo Please run this from the project root directory.
    pause
    exit /b 1
)

if not exist "MCC_DAQ.spec" (
    echo ERROR: MCC_DAQ.spec not found!
    pause
    exit /b 1
)

if not exist "installer.spec" (
    echo ERROR: installer.spec not found!
    pause
    exit /b 1
)

echo Checking for PyInstaller...
where pyinstaller >nul 2>&1
if errorlevel 1 (
    echo.
    echo WARNING: pyinstaller command not found in PATH
    echo If build fails, install with: pip install pyinstaller pywin32 winshell
    echo.
    echo Continuing anyway...
    timeout /t 2 >nul
)
echo.

echo [Step 1/5] Cleaning old builds...
if exist "build" rmdir /s /q "build"
if exist "dist" rmdir /s /q "dist"
if exist "installer_bundle" rmdir /s /q "installer_bundle"
echo            Done.
echo.

echo [Step 2/5] Building main application...
echo            This may take 3-5 minutes...
echo.
pyinstaller MCC_DAQ.spec
if errorlevel 1 (
    echo ERROR: Application build failed!
    pause
    exit /b 1
)

if not exist "dist\MCC_DAQ.exe" (
    echo ERROR: MCC_DAQ.exe was not created!
    echo Checking what's in dist:
    dir "dist\" 2>nul
    pause
    exit /b 1
)
echo            Done.
echo.

echo [Step 3/5] Copying configuration and root files...
REM For onefile mode, config/web files will be bundled by the installer
REM Just verify the exe exists
echo            Skipping (files bundled in installer).
echo.

echo [Step 3.5/5] Verifying MCC_DAQ build...
if not exist "dist\MCC_DAQ.exe" (
    echo ERROR: dist\MCC_DAQ.exe not found!
    echo The main application build may have failed.
    pause
    exit /b 1
)
dir "dist\MCC_DAQ.exe" | find "MCC_DAQ.exe"
echo            Verified.
echo.

echo [Step 4/5] Building installer...
echo            Preparing to bundle main app...
REM Create a staging area for the installer to pick up
if not exist "installer_bundle" mkdir "installer_bundle"
if not exist "installer_bundle\dist" mkdir "installer_bundle\dist"

REM Copy the single exe file
copy /Y "dist\MCC_DAQ.exe" "installer_bundle\dist\MCC_DAQ.exe" >nul

REM Copy web and config to staging (installer will bundle these)
xcopy /E /I /Y "web" "installer_bundle\web\" >nul
xcopy /E /I /Y "server\config" "installer_bundle\server\config\" >nul

REM Copy all root .json and .txt files to staging
for %%F in (*.json) do copy /Y "%%F" "installer_bundle\" >nul 2>&1
for %%F in (*.txt) do copy /Y "%%F" "installer_bundle\" >nul 2>&1

echo            Staging complete.
echo.
echo            Building installer executable...
echo            This may take 2-3 minutes...
echo.
pyinstaller installer.spec
if errorlevel 1 (
    echo ERROR: Installer build failed!
    pause
    exit /b 1
)

if not exist "dist\MCC_DAQ_Installer.exe" (
    echo ERROR: Installer was not created!
    pause
    exit /b 1
)
echo            Done.
echo.

echo [Step 5/5] Getting file info...
REM Clean up staging area
if exist "installer_bundle" rmdir /s /q "installer_bundle"

for %%A in ("dist\MCC_DAQ_Installer.exe") do set SIZE=%%~zA
set /a SIZE_MB=%SIZE% / 1048576

echo.
echo ============================================================
echo   BUILD COMPLETE!
echo ============================================================
echo.
echo Installer created: dist\MCC_DAQ_Installer.exe
echo Size: %SIZE_MB% MB
echo.
echo This is a complete self-contained installer that includes:
echo   - Main application executable
echo   - All configuration files (config, expressions, PID, etc.)
echo   - All .json and .txt files from root (layouts, checklists)
echo   - Web interface files
echo   - Installation wizard with GUI
echo.
echo ============================================================
echo   HOW TO USE:
echo ============================================================
echo.
echo 1. Distribute: dist\MCC_DAQ_Installer.exe
echo.
echo 2. Users run it and will be prompted for:
echo    - Application name (default: MCC_DAQ)
echo    - Install location (default: current directory)
echo    - Shortcut preferences
echo.
echo 3. Installer will:
echo    - Copy application with chosen name
echo    - Create config, logs, compiled directories
echo    - Copy all config files
echo    - Copy all .json and .txt files from root
echo    - Create shortcuts (optional)
echo    - Launch application (optional)
echo.
echo ============================================================
echo.
echo Testing: You can test the installer now by running:
echo          dist\MCC_DAQ_Installer.exe
echo.
echo ============================================================
echo.
pause
