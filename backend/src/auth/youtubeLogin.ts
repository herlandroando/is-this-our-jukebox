import { spawn } from "bun";
import { existsSync, unlinkSync, statSync, rmSync } from "fs";
import { join } from "path";

function findBrowserBinary(): string | null {
  const isWin = process.platform === "win32";
  const isMac = process.platform === "darwin";

  if (isWin) {
    const winCandidates = [
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe",
      join(process.env.LOCALAPPDATA || "", "Google", "Chrome", "Application", "chrome.exe"),
      join(process.env.LOCALAPPDATA || "", "Microsoft", "Edge", "Application", "msedge.exe"),
      join(process.env.LOCALAPPDATA || "", "BraveSoftware", "Brave-Browser", "Application", "brave.exe"),
    ];
    for (const b of winCandidates) {
      if (b && existsSync(b)) return b;
    }
  } else if (isMac) {
    const home = process.env.HOME || "";
    const macCandidates = [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
      "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      "/Applications/Arc.app/Contents/MacOS/Arc",
      join(home, "Applications", "Google Chrome.app", "Contents", "MacOS", "Google Chrome"),
      join(home, "Applications", "Brave Browser.app", "Contents", "MacOS", "Brave Browser"),
      join(home, "Applications", "Microsoft Edge.app", "Contents", "MacOS", "Microsoft Edge"),
    ];
    for (const b of macCandidates) {
      if (b && existsSync(b)) return b;
    }
  }

  // Common Linux executables & PATH-based lookup (all Unix & PATH-aware systems)
  const pathCandidates = [
    "google-chrome",
    "google-chrome-stable",
    "chromium",
    "chromium-browser",
    "brave-browser",
    "brave",
    "microsoft-edge-stable",
    "microsoft-edge",
    "chrome",
  ];
  for (const name of pathCandidates) {
    const resolved = Bun.which(name);
    if (resolved && existsSync(resolved)) return resolved;
  }

  // Linux standard filesystem fallback
  const linuxPaths = [
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/brave-browser",
    "/usr/bin/microsoft-edge-stable",
    "/snap/bin/chromium",
    "/snap/bin/brave",
  ];
  for (const b of linuxPaths) {
    if (existsSync(b)) return b;
  }

  return null;
}

function killProcessTree(proc: ReturnType<typeof spawn> | null) {
  if (!proc) return;
  const pid = proc.pid;
  if (!pid) {
    try {
      proc.kill();
    } catch {}
    return;
  }
  if (process.platform === "win32") {
    try {
      spawn(["taskkill", "/pid", String(pid), "/T", "/F"], {
        stdio: ["ignore", "ignore", "ignore"],
      });
    } catch {}
  } else {
    try {
      spawn(["kill", "-9", String(pid)], {
        stdio: ["ignore", "ignore", "ignore"],
      });
    } catch {}
  }
  try {
    proc.kill();
  } catch {}
}

export function getCookiesFilePath(): string {
  const rootPath = join(process.cwd(), "backend", "data", "cookies.txt");
  if (existsSync(rootPath)) return rootPath;
  const directPath = join(process.cwd(), "data", "cookies.txt");
  if (existsSync(directPath)) return directPath;
  if (existsSync(join(process.cwd(), "backend"))) {
    return rootPath;
  }
  return directPath;
}

export function getProfileDirPath(): string {
  const rootPath = join(process.cwd(), "backend", "data", "yt-login-profile");
  if (existsSync(rootPath)) return rootPath;
  const directPath = join(process.cwd(), "data", "yt-login-profile");
  if (existsSync(directPath)) return directPath;
  if (existsSync(join(process.cwd(), "backend"))) {
    return rootPath;
  }
  return directPath;
}

export function deleteLoginProfile(): boolean {
  const profileDir = getProfileDirPath();
  if (!existsSync(profileDir)) return true;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      rmSync(profileDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
      console.log("[auth-yt] Login profile directory deleted.");
      return true;
    } catch (err) {
      console.warn(`[auth-yt] Attempt ${attempt} to delete profile directory failed:`, err);
      if (activeLoginProcess) {
        killProcessTree(activeLoginProcess);
        activeLoginProcess = null;
      }
      const start = Date.now();
      while (Date.now() - start < 300) {}
    }
  }

  try {
    rmSync(profileDir, { recursive: true, force: true });
    return true;
  } catch (finalErr) {
    console.error("[auth-yt] Failed to delete login profile directory:", finalErr);
    return false;
  }
}

export interface YouTubeCookieStatus {
  hasCookies: boolean;
  fileSize?: number;
  lastModified?: number;
  isLoggedIn?: boolean;
  loginInProgress: boolean;
  statusMessage?: string;
}

let activeLoginProcess: ReturnType<typeof spawn> | null = null;
let activeCdpWs: WebSocket | null = null;
let activePollInterval: ReturnType<typeof setInterval> | null = null;
let activeTimeout: ReturnType<typeof setTimeout> | null = null;
let lastStatusMessage = "";

