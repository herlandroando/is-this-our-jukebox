import { join } from "node:path";
import { existsSync } from "node:fs";
import { EMBEDDED_ASSETS, type EmbeddedAssetMeta } from "./embedded.ts";

export interface StaticAsset {
  body: Uint8Array;
  gzippedBody?: Uint8Array;
  contentType: string;
}

export interface StaticMap {
  assets: Map<string, StaticAsset>;
  indexHtml: Uint8Array | null;
  indexHtmlGzip: Uint8Array | null;
  size: number;
}

let cache: StaticMap | null = null;

const load = async (path: unknown): Promise<Uint8Array> => {
  const file = Bun.file(path as string);
  return new Uint8Array(await file.arrayBuffer());
};

function canGzip(contentType: string): boolean {
  return (
    contentType.includes("javascript") ||
    contentType.includes("css") ||
    contentType.includes("text") ||
    contentType.includes("svg") ||
    contentType.includes("json") ||
    contentType.includes("xml")
  );
}

export async function buildStaticMap(): Promise<StaticMap> {
  const assets = new Map<string, StaticAsset>();
  let indexHtml: Uint8Array | null = null;
  let indexHtmlGzip: Uint8Array | null = null;

  if (EMBEDDED_ASSETS.length > 0) {
    for (const meta of EMBEDDED_ASSETS) {
      try {
        const body = await load(meta.path);
        const gzippedBody = canGzip(meta.contentType) ? Bun.gzipSync(body as any) : undefined;
        assets.set(meta.webPath, { body, gzippedBody, contentType: meta.contentType });
        if (meta.webPath === "/" || meta.webPath.endsWith("/index.html")) {
          indexHtml = body;
          indexHtmlGzip = gzippedBody || Bun.gzipSync(body as any);
        }
      } catch (e) {
        console.warn(`[static] Could not load embedded asset ${meta.webPath}:`, e);
      }
    }
  } else {
    // Development mode fallback: read from disk if frontend/dist exists
    const rootDir = process.cwd();
    const distPath = existsSync(join(rootDir, "frontend", "dist"))
      ? join(rootDir, "frontend", "dist")
      : join(rootDir, "dist");
    const indexPath = join(distPath, "index.html");
    if (existsSync(indexPath)) {
      try {
        const indexFile = Bun.file(indexPath);
        indexHtml = new Uint8Array(await indexFile.arrayBuffer());
        indexHtmlGzip = Bun.gzipSync(indexHtml as any);
        assets.set("/", {
          body: indexHtml,
          gzippedBody: indexHtmlGzip,
          contentType: "text/html; charset=utf-8",
        });
      } catch {
        // ignore
      }
    }
  }

  return { assets, indexHtml, indexHtmlGzip, size: assets.size };
}

export async function getStaticMap(): Promise<StaticMap> {
  if (!cache) cache = await buildStaticMap();
  return cache;
}
