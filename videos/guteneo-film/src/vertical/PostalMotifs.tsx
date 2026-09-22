import React, { useId } from "react";
import {
  CanvasImage,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { C, clamp, mono, serif } from "../design";

type SwallowsProps = {
  /** Dimensions of the flight area, independent of the composition. */
  width?: number;
  height?: number;
  count?: 1 | 2 | 3;
  opacity?: number;
  /** A pale silhouette is useful over the deep blue Luxembourg image. */
  light?: boolean;
  /** Offsets the animation without adding a new Sequence. */
  frameOffset?: number;
  /** When provided, the flock leaves the frame by this point instead of looping. */
  durationInFrames?: number;
  style?: React.CSSProperties;
};

const flock = [
  { size: 112, y: 0.32, phase: 0.12, seconds: 10.8, wingbeat: 0.8 },
  { size: 70, y: 0.13, phase: 0.42, seconds: 13.5, wingbeat: 0.9 },
  { size: 46, y: 0.63, phase: 0.69, seconds: 12.1, wingbeat: 0.7 },
] as const;

/** The actual footer engraving, using its four wing poses on the render clock. */
export const Swallows: React.FC<SwallowsProps> = ({
  width = 1080,
  height = 400,
  count = 3,
  opacity = 0.85,
  light = false,
  frameOffset = 0,
  durationInFrames,
  style,
}) => {
  const frame = useCurrentFrame() + frameOffset;
  const { fps } = useVideoConfig();

  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        width,
        height,
        overflow: "hidden",
        pointerEvents: "none",
        ...style,
      }}
    >
      {flock.slice(0, count).map((bird, i) => {
        const cycle = bird.seconds * fps;
        const flight = (((frame + cycle * bird.phase) % cycle) + cycle) % cycle;
        const progress = durationInFrames
          ? interpolate(
              frame,
              [0, Math.max(1, durationInFrames - i * 8)],
              [bird.phase, 1.1],
              clamp,
            )
          : flight / cycle;
        const wing = Math.floor(
          ((((frame / fps / bird.wingbeat + i * 0.31) % 1) + 1) % 1) * 4,
        );

        return (
          <div
            key={i}
            style={{
              position: "absolute",
              width: bird.size,
              height: bird.size,
              left: interpolate(
                progress,
                [0, 1],
                [-bird.size, width + bird.size],
              ),
              top: height * bird.y,
              translate: `0px ${Math.sin(progress * Math.PI * 2 + i) * 19}px`,
              rotate: `${Math.sin(progress * Math.PI * 3 + i) * 4 - 2}deg`,
              opacity:
                opacity *
                interpolate(progress, [0, 0.06, 0.94, 1], [0, 1, 1, 0], clamp),
              overflow: "hidden",
              filter: light ? "brightness(0) invert(1)" : undefined,
            }}
          >
            <CanvasImage
              src={staticFile("brand/luxembourg-blue-swallow-sheet.webp")}
              style={{
                position: "absolute",
                width: bird.size * 2,
                height: bird.size * 2,
                maxWidth: "none",
                left: -(wing % 2) * bird.size,
                top: -Math.floor(wing / 2) * bird.size,
              }}
            />
          </div>
        );
      })}
    </div>
  );
};

type PostmarkProps = {
  width?: number;
  /** Alias for width when placing an oblitération beside a Stamp. */
  size?: number;
  color?: string;
  opacity?: number;
  /** 0 to 1: the ink lands as one impression, then settles. */
  progress?: number;
  style?: React.CSSProperties;
};

/** Founding-day postmark from the website, preserving its engraving and text. */
export const Postmark: React.FC<PostmarkProps> = ({
  width,
  size = 300,
  color = C.blue,
  opacity = 0.68,
  progress = 1,
  style,
}) => {
  const id = useId().replace(/:/g, "");
  const markWidth = width ?? size;

  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 300 230"
      width={markWidth}
      height={(markWidth * 230) / 300}
      style={{
        color,
        fill: "currentColor",
        opacity:
          opacity * interpolate(progress, [0, 0.3, 1], [0, 0.88, 1], clamp),
        scale: interpolate(progress, [0, 1], [1.13, 1], clamp),
        rotate: "-9deg",
        mixBlendMode: "multiply",
        overflow: "visible",
        pointerEvents: "none",
        ...style,
      }}
    >
      <defs>
        <path id={`${id}-top`} d="M25 139 A62 62 0 0 1 149 139" />
        <path id={`${id}-bottom`} d="M21 137 A66 66 0 0 0 153 137" />
        <pattern
          id={`${id}-grain`}
          width="9"
          height="11"
          patternUnits="userSpaceOnUse"
        >
          <rect width="9" height="11" fill="white" />
          <circle cx="2" cy="3" r="0.65" fill="black" />
          <path d="M6 8h1.2v0.7H6z" fill="black" />
        </pattern>
        <mask id={`${id}-ink`}>
          <rect width="300" height="230" fill={`url(#${id}-grain)`} />
        </mask>
      </defs>
      <g mask={`url(#${id}-ink)`}>
        <g fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="87" cy="137" r="73" />
          <circle cx="87" cy="137" r="69" strokeWidth="0.7" />
          <circle cx="87" cy="137" r="49" strokeWidth="1" />
          <path d="M159 107c20-14 37 14 57 0s37 14 67 0M161 122c20-14 37 14 57 0s37 14 67 0M161 152c20-14 37 14 57 0s37 14 67 0M159 167c20-14 37 14 57 0s37 14 67 0" />
        </g>
        <g style={{ fontFamily: mono, fontWeight: 400 }}>
          <text fontSize="12" letterSpacing="1.7">
            <textPath href={`#${id}-top`} startOffset="50%" textAnchor="middle">
              LUXEMBOURG
            </textPath>
          </text>
          <text fontSize="10" letterSpacing="1.5">
            <textPath
              href={`#${id}-bottom`}
              startOffset="50%"
              textAnchor="middle"
            >
              PREMIER JOUR
            </textPath>
          </text>
          <text
            fontSize="8"
            letterSpacing="2"
            x="87"
            y="116"
            textAnchor="middle"
          >
            POSTES
          </text>
          <text fontSize="14" x="87" y="140" textAnchor="middle">
            16.09.2026
          </text>
        </g>
        <text
          x="87"
          y="160"
          textAnchor="middle"
          style={{ fontFamily: serif, fontStyle: "italic", fontSize: 18 }}
        >
          guteneo
        </text>
      </g>
    </svg>
  );
};
