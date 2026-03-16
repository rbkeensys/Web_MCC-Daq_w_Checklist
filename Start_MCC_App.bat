@echo off
title MCC Web Control Server

echo ========================================
echo MCC Web Control - Starting Server
echo ========================================
echo.

cd /d "%~dp0"

REM Kill any existing Python servers first
echo Checking for running servers...
tasklist /FI "IMAGENAME eq python.exe" 2>NUL | find /I /N "python.exe">NUL
if "%ERRORLEVEL%"=="0" (
    echo Found existing Python process - stopping it...
    taskkill /F /IM python.exe >NUL 2>&1
    timeout /t 1 /nobreak >NUL
    echo Previous server stopped.
) else (
    echo No existing server found.
)
echo.

REM Activate virtual environment if it exists
if exist ".venv\Scripts\activate.bat" (
    echo Activating virtual environment...
    call .venv\Scripts\activate.bat
    echo.
)

echo Starting server and browser...
echo Browser will open in 3 seconds.
echo.
echo ========================================
echo SERVER OUTPUT:
echo ========================================
echo.

REM Launch browser opener in background
start /b cmd /c "timeout /t 3 /nobreak >nul && start http://127.0.0.1:8000"

REM Run server in THIS window (stays open, shows all output)
python server\server.py

echo.
echo ========================================
echo Server stopped.
echo ========================================
pause
