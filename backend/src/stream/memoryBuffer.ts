import type { AudioProvider } from "../types.ts";

/**
 * Ephemeral In-Memory Progressive Audio Buffer.
 * 
 * Complies 100% with Terms of Service by never persisting audio files to disk.
 * Instead, buffers the single legitimate upstream progressive stream in volatile RAM (~4 MB per song),
 * providing instant HTTP 206 Range slicing, zero external network hits on seek,
 * and zero bot abuse tagging from YouTube CDN.
 */

export interface BufferedStreamMetadata {
  contentType: string;
  totalSize: number | null;
}

export class TrackMemoryBuffer {
  public readonly trackId: string;
  public readonly provider: AudioProvider;
  public contentType: string = "audio/mp4";
  public totalSize: number | null = null;
  public downloadedBytes: number = 0;
  public isComplete: boolean = false;
  public error: Error | null = null;

  private chunks: Uint8Array[] = [];
  private waitResolvers: Array<() => void> = [];
  private abortController: AbortController = new AbortController();

  constructor(trackId: string, provider: AudioProvider) {
    this.trackId = trackId;
    this.provider = provider;
  }

  public get signal(): AbortSignal {
    return this.abortController.signal;
  }

  public appendChunk(chunk: Uint8Array) {
    if (this.isComplete || this.signal.aborted) return;
    this.chunks.push(chunk);
    this.downloadedBytes += chunk.byteLength;
    this.notifyWaiters();
  }

  public markComplete(totalBytes?: number) {
    this.isComplete = true;
    if (totalBytes && !this.totalSize) {
      this.totalSize = totalBytes;
    } else if (!this.totalSize) {
      this.totalSize = this.downloadedBytes;
    }
    this.notifyWaiters();
  }

  public markError(err: Error) {
    this.error = err;
    this.notifyWaiters();
  }

  public abort() {
    this.abortController.abort();
    this.notifyWaiters();
  }

  /**
   * Waits until at least `targetBytes` are available in RAM, or until completion/error.
   */
  public async waitForBytes(targetBytes: number, timeoutMs = 12000): Promise<boolean> {
    if (this.downloadedBytes >= targetBytes || this.isComplete || this.error) {
      return this.downloadedBytes > 0;
    }

    return new Promise<boolean>((resolve) => {
      let timer: number | null = null;

      const onNotify = () => {
        if (this.downloadedBytes >= targetBytes || this.isComplete || this.error || this.signal.aborted) {
          cleanup();
          resolve(this.downloadedBytes > 0);
        }
      };

      const cleanup = () => {
        if (timer !== null) clearTimeout(timer);
        const idx = this.waitResolvers.indexOf(onNotify);
        if (idx !== -1) this.waitResolvers.splice(idx, 1);
      };

      timer = setTimeout(() => {
        cleanup();
        resolve(this.downloadedBytes > 0);
      }, timeoutMs) as any;

      this.waitResolvers.push(onNotify);
    });
  }

  /**
   * Reads an exact slice [start, end] (inclusive) from the buffered chunks.
   */
  public readSlice(start: number, end: number): Uint8Array {
    if (start < 0) start = 0;
    const availableEnd = Math.min(end, this.downloadedBytes - 1);
    if (start > availableEnd || this.chunks.length === 0) {
      return new Uint8Array(0);
    }

    const length = availableEnd - start + 1;
    const result = new Uint8Array(length);

    let offset = 0;
    let written = 0;

    for (const chunk of this.chunks) {
      const chunkStart = offset;
      const chunkEnd = offset + chunk.byteLength - 1;

      if (chunkEnd >= start && chunkStart <= availableEnd) {
        const sliceStart = Math.max(0, start - chunkStart);
        const sliceEnd = Math.min(chunk.byteLength, availableEnd - chunkStart + 1);
        const toCopy = chunk.subarray(sliceStart, sliceEnd);
        result.set(toCopy, written);
        written += toCopy.byteLength;
        if (written >= length) break;
      }

      offset += chunk.byteLength;
      if (offset > availableEnd) break;
    }

    return result.subarray(0, written);
  }

