@echo off
REM MCC ROLL DAQ Complete Installer
REM Installs to CURRENT DIRECTORY (wherever this bat file is located)

echo ============================================
echo   MCC ROLL DAQ - Installation
echo ============================================
echo.

REM Get the directory where THIS batch file is located
set INSTALL_DIR=%~dp0
REM Remove trailing backslash if present
if "%INSTALL_DIR:~-1%"=="\" set INSTALL_DIR=%INSTALL_DIR:~0,-1%

echo Installation directory: %INSTALL_DIR%
echo.
echo This will install to the CURRENT directory where install.bat is located.
echo.
echo This will:
echo   1. Copy executable to current folder
echo   2. Create config\ and logs\ subdirectories here
echo   3. Copy all web files here
echo   4. Create desktop shortcut
echo   5. Create Start Menu shortcuts
echo   6. Launch the application
echo.
pause

REM =====================================================
REM CREATE ALL DIRECTORIES
REM =====================================================
echo Creating directories...
if not exist "%INSTALL_DIR%\config" mkdir "%INSTALL_DIR%\config"
if not exist "%INSTALL_DIR%\logs" mkdir "%INSTALL_DIR%\logs"
if not exist "%INSTALL_DIR%\web" mkdir "%INSTALL_DIR%\web"

REM =====================================================
REM CHECK FOR EXECUTABLE IN DIST FOLDER
REM =====================================================
if not exist "%INSTALL_DIR%\dist\MCC_ROLL_DAQ.exe" (
    echo.
    echo ERROR: dist\MCC_ROLL_DAQ.exe not found!
    echo.
    echo Looking for: %INSTALL_DIR%\dist\MCC_ROLL_DAQ.exe
    echo.
    echo Make sure you extracted the entire zip file and
    echo that dist\MCC_ROLL_DAQ.exe is present.
    echo.
    pause
    exit /b 1
)

REM =====================================================
REM COPY MAIN EXECUTABLE TO INSTALL DIR
REM =====================================================
echo Copying executable from dist\ to current directory...
copy /Y "%INSTALL_DIR%\dist\MCC_ROLL_DAQ.exe" "%INSTALL_DIR%\" >nul
if errorlevel 1 (
    echo ERROR: Failed to copy MCC_ROLL_DAQ.exe
    pause
    exit /b 1
)
echo Done.

REM =====================================================
REM COPY ALL CONFIG FILES
REM =====================================================
echo Copying config files...
if exist "%INSTALL_DIR%\server\config\*.json" (
    copy /Y "%INSTALL_DIR%\server\config\*.json" "%INSTALL_DIR%\config\" >nul 2>nul
    echo Config files copied.
) else (
    echo WARNING: No config files found in server\config\
    echo Creating empty config directory...
)

REM =====================================================
REM COPY ALL WEB FILES
REM =====================================================
echo Copying web files...
if exist "%INSTALL_DIR%\web\index.html" (
    REM Web files are already in the right place from extraction
    echo Web files already present.
) else (
    echo ERROR: Web files not found!
    echo Looking for: %INSTALL_DIR%\web\index.html
    pause
    exit /b 1
)

REM =====================================================
REM CREATE DESKTOP SHORTCUT WITH ICON
REM =====================================================
echo Creating desktop shortcut...

REM Determine icon path (use favicon.ico if it exists)
set ICON_PATH=%INSTALL_DIR%\web\favicon.ico
if not exist "%ICON_PATH%" set ICON_PATH=%INSTALL_DIR%\MCC_ROLL_DAQ.exe

powershell -Command "$WshShell = New-Object -comObject WScript.Shell; $Shortcut = $WshShell.CreateShortcut('%USERPROFILE%\Desktop\MCC ROLL DAQ.lnk'); $Shortcut.TargetPath = '%INSTALL_DIR%\MCC_ROLL_DAQ.exe'; $Shortcut.WorkingDirectory = '%INSTALL_DIR%'; $Shortcut.IconLocation = '%ICON_PATH%'; $Shortcut.Description = 'MCC ROLL DAQ Control System'; $Shortcut.Save()" >nul 2>&1
echo Desktop shortcut created.

