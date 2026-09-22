import React from "react";
import { loadFont } from "@remotion/fonts";
import {
  AbsoluteFill,
  CanvasImage,
  Easing,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";

export const C = {
  paper: "#f6f5ef",
  ink: "#181b22",
  blue: "#2450db",
  muted: "#777971",
};
export const ease = Easing.bezier(0.16, 1, 0.3, 1);
export const clamp = {
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp",
} as const;
export const serif = "Garamond, Georgia, serif";
export const sans = "Plex, sans-serif";
export const mono = "Plex Mono, monospace";

void Promise.all([
  loadFont({
    family: "Garamond",
    url: staticFile("fonts/garamond.woff2"),
    weight: "400",
  }),
  loadFont({
    family: "Garamond",
    url: staticFile("fonts/garamond-italic.woff2"),
    weight: "400",
    style: "italic",
  }),
  loadFont({
    family: "Plex",
    url: staticFile("fonts/plex.woff2"),
    weight: "400",
  }),
  loadFont({
    family: "Plex",
    url: staticFile("fonts/plex-medium.woff2"),
    weight: "500",
  }),
  loadFont({
    family: "Plex Mono",
    url: staticFile("fonts/mono.woff2"),
    weight: "400",
  }),
]);

export const Paper: React.FC<React.PropsWithChildren<{ dark?: boolean }>> = ({
  children,
  dark = false,
}) => (
  <AbsoluteFill
    style={{
      backgroundColor: dark ? C.ink : C.paper,
      color: dark ? C.paper : C.ink,
      fontFamily: sans,
    }}
  >
    {children}
  </AbsoluteFill>
);

export const Brand: React.FC<{ light?: boolean }> = ({ light = false }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
    <CanvasImage
      src={staticFile("brand/guteneo-mark.png")}
      style={{ width: 52, height: 52 }}
    />
    <span
      style={{
        fontFamily: serif,
        fontSize: 48,
        color: light ? C.paper : C.ink,
        letterSpacing: -2,
      }}
    >
      guteneo
    </span>
  </div>
);

export const Reveal: React.FC<
  React.PropsWithChildren<{ delay?: number; style?: React.CSSProperties }>
> = ({ children, delay = 0, style }) => {
  const f = useCurrentFrame();
  return (
    <div
      style={{
        ...style,
        opacity: interpolate(f, [delay, delay + 20], [0, 1], clamp),
        translate: interpolate(
          f,
          [delay, delay + 34],
          ["0px 44px", "0px 0px"],
          { ...clamp, easing: ease },
        ),
      }}
    >
      {children}
    </div>
  );
};

export const Eyebrow: React.FC<
  React.PropsWithChildren<{ light?: boolean }>
> = ({ children, light = false }) => (
  <div
    style={{
      fontFamily: mono,
      fontSize: 23,
      letterSpacing: 3,
      textTransform: "uppercase",
      color: light ? "#dfdfd8" : C.blue,
    }}
  >
    {children}
  </div>
);

export const Document: React.FC<{ style?: React.CSSProperties }> = ({
  style,
}) => (
  <div
    style={{
      width: 450,
      height: 620,
      padding: "42px 44px",
      background: "#fffefa",
      boxShadow: "0 28px 90px #171b2420",
      color: C.ink,
      ...style,
    }}
  >
    <CanvasImage
      src={staticFile("brand/guteneo-mark.png")}
      style={{ width: 53, height: 53, marginBottom: 38 }}
    />
    <div
      style={{
        fontFamily: serif,
        fontSize: 39,
        lineHeight: 1.04,
        marginBottom: 28,
      }}
    >
      Les mots
      <br />
      qui comptent.
    </div>
    <div
      style={{ height: 2, background: C.blue, width: 70, marginBottom: 36 }}
    />
    {[94, 100, 88, 96, 63, 0, 100, 90, 98, 70].map((w, i) => (
      <div
        key={i}
        style={{
          width: `${w}%`,
          height: 5,
          background: "#9b9d97",
          opacity: 0.48,
          marginBottom: 12,
        }}
      />
    ))}
    <div
      style={{
        fontFamily: serif,
        fontStyle: "italic",
        fontSize: 28,
        marginTop: 35,
        color: C.blue,
      }}
    >
      À vous de transmettre.
    </div>
  </div>
);
