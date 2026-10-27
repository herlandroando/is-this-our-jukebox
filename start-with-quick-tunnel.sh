#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

echo "======================================================="
echo "  IsThisOurJukebox V2 - Quick Cloudflare Tunnel"
echo "======================================================="
echo ""

if ! command -v cloudflared >/dev/null 2>&1; then
    echo "[ERROR] cloudflared was not found in your PATH!"
    echo "To install Cloudflare Tunnel:"
    if [[ "$OSTYPE" == "darwin"* ]]; then
        echo "   brew install cloudflared"
    else
        echo "   sudo apt install cloudflared (or see pkg.cloudflare.com)"
    fi
    echo ""
    exit 1
fi

SERVER_PID=""
cleanup() {
    if [ -n "$SERVER_PID" ]; then
        echo ""
        echo "Stopping IsThisOurJukebox server (PID $SERVER_PID)..."
        kill "$SERVER_PID" 2>/dev/null || true
    fi
}
trap cleanup EXIT INT TERM

echo "Starting IsThisOurJukebox server..."
if [ -x "./jukebox-office" ]; then
    ./jukebox-office &
    SERVER_PID=$!
elif [ -f "./jukebox-office" ]; then
    chmod +x ./jukebox-office
    ./jukebox-office &
    SERVER_PID=$!
elif command -v bun >/dev/null 2>&1; then
    bun backend/src/server.ts &
    SERVER_PID=$!
else
    echo "[ERROR] Neither ./jukebox-office binary nor bun runtime found!"
    exit 1
fi

echo "Waiting for server to initialize..."
sleep 2

PORT="${JUKEBOX_PORT:-3000}"
echo "Starting Quick Cloudflare Tunnel to port $PORT..."
echo "(A temporary https://*.trycloudflare.com link will appear below)"
echo "======================================================="

cloudflared tunnel --url "http://localhost:$PORT"
