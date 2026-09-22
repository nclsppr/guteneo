import {
  CanvasImage,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";
import { C, clamp, ease, Eyebrow, Paper, Reveal, serif } from "../design";

export const Frontend = () => {
  const f = useCurrentFrame();
  return (
    <Paper>
      <div style={{ position: "absolute", left: 110, top: 72 }}>
        <Eyebrow>02 / Votre atelier</Eyebrow>
      </div>
      <Reveal
        style={{
          position: "absolute",
          top: 127,
          left: 110,
          fontFamily: serif,
          fontSize: 104,
          letterSpacing: -2,
        }}
      >
        Vous vérifiez.{" "}
        <span style={{ fontStyle: "italic", color: C.blue }}>
          Vous confirmez.
        </span>
      </Reveal>
      <div
        style={{
          position: "absolute",
          left: 205,
          top: 300,
          width: 1510,
          height: 755,
          border: "1px solid #d5d6ce",
          borderRadius: 13,
          boxShadow: "0 30px 70px #151e3220",
          overflow: "hidden",
          background: C.paper,
          transform: `perspective(2000px) rotateX(${interpolate(f, [0, 90], [5, 0], { ...clamp, easing: ease })}deg)`,
          scale: interpolate(f, [0, 222], [0.94, 1], clamp),
        }}
      >
        <div
          style={{
            height: 45,
            background: "#e9e9e2",
            display: "flex",
            alignItems: "center",
            padding: "0 18px",
            gap: 8,
          }}
        >
          {["#c7c8bf", "#c7c8bf", "#c7c8bf"].map((c, i) => (
            <span
              key={i}
              style={{ width: 11, height: 11, borderRadius: 50, background: c }}
            />
          ))}
          <span
            style={{
              margin: "0 auto",
              fontSize: 16,
              color: "#74776d",
              paddingRight: 45,
            }}
          >
            guteneo.com
          </span>
        </div>
        <CanvasImage
          src={staticFile("frontend/atelier.png")}
          style={{
            width: 1510,
            height: 849,
            objectFit: "cover",
            objectPosition: "top",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: "45px 0 0",
            opacity: interpolate(f, [55, 74], [0, 1], clamp),
            overflow: "hidden",
          }}
        >
          <CanvasImage
            src={staticFile("frontend/approval.png")}
            style={{
              width: 1510,
              height: 849,
              objectFit: "cover",
              objectPosition: "top",
              translate: interpolate(f, [95, 165], ["0px 0px", "0px -145px"], {
                ...clamp,
                easing: ease,
              }),
            }}
          />
        </div>
      </div>
    </Paper>
  );
};
