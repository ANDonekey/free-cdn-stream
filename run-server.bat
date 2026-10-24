@echo off
setlocal

cd /d "%~dp0"

if not exist "bin\ffmpeg.exe" (
  echo Missing bin\ffmpeg.exe
  echo Put ffmpeg.exe in the project bin folder first.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Installing dependencies...
  npm install
  if errorlevel 1 (
    echo.
    echo npm install failed.
    pause
    exit /b 1
  )
)

echo Starting server at http://localhost:3000
echo Press Ctrl+C to stop.
echo.
npm start

echo.
pause
