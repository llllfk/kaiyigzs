# Start PostgreSQL + Next.js Turbopack dev server (port 3001)
# If either is already running, stop it first, then start fresh.
$ErrorActionPreference = "Stop"
try {
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
  $OutputEncoding = [System.Text.Encoding]::UTF8
} catch {}

function Wait-Exit([string]$Message, [int]$Code = 1) {
  Write-Host ""
  if ($Message) { Write-Host $Message -ForegroundColor Red }
  Read-Host "Press Enter to exit"
  exit $Code
}

function Test-PortListening([int]$Port) {
  $conns = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
  if ($conns.Count -gt 0) { return $true }
  $lines = @(netstat -ano 2>$null | Select-String ":$Port\s+.*LISTENING")
  return $lines.Count -gt 0
}

function Stop-PortListeners([int]$Port) {
  for ($i = 0; $i -lt 3; $i++) {
    $killed = $false
    $conns = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
    foreach ($c in $conns) {
      $procId = $c.OwningProcess
      if ($procId -and $procId -ne 0) {
        $name = ""
        try { $name = (Get-Process -Id $procId -ErrorAction SilentlyContinue).ProcessName } catch {}
        Write-Host "      stop PID $procId ($name)"
        Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
        $killed = $true
      }
    }
    $lines = @(netstat -ano 2>$null | Select-String ":$Port\s+.*LISTENING")
    foreach ($line in $lines) {
      if ($line.Line -match "\s(\d+)\s*$") {
        $pid2 = [int]$Matches[1]
        if ($pid2 -gt 0) {
          Write-Host "      stop PID $pid2 (netstat)"
          Stop-Process -Id $pid2 -Force -ErrorAction SilentlyContinue
          $killed = $true
        }
      }
    }
    if (-not $killed) { break }
    Start-Sleep -Seconds 1
  }
  if (Test-PortListening $Port) {
    Wait-Exit "[error] port $Port still in use. Close other Node windows, then retry."
  }
}

function Stop-PostgresIfRunning([string]$PgCtl, [string]$PgData) {
  & $PgCtl -D $PgData status 2>$null | Out-Null
  if ($LASTEXITCODE -eq 0) {
    Write-Host "      PostgreSQL running, stopping..."
    & $PgCtl -D $PgData -m fast stop 2>$null | Out-Null
    Start-Sleep -Seconds 2
    & $PgCtl -D $PgData status 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) {
      Wait-Exit "[error] failed to stop PostgreSQL"
    }
    Write-Host "      stopped"
  } else {
    Write-Host "      not running"
  }
}

function Start-Postgres([string]$PgCtl, [string]$PgData) {
  Write-Host "      starting..."
  & $PgCtl -D $PgData -l (Join-Path $PgData "pg.log") start
  if ($LASTEXITCODE -ne 0) { Wait-Exit "[error] failed to start PostgreSQL" }
  Start-Sleep -Seconds 2
  Write-Host "      started"
}

try {
  $Root = $env:CRM_ROOT
  if (-not $Root) { $Root = Split-Path -Parent $PSScriptRoot }
  if (-not $Root) { $Root = (Get-Location).Path }
  if (-not (Test-Path (Join-Path $Root "package.json"))) {
    Wait-Exit "[error] package.json not found in: $Root"
  }
  Set-Location -LiteralPath $Root

  $Port = 3001
  $PgBin = "C:\Program Files\PostgreSQL\16\bin"
  $PgData = "C:\Users\Administrator\pgdata-sales-crm"
  $env:PGPASSWORD = "postgres"

  Write-Host "========================================"
  Write-Host "  Kaiyi CRM Turbopack dev start"
  Write-Host "========================================"
  Write-Host "Root: $Root"
  Write-Host ""

  $pgCtl = Join-Path $PgBin "pg_ctl.exe"
  $psql = Join-Path $PgBin "psql.exe"

  if (-not (Test-Path -LiteralPath $pgCtl)) { Wait-Exit "[error] pg_ctl not found: $pgCtl" }
  if (-not (Test-Path -LiteralPath $psql)) { Wait-Exit "[error] psql not found: $psql" }
  if (-not (Test-Path -LiteralPath $PgData)) { Wait-Exit "[error] data dir not found: $PgData" }

  Write-Host "[1/4] Check existing processes..."
  Write-Host "      PostgreSQL:"
  Stop-PostgresIfRunning $pgCtl $PgData
  Write-Host "      Next.js (port $Port):"
  if (Test-PortListening $Port) {
    Write-Host "      port $Port in use, stopping..."
    Stop-PortListeners $Port
    Write-Host "      stopped"
  } else {
    Write-Host "      not running"
  }
  Write-Host ""

  Write-Host "[2/4] PostgreSQL..."
  Start-Postgres $pgCtl $PgData
  & $psql -U postgres -h 127.0.0.1 -p 5432 -c "SELECT 1" 2>$null | Out-Null
  if ($LASTEXITCODE -ne 0) { Wait-Exit "[error] cannot connect 127.0.0.1:5432" }
  Write-Host "      ok"
  Write-Host ""

  Write-Host "[3/4] Next.js prep..."
  if (-not (Test-Path (Join-Path $Root "node_modules"))) {
    Write-Host "      npm install..."
    npm install
    if ($LASTEXITCODE -ne 0) { Wait-Exit "[error] npm install failed" }
  } else {
    Write-Host "      node_modules ok"
  }
  Write-Host ""

  Write-Host "[4/4] Next.js..."
  Write-Host ""
  Write-Host "Open: http://localhost:$Port"
  Write-Host "Ctrl+C stops frontend (DB keeps running)"
  Write-Host "========================================"
  Write-Host ""

  npm run dev:turbo
  $code = $LASTEXITCODE
  if ($null -eq $code) { $code = 0 }

  Write-Host ""
  if ($code -ne 0) {
    Wait-Exit "[error] frontend exited code $code" $code
  }
  Write-Host "frontend stopped (exit 0)."
  exit 0
} catch {
  Write-Host ""
  Write-Host ("[error] " + $_.Exception.Message) -ForegroundColor Red
  if ($_.ScriptStackTrace) { Write-Host $_.ScriptStackTrace }
  Read-Host "Press Enter to exit"
  exit 1
}
