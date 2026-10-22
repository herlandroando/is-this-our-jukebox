import { describe, expect, test } from "bun:test";
import { TrackMemoryBuffer, MemoryBufferManager } from "./memoryBuffer.ts";

describe("Ephemeral In-Memory Audio Stream Buffer", () => {
  test("buffers chunks progressively and satisfies byte waits", async () => {
    const buf = new TrackMemoryBuffer("test-1", "yt");

    // Start waiting for 500 bytes before they exist
    const waitPromise = buf.waitForBytes(500, 2000);

    // Append 300 bytes
    buf.appendChunk(new Uint8Array(300).fill(1));
    expect(buf.downloadedBytes).toBe(300);

    // Append 300 more bytes (total 600)
    buf.appendChunk(new Uint8Array(300).fill(2));
    expect(buf.downloadedBytes).toBe(600);

    const hasBytes = await waitPromise;
    expect(hasBytes).toBe(true);

    // Test slice extraction
    const slice = buf.readSlice(250, 350);
    expect(slice.byteLength).toBe(101);
    expect(slice[0]).toBe(1); // from chunk 1
    expect(slice[100]).toBe(2); // from chunk 2
  });

  test("MemoryBufferManager lifecycle: retainOnly cleans up discarded tracks", () => {
    const mgr = new MemoryBufferManager();

    // Mock two buffers
    (mgr as any).buffers.set("track-A", new TrackMemoryBuffer("track-A", "yt"));
    (mgr as any).buffers.set("track-B", new TrackMemoryBuffer("track-B", "yt"));
    (mgr as any).buffers.set("track-C", new TrackMemoryBuffer("track-C", "yt"));

    expect(mgr.get("track-A")).toBeDefined();
    expect(mgr.get("track-B")).toBeDefined();
    expect(mgr.get("track-C")).toBeDefined();

    // Retain only track-B (e.g. now playing) and track-C (next queued)
    mgr.retainOnly(["track-B", "track-C"]);

    expect(mgr.get("track-A")).toBeUndefined();
    expect(mgr.get("track-B")).toBeDefined();
    expect(mgr.get("track-C")).toBeDefined();

    mgr.clearAll();
    expect(mgr.get("track-B")).toBeUndefined();
    expect(mgr.get("track-C")).toBeUndefined();
  });
});
