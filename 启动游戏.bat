@echo off
setlocal
cd /d "%~dp0"
if exist "index.html" (
  start "" "index.html"
) else (
  echo index.html not found.
  pause
)
