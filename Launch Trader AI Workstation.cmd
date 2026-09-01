@echo off
setlocal

rem Use the folder containing this file when it stays in the project.
set "TRADER_REPO=%~dp0"

rem Fall back to the current project location when this file is copied to Desktop.
if not exist "%TRADER_REPO%ops\windows\start-trader.ps1" set "TRADER_REPO=C:\Users\Al\Documents\Codex\2026-08-27\referenced-chatgpt-conversation-this-is-an\work\trader\"

if not exist "%TRADER_REPO%ops\windows\start-trader.ps1" (
    echo Trader AI Workstation was not found.
    echo Update TRADER_REPO in this file to the project folder, then run it again.
    pause
    exit /b 1
)

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%TRADER_REPO%ops\windows\start-trader.ps1" -OpenBrowser
if errorlevel 1 (
    echo.
    echo The workstation did not start. Check data\runtime\api.err.log and web.err.log.
    pause
)

endlocal
