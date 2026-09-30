import { describe, expect, it } from "bun:test";
import {
  cleanTitleAndArtist,
  parseTimestamp,
  parseTtml,
  parseLrc,
  parseRawLyrics,
  mergeConsecutiveBilingualLines,
  selectBestLrclibMatch,
  calculateSimilarity,
  normalizeText,
  addRomajiToLyrics,
  getLyrics,
  lyricsCache,
  MAX_LYRICS_CACHE_SIZE,
  setCachedLyrics,
  getCachedLyrics,
} from "./index.ts";


describe("cleanTitleAndArtist", () => {
  it("cleans YouTube noise, feat and Topic tags", () => {
    const res1 = cleanTitleAndArtist("Song Title (Official Music Video)", "Artist Name - Topic");
    expect(res1.title).toBe("Song Title");
    expect(res1.artist).toBe("Artist Name");

    const res2 = cleanTitleAndArtist("Artist - Real Title (feat. Other)", "Various Artists - Topic");
    expect(res2.title).toBe("Real Title");
    expect(res2.artist).toBe("Artist");

    const res3 = cleanTitleAndArtist("Track Name [4K Visualizer]", "Singer VEVO");
    expect(res3.title).toBe("Track Name");
    expect(res3.artist).toBe("Singer");
  });
});

describe("parseTimestamp", () => {
  it("correctly parses all TTML & LRC timestamp formats", () => {
    expect(parseTimestamp("0:15.500")).toBe(15.5);
    expect(parseTimestamp("3:29.365")).toBeCloseTo(209.365, 3);
    expect(parseTimestamp("01:02:03.456")).toBeCloseTo(3723.456, 3);
    expect(parseTimestamp("45.5s")).toBe(45.5);
    expect(parseTimestamp("5000ms")).toBe(5.0);
  });
});

describe("parseTtml", () => {
  it("parses TTML with spans, agent and HTML entity unescaping", () => {
    const ttml = `
      <tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttm="http://www.w3.org/ns/ttml#metadata">
        <head></head>
        <body dur="3:45.000">
          <div>
            <p begin="0:15.500" end="0:18.000" ttm:agent="v1">
              <span begin="0:15.500" end="0:16.200">Hello</span> <span begin="0:16.200" end="0:18.000">world</span>
            </p>
            <p begin="0:20.100" end="0:25.000" ttm:agent="v1">
              <span begin="0:20.100" end="0:25.000">Second line here &amp; more</span>
            </p>
          </div>
        </body>
      </tt>
    `;

    const lines = parseTtml(ttml);
    expect(lines).toHaveLength(2);
    expect(lines[0].time).toBe(15.5);
    expect(lines[0].text).toBe("Hello world");
    expect(lines[1].time).toBe(20.1);
    expect(lines[1].text).toBe("Second line here & more");
  });
});

describe("parseLrc", () => {
  it("parses timestamps and interleaved translation lines", () => {
    const lrc = `
      [00:10.00]沈むように溶けてゆくように
      [00:10.00]As if sinking, as if dissolving
      [00:15.00]二人だけの空が広がる夜に // In the night where the sky spreads out just for the two of us
    `;

    const lines = parseLrc(lrc);
    expect(lines).toHaveLength(2);
    expect(lines[0].text).toBe("沈むように溶けてゆくように");
    expect(lines[0].translation).toBe("As if sinking, as if dissolving");
    expect(lines[0].time).toBe(10);

    expect(lines[1].text).toBe("二人だけの空が広がる夜に");
    expect(lines[1].translation).toBe("In the night where the sky spreads out just for the two of us");
    expect(lines[1].time).toBe(15);
  });
});

describe("parseRawLyrics", () => {
  it("auto-detects TTML, LRC, and plain lyrics", () => {
    const ttml = '<tt><body><div><p begin="0:05.00">TTML lyric</p></div></body></tt>';
    const ttmlResult = parseRawLyrics(ttml, "ttml");
    expect(ttmlResult).toHaveLength(1);
    expect(ttmlResult[0].text).toBe("TTML lyric");
    expect(ttmlResult[0].time).toBe(5);

    const lrc = "[00:12.34]LRC lyric line";
    const lrcResult = parseRawLyrics(lrc, "lrc");
    expect(lrcResult).toHaveLength(1);
    expect(lrcResult[0].text).toBe("LRC lyric line");
    expect(lrcResult[0].time).toBe(12.34);

    const plain = "Line 1\nLine 2";
    const plainResult = parseRawLyrics(plain, "plain");
    expect(plainResult).toHaveLength(2);
    expect(plainResult[0].text).toBe("Line 1");
    expect(plainResult[1].text).toBe("Line 2");
  });
});

describe("selectBestLrclibMatch", () => {
  it("prefers Japanese synced lyrics over English plain for Japanese query", () => {
    const candidates = [
      {
        id: 1,
        syncedLyrics: null,
        plainLyrics: "Just a gentle breeze carrying memories...",
        trackName: "Yoru ni Kakeru (English)",
        artistName: "YOASOBI",
        duration: 261.0,
      },
      {
        id: 2,
        syncedLyrics: "[00:10.00]沈むように溶けてゆくように\n[00:15.00]二人だけの空が広がる夜に",
        plainLyrics: null,
        trackName: "夜に駆ける",
        artistName: "YOASOBI",
        duration: 261.0,
      },
    ];

    const best = selectBestLrclibMatch(candidates, "夜に駆ける", "YOASOBI", 261);
    expect(best).not.toBeNull();
    expect(best.trackName).toBe("夜に駆ける");
    expect(best.syncedLyrics).toBeTruthy();
  });

  it("rejects candidate when title does not match even if synced", () => {
    const candidates = [
      {
        id: 1,
        syncedLyrics: "[00:10.00]Rindu aku rindu kamu...",
        plainLyrics: null,
        trackName: "Rindu Aku Rindu Kamu",
        artistName: "Doel Sumbang",
        duration: 251.0,
      },
    ];

    const best = selectBestLrclibMatch(candidates, "Kamu-Kamulah Surgaku", "T.R.I.A.D", 323);
    expect(best).toBeNull();
  });
});

