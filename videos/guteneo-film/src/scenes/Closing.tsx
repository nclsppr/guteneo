import {
  AbsoluteFill,
  CanvasImage,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";
import { Brand, C, clamp, ease, Paper, Reveal, serif } from "../design";

export const PromiseScene = () => {
  const f = useCurrentFrame();
  return (
    <Paper>
      <div style={{ position: "absolute", left: 110, top: 78 }}>
        <Brand />
      </div>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 335,
          textAlign: "center",
        }}
      >
        <Reveal
          style={{
            fontFamily: serif,
            fontSize: 143,
            letterSpacing: -4,
            lineHeight: 1,
          }}
        >
          Vous avez les mots.
        </Reveal>
        <Reveal
          delay={18}
          style={{
            fontFamily: serif,
            fontStyle: "italic",
            fontSize: 143,
            letterSpacing: -4,
            lineHeight: 1.1,
            color: C.blue,
          }}
        >
          Donnez-leur une portée.
        </Reveal>
      </div>
      <div
        style={{
          position: "absolute",
          width: interpolate(f, [14, 92], [0, 500], { ...clamp, easing: ease }),
          height: 2,
          background: C.blue,
          top: 760,
          left: 960,
          translate: "-50% 0",
        }}
      />
    </Paper>
  );
};

export const Clap = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: C.ink, overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          left: -100,
          right: -100,
          height: 270,
          top: interpolate(f, [0, 8], [-400, 270], { ...clamp, easing: ease }),
          background: C.paper,
          transformOrigin: "left bottom",
          rotate: interpolate(f, [7, 15], ["-8deg", "0deg"], {
            ...clamp,
            easing: ease,
          }),
          overflow: "hidden",
        }}
      >
        {Array.from({ length: 12 }, (_, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              left: i * 230,
              top: -100,
              width: 120,
              height: 550,
              background: C.ink,
              rotate: "-35deg",
            }}
          />
        ))}
      </div>
      <div
        style={{
          position: "absolute",
          top: 540,
          left: 0,
          right: 0,
          height: 350,
          background: C.ink,
          borderTop: `4px solid ${C.paper}`,
          textAlign: "center",
          color: C.paper,
          fontFamily: serif,
          fontSize: 90,
          paddingTop: 65,
          opacity: interpolate(f, [2, 8], [0, 1], clamp),
        }}
      >
        fin.
      </div>
      <AbsoluteFill
        style={{
          background: C.paper,
          opacity: interpolate(f, [17, 20, 26], [0, 1, 1], clamp),
        }}
      />
    </AbsoluteFill>
  );
};

export const Endcard = () => {
  const f = useCurrentFrame();
  return (
    <Paper>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          paddingBottom: 35,
        }}
      >
        <CanvasImage
          src={staticFile("brand/guteneo-mark.png")}
          style={{
            width: 328,
            height: 328,
            mixBlendMode: "multiply",
            opacity: interpolate(f, [0, 14], [0, 1], clamp),
            scale: interpolate(f, [0, 26], [1.16, 1], {
              ...clamp,
              easing: ease,
            }),
            translate: interpolate(f, [0, 26], ["0px -20px", "0px 0px"], {
              ...clamp,
              easing: ease,
            }),
          }}
        />
        <div
          style={{
            fontFamily: serif,
            fontSize: 76,
            letterSpacing: -2,
            marginTop: 39,
            opacity: interpolate(f, [12, 31], [0, 1], clamp),
          }}
        >
          guteneo.com
        </div>
      </div>
    </Paper>
  );
};
