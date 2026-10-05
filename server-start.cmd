@echo off
REM Stronghold Protocol: start the game server hidden in the background (no console window).
REM Double-click this file, then open http://localhost:3000
REM SP_VERIFY=sample: the server re-simulates ~1 in 8 client battle results and uses its own on a mismatch.
REM                  Safe anti-cheat: it never rejects an honest result (see docs / server/match/Match.js).
chcp 65001 >nul
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$p = Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -match 'server[\\/]index\.js' };" ^
  "if ($p) { Write-Host 'Server is already running.'; exit 0 }" ^
  "$log = Join-Path $env:TEMP 'stronghold-server.log';" ^
  "$env:SP_VERIFY = 'sample';" ^
  "Start-Process -FilePath 'node' -ArgumentList 'server/index.js' -WorkingDirectory (Get-Location).Path -WindowStyle Hidden -RedirectStandardOutput $log -RedirectStandardError ($log + '.err');" ^
  "Start-Sleep -Seconds 2; Write-Host 'Stronghold server started (hidden).  http://localhost:3000'; Write-Host ('log: ' + $log)"
