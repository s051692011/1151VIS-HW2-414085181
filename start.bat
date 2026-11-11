@echo off
setlocal
cd /d "%~dp0"
set "PORT=8000"
set "PY_CMD="
where py >nul 2>&1
if %errorlevel% equ 0 set "PY_CMD=py -3"
if not defined PY_CMD (
    where python >nul 2>&1
    if %errorlevel% equ 0 set "PY_CMD=python"
)
if not defined PY_CMD (
    echo [ERROR] Python 3 is missing.
    echo Install Python 3, or double-click index.html to use the OFFLINE DEMO.
    pause
    goto :end
)
echo Starting the Seismic Dashboard on port %PORT% ...
start "EVA Seismic HTTP Server - close this window to stop" cmd /k %PY_CMD% -m http.server %PORT% --bind 127.0.0.1
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:%PORT%/"
echo The dashboard should open in your browser.
echo To stop it, close the separate server command window.
:end
endlocal
