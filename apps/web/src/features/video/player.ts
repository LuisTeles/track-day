export interface VideoPlayerHandle {
  currentTime(): number;
  seek(sec: number): void;
  play(): void;
  pause(): void;
  isPlaying(): boolean;
}
