/** Minimal subset of the YouTube IFrame API that Track Day uses. */
export interface YTPlayer {
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  playVideo(): void;
  pauseVideo(): void;
  getCurrentTime(): number;
  getPlayerState(): number;
  getIframe?(): HTMLIFrameElement;
  destroy(): void;
}

export interface YTPlayerOptions {
  videoId: string;
  host?: string;
  playerVars?: Record<string, string | number>;
  events?: {
    onReady?(event: { target: YTPlayer }): void;
    onError?(event: { data: number }): void;
  };
}

export interface YTNamespace {
  Player: new (element: HTMLElement, options: YTPlayerOptions) => YTPlayer;
  PlayerState?: { PLAYING: number };
}

type YTWindow = Window & {
  YT?: YTNamespace;
  onYouTubeIframeAPIReady?: () => void;
};

const SCRIPT_SRC = "https://www.youtube.com/iframe_api";
let pending: Promise<YTNamespace> | null = null;

/**
 * Injects https://www.youtube.com/iframe_api once and resolves window.YT; rejects after
 * `timeoutMs` (default 10000) or on script error. A later call after a failure retries.
 */
export function loadYouTubeApi(timeoutMs = 10000): Promise<YTNamespace> {
  const w = window as YTWindow;
  if (w.YT?.Player) return Promise.resolve(w.YT);
  if (pending) return pending;

  const attempt = new Promise<YTNamespace>((resolve, reject) => {
    const script = document.createElement("script");
    const previous = w.onYouTubeIframeAPIReady;
    const fail = (message: string) => {
      clearTimeout(timer);
      script.remove();
      w.onYouTubeIframeAPIReady = previous;
      pending = null;
      reject(new Error(message));
    };

    w.onYouTubeIframeAPIReady = () => {
      previous?.();
      if (w.YT?.Player) {
        clearTimeout(timer);
        resolve(w.YT);
      }
    };
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onerror = () => fail("Could not load the YouTube player script.");
    const timer = setTimeout(() => fail("Timed out loading the YouTube player script."), timeoutMs);
    document.head.appendChild(script);
  });
  pending = attempt;
  // Callers handle rejection; this keeps the cached promise itself from being "unhandled".
  attempt.catch(() => {});
  return attempt;
}
