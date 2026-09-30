<div align="center">
  <img src="assets/logo.png" alt="IsThisOurJukebox Logo" width="280" style="border-radius: 24px; box-shadow: 0 12px 36px rgba(0,0,0,0.4);" />

  # 🎵 IsThisOurJukebox V2

  ### Zero-Friction Standalone Office Radio & Collaborative LAN Jukebox
  *“Wait... is this our jukebox?” — Yes, yes it is.*

  <br />

  [![Runtime](https://img.shields.io/badge/Runtime-Bun%20v1.2+-fbf0df?style=flat&logo=bun&logoColor=black)](https://bun.sh)
  [![Framework](https://img.shields.io/badge/Framework-Hono-E36002?style=flat&logo=hono&logoColor=white)](https://hono.dev)
  [![Frontend](https://img.shields.io/badge/Frontend-Vue%203%20%2B%20Vite-4FC08D?style=flat&logo=vuedotjs&logoColor=white)](https://vuejs.org)
  [![Styling](https://img.shields.io/badge/Styling-Tailwind%20CSS-38B2AC?style=flat&logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
  [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
</div>

---

## 💭 Why I Built This (The Backstory)

> *"In my office, we often listen to music together and love vibing throughout the workday.*
>
> *Naturally, coworkers would constantly shout out or message song requests: **'Hey, play this song!'**, **'Can you queue that one next?'**, **'Skip this please!'**.*
>
> *While I genuinely loved listening to music and enjoying the vibe together, constantly stopping whatever I was working on, switching tabs, searching YouTube, and managing the playlist became quite distracting.*
>
> *I needed a solution where everyone could enjoy our shared office tunes seamlessly without pulling anyone out of their focus. That's how **IsThisOurJukebox** was born—a zero-friction, standalone office jukebox where anyone on our office Wi-Fi can simply scan a QR code from their phone, search for songs, queue up tracks, and democratically upvote favorites in real-time, all without touching the host laptop or interrupting the person plugged into the speakers!"*

---

## ✨ Key Features

- 📱 **Zero Setup / Account-Free for Coworkers**:
  No downloads or accounts needed. Coworkers scan the on-screen QR code (or visit the office LAN IP), choose a display nickname (or stay anonymous), and start requesting.
- 🎧 **Dedicated Host Studio Dashboard**:
  Run a single binary on the speaker laptop. It automatically opens the browser to the authenticated **Host Studio** (`/#/host?token=...`) with audio output, tactile visualizers, and playback master controls.
- 🗳️ **Democratic Voting & Smart Queue**:
  Coworkers can upvote queued tracks. Songs with the highest votes automatically bubble to the top of the playlist.
- 🚀 **Direct Audio Stream Proxy (No YouTube Iframe / Error 150/101)**:
  Unlike fragile YouTube embeds that Google blocks on office networks, V2 resolves audio through a high-performance **Direct Audio Stream Proxy** (`/api/stream/:id`) feeding a standard HTML5 `<audio>` element with HTTP Range support (`206 Partial Content`) and instant playback failover.
- 📻 **Smart Auto-Radio DJ**:
  When the queue runs out, Auto-DJ automatically curates and queues matching vibes based on recent office favorites so the room is never dead silent.
- 🎤 **Synchronized Live Lyrics & Visualizer**:
  Real-time synchronized, syllable-highlighted karaoke lyrics display and a live frequency spectrum visualizer with ambient album art glow.
- 🔒 **Role-Based Remote Access**:
  - **Host**: Master DJ connected directly to the office speakers.
  - **DJ**: Coworkers who unlock DJ mode with a passcode to pause, play, or scrub from their phones.
  - **Members**: Office listeners requesting, upvoting, and enjoying the music.
- 📦 **100% Standalone Single Binary**:
  Frontend, backend, SQLite history, and embedded assets are bundled into a single ~87 MB executable (`jukebox-office.exe`). Zero external dependencies required.

---

## ⚡ What Was Fixed in V2

1. **Eliminated YouTube Copyright / Iframe Errors (Error 150/101)**:
   - Replaced all `iframe` embeds with native direct streaming.
2. **Zero-Stutter Seamless Fallback**:
   - Background audio validation ensures that broken streams immediately fail over to playable alternatives without infinite skip loops.
3. **Optimized Multi-Client WebSocket Architecture**:
   - Sub-10ms state synchronization for queue updates, votes, playback progress, and member rosters.
4. **Emil Kowalski-Grade Tactile UI**:
   - Polished responsive mobile drawer, micro-interactions, dark aesthetic, and haptic feedback.

---

## 🚀 Quick Start (For Host DJ)

1. Double-click `jukebox-office.exe` on the computer connected to the office sound system / speakers.
2. The server starts and **automatically opens your default browser** to the **Host DJ Studio** (`http://<LAN-IP>:3000/#/host?token=...`).
3. Turn on the speakers.
4. Coworkers scan the on-screen QR code on their smartphones (or navigate to `http://<LAN-IP>:3000`) to start adding songs!

---

## 🛠️ Developer Guide

Built with **Bun v1.2+**, **Hono**, **SQLite**, and **Vue 3 / Vite**.

### Prerequisites
- [Bun](https://bun.sh/) (v1.2 or higher)

### Setup & Commands

```bash
# Clone the repository
git clone https://github.com/username/IsThisOurJukeboxV2.git
cd IsThisOurJukeboxV2

# Install dependencies
bun install

# Run development mode (Hot-Reload frontend + backend)
bun run dev

# Run type checking across backend and frontend
bun run typecheck

# Run automated end-to-end WebSocket & streaming smoke tests
bun run smoke:ws

# Build and package single standalone Windows binary
bun run package
# -> Outputs ./jukebox-office.exe (~87 MB)
```

---

## 🔒 Network & Security Note

- **Designed for Private LANs**: This application is optimized to run inside a trusted Local Area Network (office Wi-Fi, home network, or private VPN).
- **Public Exposure**: If deploying over the public internet, always place it behind a secure reverse proxy (such as Cloudflare Tunnel, Caddy, or Nginx with HTTPS/WSS enabled) and protect access accordingly.

---

## ⚖️ Legal Disclaimer

This software is an open-source project developed strictly for **educational and personal LAN jukebox purposes**. 
- It does **not** host, store, cache permanently, or redistribute any copyrighted audio or media files.
- Audio streams are dynamically resolved from publicly accessible third-party services.
- All trademarks, logos, and copyrights belong to their respective owners. Please respect the terms of service of the content providers you access.

---

## 📄 License

This project is open-sourced under the [MIT License](LICENSE).
