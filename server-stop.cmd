@echo off
REM Stronghold Protocol: stop the background game server.
chcp 65001 >nul
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$p = Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -match 'server[\\/]index\.js' };" ^
  "if ($p) { $p | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }; Write-Host 'Stronghold server stopped.' }" ^
  "else { Write-Host 'No running Stronghold server found.' }"
