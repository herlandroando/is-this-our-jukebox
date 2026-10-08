@echo off
title IsThisOurJukebox V2 - Quick Tunnel Launcher
echo =======================================================
echo  IsThisOurJukebox V2 - Quick Cloudflare Tunnel
echo =======================================================
echo.

where cloudflared >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] cloudflared was not found in your PATH!
    echo To install it with Windows Package Manager, run:
    echo    winget install --id Cloudflare.cloudflared -e
    echo.
    pause
    exit /b 1
)

echo Starting IsThisOurJukebox server...
start "IsThisOurJukebox Server" jukebox-office.exe

echo Waiting for server to initialize...
timeout /t 3 /nobreak >nul

echo Starting Quick Cloudflare Tunnel to port 3000...
echo (A temporary https://*.trycloudflare.com link will appear below)
echo =======================================================
cloudflared tunnel --url http://localhost:3000
pause
