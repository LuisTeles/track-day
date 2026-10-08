import { describe, expect, it } from "vitest";
import { parseYouTubeId, youtubeWatchUrl } from "./youtube-id";

const ID = "dQw4w9WgXcQ";

describe("parseYouTubeId", () => {
  it.each([
    `https://youtu.be/${ID}`,
    `https://www.youtube.com/watch?v=${ID}`,
    `https://youtube.com/watch?v=${ID}`,
    `https://m.youtube.com/watch?v=${ID}`,
    `https://www.youtube.com/shorts/${ID}`,
    `https://www.youtube.com/embed/${ID}`,
    `https://www.youtube-nocookie.com/embed/${ID}`,
    `https://www.youtube.com/live/${ID}`,
    `youtube.com/watch?v=${ID}`,
    `https://music.youtube.com/watch?v=${ID}`,
    ID,
  ])("accepts %s", (input) => {
    expect(parseYouTubeId(input)).toBe(ID);
  });

  it("ignores extra params and trims whitespace", () => {
    expect(parseYouTubeId(`  https://youtu.be/${ID}?t=30  `)).toBe(ID);
    expect(parseYouTubeId(`https://www.youtube.com/watch?v=${ID}&list=PL123&t=30`)).toBe(ID);
    expect(parseYouTubeId(`https://www.youtube.com/watch?list=PL1&v=${ID}`)).toBe(ID);
  });

  it("rejects bad input", () => {
    expect(parseYouTubeId("https://www.youtube.com/watch")).toBeNull();
    expect(parseYouTubeId(`https://vimeo.com/${ID}`)).toBeNull();
    expect(parseYouTubeId(`https://evil.com/watch?v=${ID}`)).toBeNull();
    expect(parseYouTubeId(`https://youtube.com.evil.com/watch?v=${ID}`)).toBeNull();
    expect(parseYouTubeId(ID.slice(0, 10))).toBeNull();
    expect(parseYouTubeId(`${ID}x`)).toBeNull();
    expect(parseYouTubeId(`https://youtu.be/${ID}x`)).toBeNull();
    expect(parseYouTubeId(`https://youtube.com@evil.com/watch?v=${ID}`)).toBeNull();
    expect(parseYouTubeId(`https://evil.com/youtube.com/watch?v=${ID}`)).toBeNull();
    expect(parseYouTubeId("")).toBeNull();
  });
});

describe("youtubeWatchUrl", () => {
  it("builds a watch url", () => {
    expect(youtubeWatchUrl(ID)).toBe(`https://www.youtube.com/watch?v=${ID}`);
    expect(youtubeWatchUrl(ID, 83.7)).toBe(`https://www.youtube.com/watch?v=${ID}&t=83s`);
    expect(youtubeWatchUrl(ID, NaN)).toBe(`https://www.youtube.com/watch?v=${ID}`);
    expect(youtubeWatchUrl(ID, Infinity)).toBe(`https://www.youtube.com/watch?v=${ID}`);
    expect(youtubeWatchUrl(ID, 0)).toBe(`https://www.youtube.com/watch?v=${ID}&t=0s`);
  });
});
