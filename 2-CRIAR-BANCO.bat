@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Cria o banco "smartmirrordb" e as tabelas no PostgreSQL local.
echo Use SO se voce ainda nao tem o banco. Usa a senha do arquivo api\.env
echo.
where psql >nul 2>nul || (echo [ERRO] psql nao encontrado. Instale o PostgreSQL ^(postgresql.org^) e coloque a pasta "bin" no PATH. & pause & exit /b 1)

for /f "usebackq tokens=1,* delims==" %%A in ("api\.env") do (
  if /i "%%A"=="DB_PASSWORD" set PGPASSWORD=%%B
  if /i "%%A"=="DB_USER" set PGUSER=%%B
  if /i "%%A"=="DB_NAME" set DBNAME=%%B
)
if not defined PGUSER set PGUSER=postgres
if not defined DBNAME set DBNAME=smartmirrordb

psql -U %PGUSER% -c "CREATE DATABASE %DBNAME%;"
psql -U %PGUSER% -d %DBNAME% -f banco\schema.sql
echo.
echo Concluido ^(se apareceu "already exists" no primeiro comando, esta tudo bem^).
pause
