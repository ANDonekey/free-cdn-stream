@echo off
setlocal

cd /d "%~dp0"

set size=%~1
set name=%~2

if "%size%"=="" set size=1

if "%name%"=="" (
  npm run random:png -- %size%
) else (
  npm run random:png -- %size% "%name%"
)

echo.
pause
