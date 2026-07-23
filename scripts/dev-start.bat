@echo off
setlocal EnableExtensions
chcp 65001 >nul 2>&1

REM One-click restart: stop PostgreSQL + Next.js if running, then start Turbopack dev server (port 3001)
cd /d "%~dp0.."
if errorlevel 1 (
  echo [error] cannot cd to project root
  pause
  exit /b 1
)

set "CRM_ROOT=%CD%"
if not exist "%CRM_ROOT%\package.json" (
  echo [error] package.json not found: %CRM_ROOT%
  pause
  exit /b 1
)

echo ========================================
echo   Kaiyi CRM - starting Turbopack dev server...
echo   Root: %CRM_ROOT%
echo ========================================
echo.

where powershell >nul 2>&1
if errorlevel 1 (
  echo [error] PowerShell not found
  pause
  exit /b 1
)

if not exist "%~dp0dev-start.ps1" (
  echo [error] missing script: %~dp0dev-start.ps1
  pause
  exit /b 1
)

powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0dev-start.ps1"
set "ERR=%ERRORLEVEL%"

echo.
if not "%ERR%"=="0" (
  echo Start failed, exit code %ERR%
) else (
  echo Frontend process exited.
)
echo.
pause
endlocal & exit /b %ERR%