describe("calculateSimilarity", () => {
  it("returns 1 for exact match or punctuation differences", () => {
    expect(calculateSimilarity("Kamu-Kamulah Surgaku", "Kamu-Kamulah Surgaku")).toBe(1);
    expect(calculateSimilarity("Kamu-Kamulah Surgaku", "Kamu Kamulah Surgaku")).toBe(1);
    expect(calculateSimilarity("T.R.I.A.D", "TRIAD")).toBe(1);
  });

  it("detects low similarity for completely different songs", () => {
    const sim = calculateSimilarity("Kamu-Kamulah Surgaku", "Rindu Aku Rindu Kamu");
    expect(sim).toBeLessThan(0.4);

    const jungleVsInternet = calculateSimilarity("Welcome To The Jungle", "Welcome to The Internet");
    expect(jungleVsInternet).toBeLessThan(0.7);

    const gunsVsBo = calculateSimilarity("Guns N' Roses", "Bo Burnham");
    expect(gunsVsBo).toBeLessThan(0.2);
  });

  it("handles live / remastered versions with high similarity", () => {
    const sim = calculateSimilarity("Kamu-Kamulah Surgaku", "Kamu-Kamulah Surgaku (Live)");
    expect(sim).toBeGreaterThanOrEqual(0.75);
  });
});

describe("addRomajiToLyrics", () => {
  it("generates spaced Hepburn romaji for Japanese lines and leaves non-Japanese intact", async () => {
    const input = [
      { time: 0, text: "夜に駆ける" },
      { time: 5, text: "Hello World" },
      { time: 10, text: "沈むように溶けてゆくように" },
    ];

    const result = await addRomajiToLyrics(input);
    expect(result).toHaveLength(3);
    expect(result[0].romaji).toBe("yoru ni kakeru");
    expect(result[1].romaji).toBeUndefined();
    expect(result[2].romaji).toBe("shizumu yō ni toke te yuku yō ni");
  });
});

describe("getLyrics regression - Kamu-Kamulah Surgaku", () => {
  it("fetches correct T.R.I.A.D lyrics from LRCLIB and avoids Unison false match", async () => {
    const result = await getLyrics("Kamu-Kamulah Surgaku", "T.R.I.A.D", {
      duration: 323,
      videoId: "zNY5YmAXwec",
    });

    expect(result.source).toBe("LRCLIB");
    expect(result.synced).toBe(true);
    expect(result.lines.length).toBeGreaterThan(0);
    // Verified line from Kamu-Kamulah Surgaku
    const firstLine = result.lines[0];
    expect(firstLine.text).toContain("Tahukah kamu");
    // Ensure it NEVER contains lyrics from "Rindu Aku Rindu Kamu"
    const hasWrongSong = result.lines.some((l) => l.text.includes("ombak di laut") || l.text.includes("pasang"));
    expect(hasWrongSong).toBe(false);
  }, 15000);

  it("fetches correct Guns N' Roses lyrics for Welcome To The Jungle and avoids Bo Burnham false match", async () => {
    const result = await getLyrics("Welcome To The Jungle", "Guns N' Roses", {
      duration: 275,
      videoId: "o1tj2zJ2Wvg",
    });

    expect(result.synced).toBe(true);
    expect(result.lines.length).toBeGreaterThan(0);
    // Verified authentic lyrics from Welcome To The Jungle
    const hasJungleLine = result.lines.some((l) =>
      l.text.toLowerCase().includes("welcome to the jungle") ||
      l.text.toLowerCase().includes("fun and games") ||
      l.text.toLowerCase().includes("watch you bleed")
    );
    expect(hasJungleLine).toBe(true);

    // Ensure it NEVER contains Bo Burnham's "Welcome to the Internet" lyrics
    const hasInternetLyrics = result.lines.some((l) =>
      l.text.toLowerCase().includes("apathy's a tragedy") ||
      l.text.toLowerCase().includes("boredom is a crime") ||
      l.text.toLowerCase().includes("anything and everything, all of the time")
    );
    expect(hasInternetLyrics).toBe(false);
  }, 15000);

  it("enforces maximum cache size and evicts oldest entries", () => {
    lyricsCache.clear();
    for (let i = 0; i < MAX_LYRICS_CACHE_SIZE + 10; i++) {
      setCachedLyrics(`key_${i}`, {
        synced: false,
        instrumental: false,
        lines: [{ time: 0, text: `Line ${i}` }],
      });
    }

    expect(lyricsCache.size).toBe(MAX_LYRICS_CACHE_SIZE);
    expect(getCachedLyrics("key_0")).toBeUndefined();
    expect(getCachedLyrics("key_9")).toBeUndefined();
    expect(getCachedLyrics("key_10")).toBeDefined();
    expect(getCachedLyrics(`key_${MAX_LYRICS_CACHE_SIZE + 9}`)).toBeDefined();

    // Re-setting existing key does not evict another key
    setCachedLyrics("key_10", {
      synced: true,
      instrumental: false,
      lines: [{ time: 0, text: "Updated line" }],
    });
    expect(lyricsCache.size).toBe(MAX_LYRICS_CACHE_SIZE);
    expect(getCachedLyrics("key_11")).toBeDefined();
    expect(getCachedLyrics("key_10")?.synced).toBe(true);
  });
});