type StatusListener = (status: YouTubeCookieStatus) => void;
const statusListeners = new Set<StatusListener>();

export function subscribeYouTubeStatus(listener: StatusListener): () => void {
  statusListeners.add(listener);
  return () => statusListeners.delete(listener);
}

function notifyStatusChange() {
  const current = getYouTubeCookieStatus();
  for (const listener of statusListeners) {
    try {
      listener(current);
    } catch {}
  }
}

export function isLoginInProgress(): boolean {
  return activeLoginProcess !== null;
}

export function getYouTubeCookieStatus(): YouTubeCookieStatus {
  const file = getCookiesFilePath();
  const inProgress = isLoginInProgress();

  if (!existsSync(file)) {
    return {
      hasCookies: false,
      isLoggedIn: false,
      loginInProgress: inProgress,
      statusMessage: inProgress ? "Menunggu login di peramban..." : lastStatusMessage || "Belum login",
    };
  }
  try {
    const stats = statSync(file);
    return {
      hasCookies: true,
      fileSize: stats.size,
      lastModified: stats.mtimeMs,
      isLoggedIn: stats.size > 200,
      loginInProgress: inProgress,
      statusMessage: inProgress ? "Memperbarui login di peramban..." : "Akun YouTube terhubung (Cookies aktif)",
    };
  } catch {
    return {
      hasCookies: false,
      isLoggedIn: false,
      loginInProgress: inProgress,
      statusMessage: "Error membaca cookies",
    };
  }
}

export function deleteYouTubeCookies(): boolean {
  if (isLoginInProgress()) {
    cancelYouTubeLogin();
  }

  const file = getCookiesFilePath();
  let fileDeleted = false;

  if (existsSync(file)) {
    try {
      unlinkSync(file);
      fileDeleted = true;
      console.log("[auth-yt] Cookies file deleted.");
    } catch (e) {
      console.error("[auth-yt] Error deleting cookies file:", e);
    }
  }

  // Delete the browser profile to remove saved accounts, login history, and cached tokens
  const profileDeleted = deleteLoginProfile();

  lastStatusMessage = "Cookies dan riwayat login berhasil dibersihkan.";
  console.log("[auth-yt] YouTube cookies and browser login profile cleared.");
  notifyStatusChange();

  return fileDeleted || profileDeleted;
}

function cdpCookiesToNetscape(cookies: any[]): string {
  const lines = [
    "# Netscape HTTP Cookie File",
    "# https://curl.se/docs/http-cookies.html",
    "# This file was generated automatically by IsThisOurJukebox YouTube Login",
    "",
  ];
  for (const c of cookies) {
    const domain = c.domain || "";
    const includeSub = domain.startsWith(".") ? "TRUE" : "FALSE";
    const path = c.path || "/";
    const secure = c.secure ? "TRUE" : "FALSE";
    const expiry =
      c.expires && c.expires > 0
        ? Math.round(c.expires)
        : Math.round(Date.now() / 1000) + 86400 * 365;
    lines.push(
      `${domain}\t${includeSub}\t${path}\t${secure}\t${expiry}\t${c.name}\t${c.value}`
    );
  }
  return lines.join("\n") + "\n";
}

export function cancelYouTubeLogin() {
  if (activePollInterval) {
    clearInterval(activePollInterval);
    activePollInterval = null;
  }
  if (activeTimeout) {
    clearTimeout(activeTimeout);
    activeTimeout = null;
  }
  if (activeCdpWs) {
    try {
      if (activeCdpWs.readyState === WebSocket.OPEN) {
        activeCdpWs.send(JSON.stringify({ id: 9999, method: "Browser.close" }));
      }
      activeCdpWs.close();
    } catch {}
    activeCdpWs = null;
  }
  if (activeLoginProcess) {
    killProcessTree(activeLoginProcess);
    activeLoginProcess = null;
  }
  lastStatusMessage = "Sesi login dibatalkan.";
  console.log("[auth-yt] YouTube login cancelled.");
  notifyStatusChange();
}

