@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo [1/3] npm install ...
call npm install
if errorlevel 1 (
  echo npm install failed
  pause
  exit /b 1
)

if not exist "android" (
  echo [2/3] cap add android ...
  call npx cap add android
  if errorlevel 1 (
    echo cap add android failed
    pause
    exit /b 1
  )
) else (
  echo [2/3] android already exists, skip add
)

echo [3/3] cap sync android ...
call npx cap sync android
if errorlevel 1 (
  echo cap sync failed
  pause
  exit /b 1
)

echo.
echo OK. Next:
echo   1. Edit capacitor.config.json  server.url  to your HTTPS CRM URL
echo   2. Run: npx cap sync android
echo   3. Run: npx cap open android
echo   4. In Android Studio: Build APK
echo.
pause
