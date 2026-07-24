@echo off
REM Start local PostgreSQL (no Docker)
set PG_BIN=C:\Program Files\PostgreSQL\16\bin
set PGDATA=C:\Users\Administrator\pgdata-sales-crm
set PGPASSWORD=postgres

"%PG_BIN%\pg_ctl.exe" -D "%PGDATA%" -l "%PGDATA%\pg.log" status >nul 2>&1
if %ERRORLEVEL%==0 (
  echo PostgreSQL already running.
) else (
  echo Starting PostgreSQL...
  "%PG_BIN%\pg_ctl.exe" -D "%PGDATA%" -l "%PGDATA%\pg.log" start
)

"%PG_BIN%\psql.exe" -U postgres -h 127.0.0.1 -p 5432 -c "SELECT 'ok' AS status;"
echo.
echo DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/sales_crm