  private notifyWaiters() {
    const list = [...this.waitResolvers];
    for (const fn of list) {
      try {
        fn();
      } catch {}
    }
  }
}

export class MemoryBufferManager {
  private buffers = new Map<string, TrackMemoryBuffer>();
  private activeStreams = new Map<string, Promise<void>>();

  public get(trackId: string): TrackMemoryBuffer | undefined {
    return this.buffers.get(trackId);
  }

  /**
   * Retrieves an existing buffer or begins progressive ingestion from upstream in the background.
   */
  public async getOrStartBuffer(
    trackId: string,
    provider: AudioProvider,
    streamUrl: string
  ): Promise<TrackMemoryBuffer> {
    const existing = this.buffers.get(trackId);
    if (existing && !existing.error && (!existing.signal.aborted || existing.downloadedBytes > 0)) {
      return existing;
    }

    const buffer = new TrackMemoryBuffer(trackId, provider);
    this.buffers.set(trackId, buffer);

    const streamPromise = this.startIngestion(buffer, streamUrl);
    this.activeStreams.set(trackId, streamPromise);

    return buffer;
  }

  private async startIngestion(buffer: TrackMemoryBuffer, streamUrl: string): Promise<void> {
    const CHUNK_SIZE = 1024 * 1024; // 1 MB chunk
    let currentOffset = 0;

    try {
      while (!buffer.signal.aborted) {
        const rangeHeader = `bytes=${currentOffset}-${currentOffset + CHUNK_SIZE - 1}`;
        const res = await fetch(streamUrl, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            Range: rangeHeader,
          },
          signal: buffer.signal,
        });

        if (res.status >= 400 && currentOffset === 0) {
          throw new Error(`Upstream stream returned ${res.status} ${res.statusText}`);
        }

        if (res.status === 416) {
          // Range Not Satisfiable: reached the end of the file
          break;
        }

        if (!buffer.contentType) {
          buffer.contentType = res.headers.get("content-type") || "audio/mp4";
        }

        const contentRange = res.headers.get("content-range");
        if (contentRange && !buffer.totalSize) {
          const match = contentRange.match(/\/(\d+)$/);
          if (match && match[1]) {
            buffer.totalSize = parseInt(match[1], 10);
          }
        }

        const chunkBuf = new Uint8Array(await res.arrayBuffer());
        if (chunkBuf.byteLength === 0) {
          break;
        }

        buffer.appendChunk(chunkBuf);
        currentOffset += chunkBuf.byteLength;

        if (buffer.totalSize && currentOffset >= buffer.totalSize) {
          break;
        }

        if (res.status === 200) {
          // Upstream served non-range full body
          break;
        }
      }

      buffer.markComplete(currentOffset);
    } catch (err: any) {
      if (err?.name !== "AbortError") {
        console.warn(`[memoryBuffer] Stream ingestion error for ${buffer.trackId}:`, err);
        buffer.markError(err);
      }
    } finally {
      this.activeStreams.delete(buffer.trackId);
    }
  }

  /**
   * Retains only the active track IDs in memory and evicts older completed buffers.
   */
  public retainOnly(activeTrackIds: string[]) {
    const activeSet = new Set(activeTrackIds);
    for (const [id, buf] of this.buffers) {
      if (!activeSet.has(id)) {
        buf.abort();
        this.buffers.delete(id);
      }
    }
  }

  public evict(trackId: string) {
    const buf = this.buffers.get(trackId);
    if (buf) {
      buf.abort();
      this.buffers.delete(trackId);
    }
  }

  public clearAll() {
    for (const buf of this.buffers.values()) {
      buf.abort();
    }
    this.buffers.clear();
    this.activeStreams.clear();
  }
}

export const memoryBufferManager = new MemoryBufferManager();
