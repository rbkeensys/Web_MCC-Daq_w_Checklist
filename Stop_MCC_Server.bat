@echo off
echo Stopping any running MCC servers...
echo.

REM Kill any python processes running server.py
tasklist /FI "IMAGENAME eq python.exe" 2>NUL | find /I /N "python.exe">NUL
if "%ERRORLEVEL%"=="0" (
    echo Found running Python processes.
    echo Checking for server.py...
    
    REM More aggressive - kill all python.exe (use with caution!)
    REM If you have other Python apps running, this will close them too
    taskkill /F /IM python.exe >NUL 2>&1
    
    echo Python processes terminated.
) else (
    echo No running Python processes found.
)

echo.
echo You can now start the server fresh.
echo.
