import open from "open";

export async function openBrowser(url: string): Promise<void> {
  try {
    await open(url, { wait: false });
    console.log(`[open] Launched default browser to: ${url}`);
  } catch (err) {
    console.warn(`[open] Failed to automatically open browser: ${(err as Error).message}`);
    console.log(`[open] Please open this URL manually: ${url}`);
  }
}
