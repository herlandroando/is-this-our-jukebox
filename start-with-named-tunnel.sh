#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

echo "======================================================="
echo "  IsThisOurJukebox V2 - Named Cloudflare Tunnel"
echo "======================================================="
echo ""

if [ ! -f .env ]; then
    echo "[WARNING] No .env file found. Creating one from .env.example..."
    cp .env.example .env
    echo "Please edit .env with your PUBLIC_URL (e.g. https://jukebox.yourdomain.com)"
    echo ""
fi

echo "Starting IsThisOurJukebox server..."
if [ -x "./jukebox-office" ]; then
    ./jukebox-office
elif [ -f "./jukebox-office" ]; then
    chmod +x ./jukebox-office
    ./jukebox-office
elif command -v bun >/dev/null 2>&1; then
    bun backend/src/server.ts
else
    echo "[ERROR] Neither ./jukebox-office binary nor bun runtime found!"
    exit 1
fi
