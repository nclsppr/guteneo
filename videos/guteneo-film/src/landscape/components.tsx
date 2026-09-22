import React from "react";
import {
  AbsoluteFill,
  CanvasImage,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";
import { C, clamp, ease, mono, sans, serif } from "../design";

export { C, clamp, ease, mono, sans, serif };

export const Frame: React.FC<
  React.PropsWithChildren<{ blue?: boolean; dark?: boolean }>
> = ({ children, blue, dark }) => (
  <AbsoluteFill
    style={{
      background: blue ? C.blue : dark ? C.ink : C.paper,
      color: blue || dark ? C.paper : C.ink,
      fontFamily: sans,
      overflow: "hidden",
    }}
  >
    {children}
  </AbsoluteFill>
);

export const Mark: React.FC<{ size?: number }> = ({ size = 72 }) => (
  <CanvasImage
    src={staticFile("brand/guteneo-mark.png")}
    style={{
      width: size,
      height: size,
      objectFit: "contain",
      mixBlendMode: "multiply",
    }}
  />
);

export const Brand = () => (
  <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
    <Mark size={78} />
    <span style={{ fontFamily: serif, fontSize: 65, letterSpacing: -2 }}>
      guteneo
    </span>
  </div>
);

export const Kicker: React.FC<React.PropsWithChildren<{ light?: boolean }>> = ({
  children,
  light,
}) => (
  <div
    style={{
      fontFamily: mono,
      fontSize: 24,
      letterSpacing: 2.5,
      textTransform: "uppercase",
      color: light ? "#dfe7ff" : C.blue,
    }}
  >
    {children}
  </div>
);

export const Head: React.FC<
  React.PropsWithChildren<{ size?: number; style?: React.CSSProperties }>
> = ({ children, size = 138, style }) => (
  <div
    style={{
      fontFamily: serif,
      fontSize: size,
      lineHeight: 0.98,
      letterSpacing: -3,
      ...style,
    }}
  >
    {children}
  </div>
);

export const Label: React.FC<
  React.PropsWithChildren<{ light?: boolean; style?: React.CSSProperties }>
> = ({ children, light, style }) => (
  <div
    style={{
      fontSize: 34,
      lineHeight: 1.4,
      color: light ? "#e1e6f4" : "#626b67",
      ...style,
    }}
  >
    {children}
  </div>
);

export const Lift: React.FC<
  React.PropsWithChildren<{ at?: number; style?: React.CSSProperties }>
> = ({ children, at = 0, style }) => {
  const f = useCurrentFrame();
  return (
    <div
      style={{
        ...style,
        opacity: interpolate(f, [at, at + 9], [0, 1], clamp),
        translate: interpolate(f, [at, at + 24], ["0px 70px", "0px 0px"], {
          ...clamp,
          easing: ease,
        }),
        filter: `blur(${interpolate(f, [at, at + 12], [5, 0], clamp)}px)`,
      }}
    >
      {children}
    </div>
  );
};

/** A brand mark on a document is deliberately not a cancelled postage stamp. */
export const Sheet: React.FC<{
  name?: string;
  template?: boolean;
  style?: React.CSSProperties;
}> = ({ name = "Camille", template, style }) => (
  <div
    style={{
      width: 540,
      height: 736,
      background: "#fffefa",
      boxShadow: "0 32px 85px #15223826",
      padding: 46,
      color: C.ink,
      ...style,
    }}
  >
    <Mark size={66} />
    <div
      style={{ width: 95, height: 3, background: C.blue, margin: "30px 0" }}
    />
    <div
      style={{
        fontFamily: serif,
        fontSize: 50,
        lineHeight: 1.1,
        marginBottom: 35,
      }}
    >
      Bonjour{" "}
      <em style={{ color: C.blue }}>{template ? "{{prénom}}" : name}</em>,
    </div>
    {[96, 86, 100, 95, 68, 0, 88, 97, 75].map((w, i) => (
      <div
        key={i}
        style={{
          width: `${w}%`,
          height: 6,
          background: "#a9aca9",
          marginBottom: 17,
          opacity: 0.6,
        }}
      />
    ))}
    <div
      style={{
        fontFamily: serif,
        fontSize: 33,
        fontStyle: "italic",
        color: C.blue,
        marginTop: 30,
      }}
    >
      Une attention pour vous.
    </div>
  </div>
);

export const Check: React.FC<{ size?: number; color?: string }> = ({
  size = 36,
  color = C.blue,
}) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
    <path
      d="M6 16l7 7L27 8"
      stroke={color}
      strokeWidth="3.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);
