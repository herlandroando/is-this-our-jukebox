# 🎵 IsThisOurJukebox V2 — Standalone Office Radio

A zero-dependency standalone jukebox designed for office LAN music sharing.
One laptop acts as the dedicated host DJ connected to the office speaker. Coworkers join from mobile phones or laptops without accounts to search, request, and democratically upvote tracks in real-time.

---

## ⚡ What was fixed in V2

1. **No More YouTube Copyright / Iframe Blocks (Error 150/101)**:
   - V1 used YouTube `iframe` embeds which Google actively blocks for copyrighted/official music tracks.
   - V2 replaces all iframes with a high-performance **Direct Audio Stream Proxy** (`/api/stream/:id`) feeding a standard HTML5 `<audio>` element with HTTP Range support (`206 Partial Content`).
2. **Zero-Stutter Seamless Fallback**:
   - Streams are validated and pre-resolved in the background. If a stream fails, V2 automatically substitutes a playable match or smoothly advances without skip loops.
3. **Auto-Radio DJ Mode**:
   - When the queue runs empty, Auto-DJ automatically curates and queues similar or chill tracks based on recent requests so the office is never dead silent.
4. **Coworker Nicknames**:
   - Coworkers can enter their name ("Requested by Sarah") or stay anonymous.
5. **Emil Kowalski-grade UI**:
   - Tactile micro-interactions, responsive mobile request sheet, live frequency visualizer, ambient album art glow, and smooth queue reordering.

---

## 🚀 Quick Start (For End Users)

1. Double click `jukebox-office.exe` on the host laptop.
2. The server starts and **automatically opens your browser** to the **Host DJ Dashboard** (`/#/host?token=...`).
3. Connect your laptop to the office speaker.
4. Coworkers scan the on-screen QR code (or visit the printed LAN IP, e.g. `http://192.168.1.50:3000`) on their phones to start requesting songs!

---

## 🛠️ Developer Commands

Built with **Bun v1.4+**, **Hono**, and **Vue 3 / Vite**.

```bash
# Install dependencies
bun install

# Run typecheck across backend and frontend
bun run typecheck

# Run automated end-to-end WebSocket & streaming smoke tests
bun run smoke:ws

# Build and package single standalone Windows binary
bun run package
# -> Outputs ./jukebox-office.exe (~87 MB)
```
