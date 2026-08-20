@echo off
rem ============================================
rem  Checkin Desktop - Remove auto-start
rem ============================================
setlocal

set "STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "LINK=%STARTUP_DIR%\checkin-desktop.bat"

if exist "%LINK%" (
  del "%LINK%"
  echo [OK] Auto-start removed.
) else (
  echo Auto-start was not registered.
)

pause
