@echo off
setlocal

cd /d "%~dp0"

if "%~1"=="" (
  echo Usage:
  echo   tiktok-share.bat MATERIAL_ID [TENANT_ID] [TENANT_TYPE]
  echo.
  echo Example:
  echo   tiktok-share.bat 7633121671148027921 7633135815273644049 10022
  echo.
  pause
  exit /b 1
)

npm run tiktok:share -- %*

echo.
pause
