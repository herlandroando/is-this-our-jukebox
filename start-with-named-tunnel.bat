@echo off
title IsThisOurJukebox V2 - Named Tunnel Launcher
echo =======================================================
echo  IsThisOurJukebox V2 - Named Cloudflare Tunnel
echo =======================================================
echo.

if not exist .env (
    echo [WARNING] No .env file found. Creating one from .env.example...
    copy .env.example .env
    echo Please edit .env with your PUBLIC_URL (e.g. https://jukebox.yourdomain.com)
    echo.
)

echo Starting IsThisOurJukebox server with configured domain...
start "IsThisOurJukebox Server" jukebox-office.exe

echo.
echo If cloudflared is installed as a Windows Service, your tunnel
echo is already active and routing traffic to this computer.
echo.
echo If running manually with connector token, use:
echo    cloudflared tunnel run --token ^<YOUR_TOKEN^>
echo.
pause
