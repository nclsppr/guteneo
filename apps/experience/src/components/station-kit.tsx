import { useEffect, useId, useState } from "react";
import { SplitFlap } from "./split-flap";
import { formatDateTime, formatTime, STATION_TIME_ZONE } from "../format";
import { useI18n } from "../i18n";
import type { Line } from "../api/types";
import "./station-kit.css";

const LINE_LETTERS: Record<Line, string> = {
  fax: "F",
  email: "E",
  postal: "P",
  locker: "S",
};

/**
 * A line bullet, as on a network map. The letter carries the meaning; the
 * color only helps to find it again, so nothing depends on color alone.
 */
export function LineRoundel({
  line,
  size = "md",
}: {
  line: Line;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <span className={`roundel is-${line} is-${size}`} aria-hidden="true">
      {LINE_LETTERS[line]}
    </span>
  );
}

function useMinute(): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const arm = () => {
      // Wake on the minute boundary, not every second: one render a minute.
      timer = setTimeout(
        () => {
          setNow(Date.now());
          arm();
        },
        60_000 - (Date.now() % 60_000) + 20,
      );
    };
    arm();
    const wake = () => setNow(Date.now());
    document.addEventListener("visibilitychange", wake);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", wake);
    };
  }, []);
  return now;
}

/**
 * Station time: the product's single declared UTC context, shown as a flap
 * clock so every timestamp on a board can be read against it.
 */
export function StationClock({ size = "lg" }: { size?: "md" | "lg" }) {
  const { locale, t } = useI18n();
  const now = useMinute();
  const text = formatTime(now, locale);
  return (
    <time
      className="station-clock"
      dateTime={new Date(now).toISOString()}
      title={formatDateTime(now, locale)}
    >
      <span className="visually-hidden">
        {t("station.clock", { time: text, zone: STATION_TIME_ZONE })}
      </span>
      <SplitFlap text={text} cells={5} size={size} />
      <span className="plate" aria-hidden="true">
        {STATION_TIME_ZONE}
      </span>
    </time>
  );
}

/**
 * An amber dot-matrix strip. With several messages it shows one at a time
 * and can be paused; with reduced motion it never moves and lists them all.
 */
export function LedStrip({ items, label }: { items: string[]; label: string }) {
  const { t } = useI18n();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [still, setStill] = useState(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setStill(preference.matches);
    preference.addEventListener("change", update);
    return () => preference.removeEventListener("change", update);
  }, []);
  const cycling = items.length > 1 && !still;
  useEffect(() => {
    if (!cycling || paused) return;
    const timer = setInterval(
      () => setIndex((current) => (current + 1) % items.length),
      6000,
    );
    return () => clearInterval(timer);
  }, [cycling, paused, items.length]);
  if (!items.length) return null;
  const current = items[index % items.length];
  return (
    <div className="led-strip" role="region" aria-label={label}>
      <span
        className="led-lamp"
        data-cycling={cycling && !paused}
        aria-hidden="true"
      />
      {/* Every message stays available to assistive technology at once. */}
      <ul className="visually-hidden">
        {items.map((item, position) => (
          <li key={position}>{item}</li>
        ))}
      </ul>
      <p className="led-text" aria-hidden="true" key={cycling ? index : "all"}>
        {cycling ? current : items.join("  ·  ")}
      </p>
      {cycling && (
        <button
          className="led-pause"
          type="button"
          aria-pressed={paused}
          onClick={() => setPaused((value) => !value)}
        >
          {t(paused ? "station.led.resume" : "station.led.pause")}
        </button>
      )}
    </div>
  );
}

/**
 * The approval fingerprint drawn as ticket bars. It is the same value the
 * server binds the approval to, so the picture changes whenever the frozen
 * content, recipient, options or price would.
 */
export function Barcode({ value }: { value: string }) {
  const digits = [...value.toLowerCase()].filter((c) => /[0-9a-f]/.test(c));
  let x = 0;
  const bars: { x: number; width: number }[] = [];
  digits.forEach((digit) => {
    const nibble = parseInt(digit, 16);
    const width = 1 + (nibble & 3);
    bars.push({ x, width });
    x += width + 1 + (nibble >> 2);
  });
  if (!bars.length) return null;
  return (
    <svg
      className="barcode"
      viewBox={`0 0 ${x} 40`}
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      {bars.map((bar, index) => (
        <rect key={index} x={bar.x} y="0" width={bar.width} height="40" />
      ))}
    </svg>
  );
}

/**
 * A round cancellation mark of our own drawing, struck over the stamp once a
 * dispatch has left. It never alters the stamp artwork itself.
 */
export function Postmark({ date, place }: { date: string; place: string }) {
  const arc = useId();
  return (
    <svg
      className="postmark"
      viewBox="0 0 120 120"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <path id={arc} d="M 60 60 m -42 0 a 42 42 0 1 1 84 0" />
      </defs>
      <circle cx="60" cy="60" r="55" />
      <circle cx="60" cy="60" r="35" />
      <text className="postmark-place">
        <textPath href={`#${arc}`} startOffset="50%" textAnchor="middle">
          {place}
        </textPath>
      </text>
      <text className="postmark-date" x="60" y="65" textAnchor="middle">
        {date}
      </text>
      <path d="M 26 84 q 8 -6 16 0 t 16 0 t 16 0 t 16 0" />
      <path d="M 30 93 q 7 -5 14 0 t 14 0 t 14 0 t 14 0" />
    </svg>
  );
}
