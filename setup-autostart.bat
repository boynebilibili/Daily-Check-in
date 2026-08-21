@echo off
rem ============================================
rem  Checkin Desktop - Auto-start installer
rem  Run this once: the check-in app will start
rem  automatically after you log into Windows.
rem  To undo: run remove-autostart.bat
rem ============================================
setlocal

set "APP_DIR=D:\1project\Daily Check-in"
set "STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "LINK=%STARTUP_DIR%\checkin-desktop.bat"

rem Build the startup launcher (fully detached, hidden)
(
  echo @echo off
  echo wscript.exe "%APP_DIR%\start-background.vbs"
) > "%LINK%"

if exist "%LINK%" (
  echo.
  echo [OK] Auto-start registered!
  echo   Launcher: %LINK%
  echo.
  echo The check-in app will start automatically on next login.
  echo To undo, run remove-autostart.bat
  echo.
) else (
  echo [FAIL] Could not create the launcher script.
)

pause
