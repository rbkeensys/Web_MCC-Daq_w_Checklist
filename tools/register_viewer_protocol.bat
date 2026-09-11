@echo off
rem register_viewer_protocol.bat v1.0.0 -- one-time per-computer setup so the
rem web app's Viewer button opens the log viewer ON THIS COMPUTER.
rem Registers the mccviewer: URL protocol (current user only, no admin) to run
rem server\viewer_local_launch.py with the first python on PATH.
rem Requirements on this computer: python with tkinter + matplotlib
rem   (pip install matplotlib), and this repo checked out.

setlocal
set "SCRIPT=%~dp0..\server\viewer_local_launch.py"
for %%I in ("%SCRIPT%") do set "SCRIPT=%%~fI"
if not exist "%SCRIPT%" (
  echo ERROR: %SCRIPT% not found -- run this from the repo's tools\ folder.
  pause & exit /b 1
)
for /f "delims=" %%P in ('where python') do (set "PY=%%P" & goto :gotpy)
echo ERROR: no python on PATH.
pause & exit /b 1
:gotpy

reg add "HKCU\Software\Classes\mccviewer" /ve /d "MCC Log Viewer" /f >nul
reg add "HKCU\Software\Classes\mccviewer" /v "URL Protocol" /d "" /f >nul
reg add "HKCU\Software\Classes\mccviewer\shell\open\command" /ve ^
  /d "\"%PY%\" \"%SCRIPT%\" \"%%1\"" /f >nul

echo Registered mccviewer: protocol
echo   python : %PY%
echo   script : %SCRIPT%
echo The browser will ask once to allow opening "MCC Log Viewer" -- tick
echo "always allow" and the Viewer button opens logs on this computer.
pause
