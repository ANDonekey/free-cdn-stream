@echo off
setlocal

cd /d "%~dp0"

if "%~1"=="" goto menu

npm run tiktok:test -- %*
goto end

:menu
echo.
echo TikTok smoke test helper
echo ========================
echo 1. Upload test with test\random-1m.png
echo 2. Upload test with test\tv.png
echo 3. CDN-only test from outputs\demo\master.m3u8
echo 4. Compare local file with signed URL
echo 5. Custom arguments
echo.
set /p choice="Choose 1-5: "

if "%choice%"=="1" (
  npm run tiktok:test -- --upload-only --file=test/random-1m.png
  goto end
)

if "%choice%"=="2" (
  npm run tiktok:test -- --upload-only --file=test/tv.png
  goto end
)

if "%choice%"=="3" (
  npm run tiktok:test -- --cdn-only
  goto end
)

if "%choice%"=="4" (
  set /p local_file="Local file path, for example test/random-1m.png: "
  set /p signed_url="Signed URL: "
  npm run tiktok:test -- --file="%local_file%" --url="%signed_url%"
  goto end
)

if "%choice%"=="5" (
  echo Example: --upload-only --file=test/random-1m.png
  set /p custom_args="Arguments: "
  npm run tiktok:test -- %custom_args%
  goto end
)

echo Invalid choice.

:end
echo.
pause
