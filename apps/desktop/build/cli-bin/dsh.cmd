@echo off
setlocal
set "OPEN_DSH_DESKTOP_SETUP_FILE=%APPDATA%\open-deepseek-harness-desktop\data-home-setup.json"
set "OPEN_DSH_DESKTOP_HARNESS_BIN=%~dp0..\harness\lib\bin.js"
set "DSH_PNPM_BIN=%~dp0..\runtime\win32-x64\node_modules\pnpm\bin\pnpm.mjs"
"%~dp0..\runtime\win32-x64\node.exe" "%~dp0..\cli\desktop-cli.mjs" %*
exit /b %ERRORLEVEL%
