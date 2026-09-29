import { describe, expect, it } from "bun:test";
import {
  cleanTitleAndArtist,
  parseTimestamp,
  parseTtml,
  parseLrc,
  parseRawLyrics,
  mergeConsecutiveBilingualLines,
  selectBestLrclibMatch,
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
});
