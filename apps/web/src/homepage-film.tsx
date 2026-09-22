import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { ArrowsOut, Play, X } from "@phosphor-icons/react";
import { fr as t } from "./i18n";
import "./homepage-film.css";

const copy = t.homepage.film;
const phoneQuery =
  "(max-width: 767px), (pointer: coarse) and (max-height: 500px)";
type Format = "horizontal" | "vertical";
type SafariVideo = HTMLVideoElement & {
  webkitEnterFullscreen?: () => void;
  webkitExitFullscreen?: () => void;
  webkitDisplayingFullscreen?: boolean;
};
const movie = (format: Format) => `/videos/guteneo-${format}-v5.mp4`;
const poster = (format: Format) => `/videos/guteneo-${format}-v5.webp`;

export function HomepageFilm() {
  const video = useRef<SafariVideo>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const selectedFormat = useRef<Format | null>(null);
  const wantsFullscreen = useRef(false);
  const retryNativeFullscreen = useRef(false);
  const playbackAttempt = useRef(0);
  const [format, setFormat] = useState<Format | null>(null);
  const [status, setStatus] = useState<"ready" | "loading" | "error" | "ended">(
    "ready",
  );

  useEffect(() => {
    const player = video.current;
    if (!player) return;
    let wasFullscreen = false;
    function fullscreenChange() {
      const isFullscreen = document.fullscreenElement === player;
      if (wasFullscreen && !isFullscreen) {
        wantsFullscreen.current = false;
        retryNativeFullscreen.current = false;
        (player?.ended ? trigger.current : player)?.focus({
          preventScroll: true,
        });
      }
      wasFullscreen = isFullscreen;
    }
    function nativeFullscreenEnd() {
      wantsFullscreen.current = false;
      retryNativeFullscreen.current = false;
      (player?.ended ? trigger.current : player)?.focus({
        preventScroll: true,
      });
    }
    document.addEventListener("fullscreenchange", fullscreenChange);
    player.addEventListener("webkitendfullscreen", nativeFullscreenEnd);
    return () => {
      document.removeEventListener("fullscreenchange", fullscreenChange);
      player.removeEventListener("webkitendfullscreen", nativeFullscreenEnd);
    };
  }, []);

  function enterNativeFullscreen(allowRetry: boolean) {
    const player = video.current;
    if (!player?.webkitEnterFullscreen || !wantsFullscreen.current) return;
    try {
      player.webkitEnterFullscreen();
      retryNativeFullscreen.current = false;
    } catch {
      // Safari may not have metadata on the first gesture. Retry once when
      // playback starts; native controls and the fullscreen button remain usable.
      retryNativeFullscreen.current = allowRetry;
    }
  }

  function enterFullscreen() {
    const player = video.current;
    if (!player) return;
    wantsFullscreen.current = true;
    if (player.requestFullscreen) {
      try {
        void player
          .requestFullscreen()
          .catch(() => enterNativeFullscreen(true));
      } catch {
        enterNativeFullscreen(true);
      }
    } else {
      enterNativeFullscreen(true);
    }
  }

  function exitFullscreen() {
    const player = video.current;
    wantsFullscreen.current = false;
    retryNativeFullscreen.current = false;
    if (document.fullscreenElement === player) {
      void document.exitFullscreen().catch(() => undefined);
    } else if (player?.webkitDisplayingFullscreen) {
      player.webkitExitFullscreen?.();
    }
  }

  function start() {
    const player = video.current;
    if (!player) return;
    const attempt = ++playbackAttempt.current;
    // Read viewport only after an explicit gesture. No media URL is attached
    // before this point, and rotation never replaces a playing movie.
    const nextFormat =
      selectedFormat.current ??
      (window.matchMedia(phoneQuery).matches ? "vertical" : "horizontal");
    selectedFormat.current = nextFormat;
    if (!player.getAttribute("src")) player.src = movie(nextFormat);
    else if (player.error) player.load();
    if (status === "ended") player.currentTime = 0;
    flushSync(() => {
      setFormat(nextFormat);
      setStatus("loading");
    });
    // Both browser APIs run within the original click/keyboard activation.
    enterFullscreen();
    void player.play().catch(() => {
      if (attempt !== playbackAttempt.current) return;
      if (player.getAttribute("src")) setStatus("error");
      exitFullscreen();
    });
    player.focus({ preventScroll: true });
  }

  function close() {
    const player = video.current;
    if (!player) return;
    playbackAttempt.current += 1;
    exitFullscreen();
    player.pause();
    player.removeAttribute("src");
    player.load();
    selectedFormat.current = null;
    flushSync(() => {
      setFormat(null);
      setStatus("ready");
    });
    trigger.current?.focus({ preventScroll: true });
  }

  return (
    <section className="homepage-film" aria-labelledby="homepage-film-title">
      <div className="homepage-film-heading">
        <h2 id="homepage-film-title">
          {copy.title} <em>{copy.italic}</em>
        </h2>
        <p>{copy.intro}</p>
      </div>
      <div className="homepage-film-frame" data-format={format ?? undefined}>
        <video
          ref={video}
          className="homepage-film-video"
          controls={format !== null}
          preload="none"
          tabIndex={format ? 0 : -1}
          aria-label={copy.videoLabel}
          aria-describedby="homepage-film-transcript"
          hidden={!format}
          onPlaying={() => {
            setStatus("ready");
            if (retryNativeFullscreen.current) enterNativeFullscreen(false);
          }}
          onEnded={() => {
            exitFullscreen();
            flushSync(() => setStatus("ended"));
            trigger.current?.focus({ preventScroll: true });
          }}
          onError={() => {
            if (!video.current?.getAttribute("src")) return;
            setStatus("error");
            exitFullscreen();
          }}
        />
        {!format && (
          <picture className="homepage-film-poster">
            <source media={phoneQuery} srcSet={poster("vertical")} />
            <img
              src={poster("horizontal")}
              alt=""
              loading="lazy"
              decoding="async"
              width="1920"
              height="1080"
            />
          </picture>
        )}
        {(!format || status === "ended") && (
          <button
            ref={trigger}
            type="button"
            className="homepage-film-play"
            onClick={start}
          >
            <span className="homepage-film-play-icon">
              <Play size={25} weight="fill" aria-hidden="true" />
            </span>
            <span>
              {status === "ended" ? copy.replay : copy.play}
              <small>{copy.duration}</small>
            </span>
          </button>
        )}
      </div>
      {format && (
        <div className="homepage-film-toolbar">
          <button type="button" onClick={enterFullscreen}>
            <ArrowsOut size={18} aria-hidden="true" />
            {copy.fullscreen}
          </button>
          <button type="button" onClick={close}>
            <X size={18} aria-hidden="true" />
            {copy.close}
          </button>
        </div>
      )}
      {status === "loading" && (
        <p className="homepage-film-status" role="status">
          {copy.loading}
        </p>
      )}
      {status === "error" && (
        <div className="homepage-film-error" role="alert">
          <p>{copy.error}</p>
          <button type="button" className="button small" onClick={start}>
            {t.retry}
            <Play size={16} aria-hidden="true" />
          </button>
        </div>
      )}
      <details
        className="homepage-film-transcript"
        id="homepage-film-transcript"
      >
        <summary>{copy.transcriptTitle}</summary>
        <p>{copy.transcript}</p>
      </details>
    </section>
  );
}
