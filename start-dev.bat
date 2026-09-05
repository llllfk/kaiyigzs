@echo off
setlocal EnableExtensions
REM ASCII-only script. Project path may contain Chinese; always use %~dp0 quotes.
cd /d "%~dp0"
if errorlevel 1 (
  echo [ERROR] Failed to cd into project directory:
  echo   "%~dp0"
  pause
  exit /b 1
)

set "PORT=5000"
set "HOSTNAME=localhost"
set "DEPLOY_RUN_PORT=%PORT%"

echo ========================================
echo  Project: %CD%
echo  Port:    %PORT%
echo ========================================
echo.

echo [1/3] Clearing port %PORT% if occupied...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference='SilentlyContinue'; $conns = Get-NetTCPConnection -LocalPort %PORT% -State Listen; if (-not $conns) { Write-Host '  Port %PORT% is free.'; exit 0 }; $pids = $conns | Select-Object -ExpandProperty OwningProcess -Unique; foreach ($p in $pids) { Write-Host ('  Killing PID ' + $p); Stop-Process -Id $p -Force }; Start-Sleep -Seconds 1; $left = Get-NetTCPConnection -LocalPort %PORT% -State Listen; if ($left) { Write-Host '  [WARN] Port still in use.'; exit 1 } else { Write-Host '  Port %PORT% cleared.' }"

echo.
echo [2/2] Checking WECOM_WEBHOOK_URL ...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference='SilentlyContinue'; Get-Content -LiteralPath (Join-Path '%CD%' '.env.local') -Encoding UTF8 | ForEach-Object { if ($_ -match '^\s*WECOM_WEBHOOK_URL\s*=\s*\S+') { $env:WECOM_WEBHOOK_URL = ($_ -replace '^\s*WECOM_WEBHOOK_URL\s*=\s*','').Trim() } }; if ($env:WECOM_WEBHOOK_URL) { Write-Host '  WECOM_WEBHOOK_URL: OK (from env or .env.local)' } else { Write-Host '  WECOM_WEBHOOK_URL: MISSING - add to .env.local' }"

echo.
echo [3/3] Starting HTTP service on port %PORT% ...
echo  Open: http://localhost:%PORT%
echo  Press Ctrl+C to stop.
echo  First compile may take 1-2 minutes with no extra output — wait for "Server listening".
echo.

where pnpm >nul 2>&1
if errorlevel 1 (
  echo [ERROR] pnpm not found in PATH. Install pnpm first.
  pause
  exit /b 1
)

REM Prefer local node_modules\.bin so output is not buffered by pnpm wrappers
set "PATH=%CD%\node_modules\.bin;%PATH%"
call pnpm.cmd exec tsx watch src\server.ts
set "EXITCODE=%ERRORLEVEL%"
if not "%EXITCODE%"=="0" (
  echo.
  echo [ERROR] Server exited with code %EXITCODE%
  pause
)
exit /b %EXITCODE%