REM =====================================================
REM CREATE START MENU SHORTCUTS
REM =====================================================
echo Creating Start Menu shortcuts...
if not exist "%APPDATA%\Microsoft\Windows\Start Menu\Programs\MCC ROLL DAQ" mkdir "%APPDATA%\Microsoft\Windows\Start Menu\Programs\MCC ROLL DAQ"

powershell -Command "$WshShell = New-Object -comObject WScript.Shell; $Shortcut = $WshShell.CreateShortcut('%APPDATA%\Microsoft\Windows\Start Menu\Programs\MCC ROLL DAQ\MCC ROLL DAQ.lnk'); $Shortcut.TargetPath = '%INSTALL_DIR%\MCC_ROLL_DAQ.exe'; $Shortcut.WorkingDirectory = '%INSTALL_DIR%'; $Shortcut.IconLocation = '%ICON_PATH%'; $Shortcut.Description = 'MCC ROLL DAQ Control System'; $Shortcut.Save()" >nul 2>&1

powershell -Command "$WshShell = New-Object -comObject WScript.Shell; $Shortcut = $WshShell.CreateShortcut('%APPDATA%\Microsoft\Windows\Start Menu\Programs\MCC ROLL DAQ\Config Folder.lnk'); $Shortcut.TargetPath = '%INSTALL_DIR%\config'; $Shortcut.Description = 'Open MCC ROLL DAQ Config Folder'; $Shortcut.Save()" >nul 2>&1

powershell -Command "$WshShell = New-Object -comObject WScript.Shell; $Shortcut = $WshShell.CreateShortcut('%APPDATA%\Microsoft\Windows\Start Menu\Programs\MCC ROLL DAQ\Logs Folder.lnk'); $Shortcut.TargetPath = '%INSTALL_DIR%\logs'; $Shortcut.Description = 'Open MCC ROLL DAQ Logs Folder'; $Shortcut.Save()" >nul 2>&1

echo Start Menu shortcuts created.

REM =====================================================
REM VERIFY INSTALLATION
REM =====================================================
echo.
echo Verifying installation...
set INSTALL_OK=1

if not exist "%INSTALL_DIR%\MCC_ROLL_DAQ.exe" (
    echo ERROR: MCC_ROLL_DAQ.exe not in install directory!
    set INSTALL_OK=0
)

if not exist "%INSTALL_DIR%\config" (
    echo ERROR: config directory not created!
    set INSTALL_OK=0
)

if not exist "%INSTALL_DIR%\web" (
    echo ERROR: web directory missing!
    set INSTALL_OK=0
)

if %INSTALL_OK%==0 (
    echo.
    echo Installation FAILED!
    echo.
    echo Install directory was: %INSTALL_DIR%
    echo.
    pause
    exit /b 1
)

REM =====================================================
REM INSTALLATION COMPLETE
REM =====================================================
echo.
echo ============================================
echo   Installation Complete!
echo ============================================
echo.
echo Installed to: %INSTALL_DIR%
echo.
echo Files in this directory:
echo   - MCC_ROLL_DAQ.exe  (copied from dist\)
echo   - config\           (configuration files)
echo   - logs\             (created, will store logs)
echo   - web\              (web interface)
echo.
echo Shortcuts created:
echo   - Desktop: MCC ROLL DAQ.lnk
echo   - Start Menu: MCC ROLL DAQ folder
echo.
echo ============================================
echo.
echo Starting MCC ROLL DAQ now...
echo.

REM =====================================================
REM LAUNCH APPLICATION
REM =====================================================
start "" "%INSTALL_DIR%\MCC_ROLL_DAQ.exe"

echo Waiting for server to start...
timeout /t 5 >nul

echo Opening browser...
start http://127.0.0.1:8000

echo.
echo ============================================
echo   MCC ROLL DAQ is now running!
echo ============================================
echo.
echo Console window shows server logs.
echo.
echo If browser didn't open, go to: http://127.0.0.1:8000
echo.
echo To run again: Double-click "MCC ROLL DAQ" on Desktop
echo.
pause
