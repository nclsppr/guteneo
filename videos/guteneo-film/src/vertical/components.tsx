import React from "react";
import {
  AbsoluteFill,
  CanvasImage,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";
import { C, clamp, ease, mono, sans, serif } from "../design";
import { Postmark } from "./PostalMotifs";
import { usePortraitLayout } from "./layout";

export { C, clamp, ease, mono, sans, serif };
export const Stamp: React.FC<{
  size?: number;
  /** Optical size in the 1080-wide scene, including a reduced parent. */
  displayScale?: number;
  postmark?: boolean;
  postmarkProgress?: number;
  style?: React.CSSProperties;
}> = ({
  size = 80,
  displayScale = 1,
  postmark = true,
  postmarkProgress = 1,
  style,
}) => (
  <div
    style={{
      position: "relative",
      width: size,
      height: size,
      flexShrink: 0,
      mixBlendMode: "multiply",
      ...style,
    }}
  >
    <CanvasImage
      src={staticFile(
        size * displayScale <= 80
          ? "brand/guteneo-mark.png"
          : "brand/guteneo-halftone.webp",
      )}
      style={{ width: size, height: size, mixBlendMode: "multiply" }}
    />
    {postmark && (
      <Postmark
        width={size * 1.2}
        color={C.ink}
        opacity={0.72}
        progress={postmarkProgress}
        style={{ position: "absolute", left: -size * 0.4, top: size * 0.14 }}
      />
    )}
  </div>
);

export const Frame: React.FC<
  React.PropsWithChildren<{
    blue?: boolean;
    dark?: boolean;
    style?: React.CSSProperties;
  }>
> = ({ children, blue, dark, style }) => (
  <AbsoluteFill
    style={{
      background: blue ? C.blue : dark ? C.ink : C.paper,
      color: blue || dark ? C.paper : C.ink,
      fontFamily: sans,
      overflow: "hidden",
      ...style,
    }}
  >
    {children}
  </AbsoluteFill>
);

export const Kicker: React.FC<
  React.PropsWithChildren<{ light?: boolean; style?: React.CSSProperties }>
> = ({ children, light, style }) => (
  <div
    style={{
      fontFamily: mono,
      fontSize: 28,
      letterSpacing: 2.5,
      textTransform: "uppercase",
      color: light ? "#dfe7ff" : C.blue,
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
        translate: interpolate(f, [at, at + 22], ["0px 90px", "0px 0px"], {
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

export const Head: React.FC<
  React.PropsWithChildren<{ size?: number; style?: React.CSSProperties }>
> = ({ children, size = 118, style }) => (
  <div
    style={{
      fontFamily: serif,
      fontSize: size,
      letterSpacing: -3,
      lineHeight: 0.94,
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
      lineHeight: 1.25,
      color: light ? "#e6ebff" : "#555d67",
      ...style,
    }}
  >
    {children}
  </div>
);

export const Sheet: React.FC<{
  name?: string;
  style?: React.CSSProperties;
  template?: boolean;
  logoDisplayScale?: number;
  postmark?: boolean;
}> = ({
  name = "Camille",
  style,
  template = false,
  logoDisplayScale = 1,
  postmark = true,
}) => (
  <div
    style={{
      width: 580,
      height: 780,
      background: "#fffefa",
      boxShadow: "0 35px 80px #0002",
      padding: 48,
      color: C.ink,
      ...style,
    }}
  >
    <Stamp size={80} displayScale={logoDisplayScale} postmark={postmark} />
    <div
      style={{ width: 100, height: 3, background: C.blue, margin: "34px 0" }}
    />
    <div
      style={{
        fontFamily: serif,
        fontSize: 53,
        lineHeight: 1.08,
        marginBottom: 36,
      }}
    >
      Bonjour{" "}
      <span style={{ color: C.blue, fontStyle: "italic" }}>
        {template ? "{{prénom}}" : name}
      </span>
      ,
    </div>
    {[96, 86, 100, 95, 68, 0, 88, 97, 75].map((w, i) => (
      <div
        key={i}
        style={{
          width: `${w}%`,
          height: 7,
          background: "#a9aca9",
          marginBottom: 18,
          opacity: 0.6,
        }}
      />
    ))}
    <div
      style={{
        fontFamily: serif,
        fontSize: 35,
        fontStyle: "italic",
        color: C.blue,
        marginTop: 35,
      }}
    >
      Une attention pour vous.
    </div>
  </div>
);

export const Check: React.FC<{ size?: number; color?: string }> = ({
  size = 38,
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

export const CornerBrand = () => {
  const { y } = usePortraitLayout();
  return (
    <div
      style={{
        position: "absolute",
        left: 82,
        top: y(150),
        display: "flex",
        alignItems: "center",
        gap: 21,
      }}
    >
      <CanvasImage
        src={staticFile("brand/guteneo-mark.png")}
        style={{ width: 70, height: 70, mixBlendMode: "multiply" }}
      />
      <span style={{ fontFamily: serif, fontSize: 62, letterSpacing: -2 }}>
        guteneo
      </span>
    </div>
  );
};

export const NativeApp = () => (
  <div
    style={{
      position: "absolute",
      inset: 0,
      background: C.paper,
      padding: "65px 26px",
      fontFamily: sans,
    }}
  >
    <div
      style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 30 }}
    >
      <Stamp size={50} />
      <span style={{ fontFamily: serif, fontSize: 38 }}>guteneo</span>
      <span
        style={{
          marginLeft: "auto",
          borderRadius: 40,
          background: "#e9ede4",
          padding: "10px 14px",
          fontSize: 18,
        }}
      >
        C
      </span>
    </div>
    <div
      style={{
        fontFamily: serif,
        fontSize: 54,
        lineHeight: 1.04,
        marginTop: 44,
      }}
    >
      Vos campagnes.
      <br />
      <em style={{ color: C.blue }}>Au clair.</em>
    </div>
    <div style={{ display: "flex", gap: 9, margin: "26px 0", fontSize: 18 }}>
      {["Tout", "À valider", "Envoyé"].map((n, i) => (
        <span
          key={n}
          style={{
            padding: "9px 16px",
            borderRadius: 20,
            background: i === 0 ? C.ink : "#e9ebe2",
            color: i === 0 ? "white" : C.ink,
          }}
        >
          {n}
        </span>
      ))}
    </div>
    <div
      style={{
        background: "white",
        padding: 22,
        borderRadius: 20,
        boxShadow: "0 10px 35px #17202208",
      }}
    >
      <div style={{ fontSize: 17, color: C.blue, marginBottom: 16 }}>
        CAMPAGNE PERSONNALISÉE
      </div>
      <div style={{ fontSize: 27 }}>Une attention pour chacun</div>
      <div
        style={{ display: "flex", alignItems: "end", gap: 8, margin: "22px 0" }}
      >
        <span style={{ fontFamily: serif, fontSize: 61 }}>10 000</span>
        <span style={{ fontSize: 18, paddingBottom: 10 }}>documents</span>
      </div>
      <div style={{ height: 6, background: "#eceddf", borderRadius: 8 }}>
        <div
          style={{
            width: "78%",
            height: "100%",
            background: C.blue,
            borderRadius: 8,
          }}
        />
      </div>
      <div style={{ marginTop: 20, fontSize: 18, color: "#6b7269" }}>
        Fax · E-mail · Courrier
      </div>
    </div>
    <div
      style={{
        background: "white",
        padding: 22,
        borderRadius: 20,
        marginTop: 17,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: 23,
        }}
      >
        Bon à tirer
        <Check size={24} />
      </div>
      <div style={{ fontSize: 17, color: "#6b7269", marginTop: 10 }}>
        Document et devis à vérifier
      </div>
      <div
        style={{
          background: C.blue,
          color: "white",
          textAlign: "center",
          padding: 17,
          borderRadius: 13,
          marginTop: 18,
          fontSize: 21,
        }}
      >
        Ouvrir la relecture
      </div>
    </div>
    <div
      style={{
        position: "absolute",
        left: 22,
        right: 22,
        bottom: 35,
        display: "flex",
        justifyContent: "space-around",
        color: "#737b77",
        fontSize: 17,
        borderTop: "1px solid #deded4",
        paddingTop: 22,
      }}
    >
      <span style={{ color: C.blue }}>◫ Atelier</span>
      <span>▤ Documents</span>
      <span>↗ Envois</span>
    </div>
  </div>
);
