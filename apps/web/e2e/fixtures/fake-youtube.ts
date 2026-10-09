// Stands in for https://www.youtube.com/iframe_api in e2e, so tests never touch YouTube.
// The player is a plain div (no iframe); its time is `window.__ytTime`, which `seekTo` sets.
export const FAKE_YOUTUBE_API = `
(function () {
  if (typeof window.__ytTime !== "number") window.__ytTime = 0;
  function Player(element, options) {
    var div = document.createElement("div");
    div.setAttribute("data-testid", "fake-youtube");
    div.setAttribute("data-video-id", options.videoId);
    div.textContent = "Fake YouTube player";
    div.style.cssText = "width:100%;height:100%;display:grid;place-items:center;color:#fff;background:#000";
    element.replaceWith(div);
    this._div = div;
    this._state = -1;
    var self = this;
    setTimeout(function () {
      if (options.events && options.events.onReady) options.events.onReady({ target: self });
    }, 0);
  }
  Player.prototype.getCurrentTime = function () { return window.__ytTime; };
  Player.prototype.seekTo = function (sec) { window.__ytTime = sec; };
  Player.prototype.playVideo = function () { this._state = 1; };
  Player.prototype.pauseVideo = function () { this._state = 2; };
  Player.prototype.getPlayerState = function () { return this._state; };
  Player.prototype.getIframe = function () { return this._div; };
  Player.prototype.destroy = function () { this._div.remove(); };
  window.YT = { Player: Player, PlayerState: { PLAYING: 1 } };
  if (typeof window.onYouTubeIframeAPIReady === "function") window.onYouTubeIframeAPIReady();
})();
`;
