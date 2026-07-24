@echo off
REM Stop local PostgreSQL (no Docker)
set PG_BIN=C:\Program Files\PostgreSQL\16\bin
set PGDATA=C:\Users\Administrator\pgdata-sales-crm
"%PG_BIN%\pg_ctl.exe" -D "%PGDATA%" -m fast stop
