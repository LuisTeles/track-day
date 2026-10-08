const ID_RE = /^[A-Za-z0-9_-]{11}$/;
const HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
]);

/** Accepts youtu.be/ID, youtube.com/watch?v=ID, /shorts/ID, /embed/ID, /live/ID, m. and nocookie hosts, extra params, or a bare 11-char id. */
export function parseYouTubeId(input: string): string | null {
  const text = input.trim();
  if (ID_RE.test(text)) return text;
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.toLowerCase();
  let candidate: string | null | undefined;
  if (host === "youtu.be" || host === "www.youtu.be") {
    candidate = url.pathname.split("/")[1];
  } else if (HOSTS.has(host)) {
    const [, first, second] = url.pathname.split("/");
    if (first === "watch") candidate = url.searchParams.get("v");
    else if (first === "shorts" || first === "embed" || first === "live") candidate = second;
  }
  return candidate && ID_RE.test(candidate) ? candidate : null;
}

export function youtubeWatchUrl(id: string, atSec?: number): string {
  const base = `https://www.youtube.com/watch?v=${id}`;
  return atSec == null || !Number.isFinite(atSec)
    ? base
    : `${base}&t=${Math.max(0, Math.floor(atSec))}s`;
}
