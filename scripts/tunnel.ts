import { spawn } from "bun";

const args = process.argv.slice(2);
const isQuickFlag = args.includes("--quick") || args.includes("-q");
const isNamedFlag = args.includes("--named") || args.includes("-n");
const isHelp = args.includes("--help") || args.includes("-h");

if (isHelp) {
  console.log(`
🎵 IsThisOurJukebox V2 — Cloudflare Tunnel Orchestrator

Usage:
  bun run tunnel [options]

Options:
  --quick, -q    Launch an ephemeral Quick Tunnel (zero account needed, *.trycloudflare.com)
  --named, -n    Use a persistent Named Cloudflare Tunnel (uses PUBLIC_URL from .env)
  --help, -h     Show this help message

Configuration (.env):
  TUNNEL_MODE=named | quick | off
  PUBLIC_URL=https://jukebox.yourdomain.com
  CLOUDFLARE_TUNNEL_TOKEN=<token> (optional, if running named tunnel via connector token)
  JUKEBOX_PORT=3000
`);
  process.exit(0);
}

// 1. Check for cloudflared executable
const cloudflaredPath = Bun.which("cloudflared");

async function checkCloudflared(): Promise<string> {
  if (cloudflaredPath) return cloudflaredPath;
  console.error("\n=======================================================");
  console.error(" ⚠️  cloudflared executable not found in PATH!");
  console.error("=======================================================");
  console.error(" To install Cloudflare Tunnel:");
  console.error("   • Windows:  winget install --id Cloudflare.cloudflared -e");
  console.error("   • macOS:    brew install cloudflared");
  console.error("   • Linux:    sudo apt install cloudflared (or see pkg.cloudflare.com)");
  console.error("\n After installation, reopen your terminal and run this command again.");
  console.error("=======================================================\n");
  process.exit(1);
}

const port = process.env.JUKEBOX_PORT || "3000";

// Determine tunnel mode
let mode: "quick" | "named" = "quick";
if (isNamedFlag) {
  mode = "named";
} else if (isQuickFlag) {
  mode = "quick";
} else if (process.env.TUNNEL_MODE === "named" || process.env.PUBLIC_URL) {
  mode = "named";
}

async function registerTunnelUrlWithBackend(url: string, tunnelMode: string) {
  const endpoint = `http://127.0.0.1:${port}/api/tunnel/register`;
  for (let attempt = 1; attempt <= 15; attempt++) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, mode: tunnelMode }),
      });
      if (res.ok) {
        console.log(`[tunnel] ✅ Successfully registered ${url} with local Jukebox server.`);
        return;
      }
    } catch {
      // Jukebox server might still be booting up
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  console.log(`[tunnel] ℹ️  Jukebox server not detected yet on port ${port}.`);
  console.log(`[tunnel]    Once Jukebox starts, it will read PUBLIC_URL or you can re-run this script.`);
}

async function main() {
  await checkCloudflared();

  console.log("\n=======================================================");
  console.log(` 🎵  IsThisOurJukebox V2 — Cloudflare Tunnel (${mode.toUpperCase()} MODE)`);
  console.log("=======================================================");

  if (mode === "named") {
    const publicUrl = process.env.PUBLIC_URL?.trim();
    if (!publicUrl) {
      console.error("\n❌ Error: Named Tunnel mode requires PUBLIC_URL to be set.");
      console.error("Please set PUBLIC_URL in your .env file, e.g.:");
      console.error("  PUBLIC_URL=https://jukebox.yourdomain.com");
      console.error("\nOr use Quick Tunnel mode instead:");
      console.error("  bun run tunnel:quick\n");
      process.exit(1);
    }

    const token = process.env.CLOUDFLARE_TUNNEL_TOKEN?.trim();
    if (token) {
      console.log(`[tunnel] Starting named tunnel connector using token...`);
      console.log(`[tunnel] Hostname: ${publicUrl}`);
      const proc = spawn(["cloudflared", "tunnel", "run", "--token", token], {
        stdout: "inherit",
        stderr: "inherit",
      });

      void registerTunnelUrlWithBackend(publicUrl, "named");

      process.on("SIGINT", () => {
        proc.kill();
        process.exit(0);
      });
      await proc.exited;
    } else {
      console.log(`[tunnel] Configured for custom domain: ${publicUrl}`);
      console.log(`[tunnel] Assuming cloudflared service is running in background or managed by Windows Service.`);
      await registerTunnelUrlWithBackend(publicUrl, "named");
      console.log("\nTunnel registered! You can now start the Jukebox or keep it running.");
      console.log(`Coworkers can connect at: ${publicUrl}\n`);
    }
  } else {
    // Quick Tunnel mode
    console.log(`[tunnel] Launching ephemeral Quick Tunnel to http://localhost:${port}...`);
    console.log(`[tunnel] No account required. Generating temporary public SSL URL...\n`);

    const proc = spawn(["cloudflared", "tunnel", "--url", `http://localhost:${port}`], {
      stdout: "pipe",
      stderr: "pipe",
    });

    let detectedUrl: string | null = null;

    async function scanStream(readable: ReadableStream<Uint8Array>) {
      const reader = readable.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        buffer += chunk;

        // Print raw logs
        process.stdout.write(chunk);

        if (!detectedUrl) {
          const match = buffer.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
          if (match) {
            detectedUrl = match[0];
            console.log("\n=======================================================");
            console.log(" 🎉  PUBLIC QUICK TUNNEL IS READY!");
            console.log("=======================================================");
            console.log(` 🌐 Public URL:  ${detectedUrl}`);
            console.log(` 📱 Coworker QR: Scan the on-screen QR code in Host Studio!`);
            console.log("=======================================================\n");

            void registerTunnelUrlWithBackend(detectedUrl, "quick");
          }
        }
      }
    }

    if (proc.stdout) void scanStream(proc.stdout);
    if (proc.stderr) void scanStream(proc.stderr);

    process.on("SIGINT", () => {
      console.log("\n[tunnel] Shutting down quick tunnel...");
      proc.kill();
      process.exit(0);
    });

    await proc.exited;
  }
}

void main();
