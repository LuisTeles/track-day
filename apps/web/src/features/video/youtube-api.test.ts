import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Win = Window & { YT?: unknown; onYouTubeIframeAPIReady?: () => void };
const win = window as Win;

let scripts: HTMLScriptElement[];
let appendSpy: ReturnType<typeof vi.spyOn>;

async function freshLoader() {
  vi.resetModules();
  return (await import("./youtube-api")).loadYouTubeApi;
}

beforeEach(() => {
  scripts = [];
  delete win.YT;
  delete win.onYouTubeIframeAPIReady;
  appendSpy = vi.spyOn(document.head, "appendChild").mockImplementation(((node: Node) => {
    scripts.push(node as HTMLScriptElement);
    return node;
  }) as typeof document.head.appendChild);
});

afterEach(() => {
  appendSpy.mockRestore();
  vi.useRealTimers();
});

describe("loadYouTubeApi", () => {
  it("injects the script once and resolves when the API reports ready", async () => {
    const load = await freshLoader();
    const a = load();
    const b = load();
    expect(scripts).toHaveLength(1);
    expect(scripts[0]!.src).toBe("https://www.youtube.com/iframe_api");
    const YT = { Player: class {} };
    win.YT = YT;
    win.onYouTubeIframeAPIReady?.();
    await expect(a).resolves.toBe(YT);
    await expect(b).resolves.toBe(YT);
  });

  it("resolves immediately when YT is already present", async () => {
    const load = await freshLoader();
    const YT = { Player: class {} };
    win.YT = YT;
    await expect(load()).resolves.toBe(YT);
    expect(scripts).toHaveLength(0);
  });

  it("rejects on script error and retries afterwards", async () => {
    const load = await freshLoader();
    const first = load();
    scripts[0]!.onerror?.(new Event("error"));
    await expect(first).rejects.toThrow();
    const second = load();
    expect(scripts).toHaveLength(2);
    win.YT = { Player: class {} };
    win.onYouTubeIframeAPIReady?.();
    await expect(second).resolves.toBeDefined();
  });

  it("rejects after the timeout", async () => {
    vi.useFakeTimers();
    const load = await freshLoader();
    const p = load(500);
    const assertion = expect(p).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(501);
    await assertion;
  });

  it("ignores a late script error after a timeout and lets the retry finish", async () => {
    vi.useFakeTimers();
    const load = await freshLoader();
    const first = load(500);
    const firstAssertion = expect(first).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(501);
    await firstAssertion;

    const retry = load();
    expect(scripts).toHaveLength(2);
    scripts[0]!.onerror?.(new Event("error")); // late, from the timed-out attempt
    expect(load()).toBe(retry);
    expect(scripts).toHaveLength(2);
    expect(win.onYouTubeIframeAPIReady).toBeTypeOf("function");
    const YT = { Player: class {} };
    win.YT = YT;
    win.onYouTubeIframeAPIReady?.();
    await expect(retry).resolves.toBe(YT);
  });

  it("does not throw on a late ready after a timeout, and a later call resolves", async () => {
    vi.useFakeTimers();
    const load = await freshLoader();
    const first = load(500);
    const firstAssertion = expect(first).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(501);
    await firstAssertion;
    const YT = { Player: class {} };
    win.YT = YT;
    expect(() => win.onYouTubeIframeAPIReady?.()).not.toThrow();
    await expect(load()).resolves.toBe(YT);
  });
});