export async function startYouTubeLogin(): Promise<{ success: boolean; message: string }> {
  if (isLoginInProgress()) {
    return { success: false, message: "Sesi login YouTube sudah sedang berjalan." };
  }

  const browserBin = findBrowserBinary();
  if (!browserBin) {
    return {
      success: false,
      message: "Browser Chrome, Chromium, Edge, atau Brave tidak ditemukan di sistem ini. Silakan instal browser terlebih dahulu.",
    };
  }

  // Ensure any previous profile directory is cleaned before launching,
  // so the user starts with a clean Google login page and no old accounts stuck in history
  deleteLoginProfile();

  const profileDir = getProfileDirPath();
  const cdpPort = 9222;

  console.log(`[auth-yt] Meluncurkan browser login: ${browserBin}`);
  try {
    const proc = spawn([
      browserBin,
      `--user-data-dir=${profileDir}`,
      `--remote-debugging-port=${cdpPort}`,
      "--no-first-run",
      "--no-default-browser-check",
      `--app=https://accounts.google.com/ServiceLogin?service=youtube&continue=https://www.youtube.com`,
    ], {
      detached: true,
      stdio: ["ignore", "ignore", "ignore"],
    });

    activeLoginProcess = proc;

    // Detect if user manually closes the browser
    proc.exited.then(() => {
      if (activeLoginProcess === proc) {
        console.log("[auth-yt] Jendela peramban ditutup oleh pengguna.");
        cancelYouTubeLogin();
        // Clean up profile directory after window closed without completing login
        setTimeout(() => {
          deleteLoginProfile();
        }, 1000);
      }
    });
  } catch (err: any) {
    activeLoginProcess = null;
    return { success: false, message: `Gagal meluncurkan browser: ${err?.message || err}` };
  }

  lastStatusMessage = "Jendela browser dibuka. Menunggu login Google/YouTube...";
  notifyStatusChange();

  // Run CDP polling in background without blocking the HTTP request
  runBackgroundCdpWatcher(cdpPort);

  return {
    success: true,
    message: "Jendela browser login telah dibuka. Silakan login ke akun Google/YouTube Anda.",
  };
}

function runBackgroundCdpWatcher(cdpPort: number) {
  let isDone = false;

  // Timeout 5 menit maksimal untuk login
  activeTimeout = setTimeout(() => {
    if (!isDone) {
      isDone = true;
      lastStatusMessage = "Waktu login habis (timeout 5 menit).";
      cancelYouTubeLogin();
    }
  }, 5 * 60 * 1000);

  const checkCdpReady = async () => {
    if (isDone || !activeLoginProcess) return;
    try {
      const vRes = await fetch(`http://127.0.0.1:${cdpPort}/json/version`);
      if (!vRes.ok) return;
      const vData = (await vRes.json()) as any;
      const wsUrl = vData.webSocketDebuggerUrl;
      if (!wsUrl || isDone) return;

      activeCdpWs = new WebSocket(wsUrl);

      activeCdpWs.onopen = () => {
        console.log("[auth-yt] Terhubung ke Chrome DevTools Protocol. Menunggu login...");
        let reqId = 1;

        activePollInterval = setInterval(() => {
          if (!activeCdpWs || activeCdpWs.readyState !== WebSocket.OPEN) return;
          reqId++;
          activeCdpWs.send(JSON.stringify({ id: reqId, method: "Storage.getCookies" }));
        }, 1500);
      };

      activeCdpWs.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.result && Array.isArray(data.result.cookies)) {
            const cookies = data.result.cookies;
            const hasLoginCookie = cookies.some(
              (c: any) =>
                (c.domain.includes("youtube.com") || c.domain.includes("google.com")) &&
                (c.name === "LOGIN_INFO" ||
                  c.name === "SAPISID" ||
                  c.name === "SSID" ||
                  c.name === "__Secure-1PSID" ||
                  c.name === "SID")
            );

            if (hasLoginCookie) {
              const netscapeData = cdpCookiesToNetscape(cookies);
              const targetFile = getCookiesFilePath();
              Bun.write(targetFile, netscapeData);

              if (!isDone) {
                console.log("[auth-yt] Sesi login YouTube terdeteksi! Mengekstrak cookies...");
                isDone = true;
                console.log(`[auth-yt] Cookies tersimpan di ${targetFile} (${cookies.length} cookies).`);

                lastStatusMessage = `Berhasil login! (${cookies.length} cookies tersimpan)`;

                setTimeout(() => {
                  cancelYouTubeLogin();
                  notifyStatusChange();
                  // Clean up temporary browser profile after login completes and browser closes
                  setTimeout(() => {
                    deleteLoginProfile();
                  }, 1500);
                }, 1500);
              }
            }
          }
        } catch {}
      };

      activeCdpWs.onerror = (e) => {
        console.warn("[auth-yt] CDP WebSocket note:", e);
      };
    } catch {
      // Retry polling CDP
    }
  };

  let retryCount = 0;
  const initTimer = setInterval(async () => {
    if (isDone || !activeLoginProcess) {
      clearInterval(initTimer);
      return;
    }
    retryCount++;
    if (activeCdpWs && activeCdpWs.readyState === WebSocket.OPEN) {
      clearInterval(initTimer);
      return;
    }
    if (retryCount > 25) {
      clearInterval(initTimer);
      if (!isDone) {
        isDone = true;
        lastStatusMessage = "Gagal menghubungkan ke protokol debugging peramban.";
        cancelYouTubeLogin();
      }
      return;
    }
    await checkCdpReady();
  }, 1000);
}
