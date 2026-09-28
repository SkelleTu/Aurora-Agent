export class PlaybackTracker {
  constructor() { this.responseId = null; this.playedMs = 0; }
  start(responseId) { this.responseId = responseId; this.playedMs = 0; }
  progress(ms) { this.playedMs = Math.max(this.playedMs, Number(ms) || 0); }
  current() { return this.playedMs; }
  stop() { const value = this.playedMs; this.responseId = null; this.playedMs = 0; return value; }
}
