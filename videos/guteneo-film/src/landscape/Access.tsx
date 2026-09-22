import {
  CanvasImage,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";
import { NativeApp } from "../vertical/components";
import { C, clamp, ease, Frame, Head, Kicker, Label } from "./components";

export const Access = () => {
  const f = useCurrentFrame();
  return (
    <Frame>
      <div style={{ position: "absolute", left: 120, top: 164, width: 650 }}>
        <Kicker>L’atelier où vous êtes</Kicker>
        <Head size={139} style={{ marginTop: 51 }}>
          Sur le web.
          <br />
          <em style={{ color: C.blue }}>Sur iPhone.</em>
        </Head>
        <Label style={{ marginTop: 43, fontSize: 32 }}>
          Vos documents et vos campagnes,
          <br />
          sur le site ou l’application iOS.
        </Label>
      </div>
      <div
        style={{
          position: "absolute",
          left: 840,
          top: 251,
          width: 1000,
          height: 592,
          border: "1px solid #ced2cf",
          borderRadius: 14,
          overflow: "hidden",
          background: C.paper,
          boxShadow: "0 28px 70px #18243922",
          rotate: "-3deg",
          translate: interpolate(f, [0, 26], ["200px 250px", "0px 0px"], {
            ...clamp,
            easing: ease,
          }),
        }}
      >
        <div
          style={{
            height: 42,
            background: "#e9ebe5",
            display: "flex",
            alignItems: "center",
            gap: 7,
            paddingLeft: 17,
          }}
        >
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{
                height: 8,
                width: 8,
                borderRadius: 10,
                background: "#afb7ae",
              }}
            />
          ))}
          <span style={{ marginLeft: 320, fontSize: 16, color: "#6f776e" }}>
            guteneo.com
          </span>
        </div>
        <div style={{ position: "relative", height: 550, overflow: "hidden" }}>
          <CanvasImage
            src={staticFile("frontend/homepage.png")}
            style={{
              width: 1260,
              maxWidth: "none",
              height: 709,
              left: -130,
              position: "absolute",
              top: 0,
            }}
          />
          {/* Canonical simplified logo replaces only the tiny captured header mark. */}
          <div
            style={{
              position: "absolute",
              left: 79,
              top: 15,
              width: 34,
              height: 34,
              background: C.paper,
              padding: 2,
            }}
          >
            <CanvasImage
              src={staticFile("brand/guteneo-mark.png")}
              style={{ width: 30, height: 30, mixBlendMode: "multiply" }}
            />
          </div>
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          left: 1410,
          top: 225,
          width: 344,
          height: 730,
          padding: 11,
          borderRadius: 50,
          background: "#1a1d23",
          border: "3px solid #494c52",
          boxShadow: "0 30px 70px #18243944",
          transform: `perspective(1500px) rotateY(${interpolate(f, [0, 110], [16, -8], clamp)}deg) rotateZ(${interpolate(f, [0, 130], [9, 3], clamp)}deg)`,
          translate: interpolate(f, [18, 48], ["0px 950px", "0px 0px"], {
            ...clamp,
            easing: ease,
          }),
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 11,
            borderRadius: 38,
            overflow: "hidden",
            background: C.paper,
          }}
        >
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: 504,
              height: 1128,
              scale: 0.63,
              transformOrigin: "top left",
            }}
          >
            <NativeApp />
          </div>
          <div
            style={{
              position: "absolute",
              left: 110,
              top: 9,
              width: 98,
              height: 26,
              borderRadius: 30,
              background: "#111",
            }}
          />
        </div>
      </div>
    </Frame>
  );
};
