import { interpolate, useCurrentFrame } from "remotion";
import { C, clamp, Frame, Head, Kicker, serif } from "./components";

export const Scale = () => {
  const f = useCurrentFrame();
  const value =
    f < 13
      ? "1"
      : f < 23
        ? "10"
        : f < 33
          ? "100"
          : f < 45
            ? "1 000"
            : "10 000+";
  return (
    <Frame blue>
      <div style={{ position: "absolute", left: 120, top: 105 }}>
        <Kicker light>De 1 à 10 000+ documents</Kicker>
        <Head size={125} style={{ marginTop: 37 }}>
          Changez <em>d’échelle.</em>
        </Head>
      </div>
      <div
        style={{
          position: "absolute",
          left: 98,
          top: 360,
          width: 1060,
          fontFamily: serif,
          fontSize: f < 45 ? 290 : 252,
          letterSpacing: -8,
          lineHeight: 1,
          whiteSpace: "nowrap",
          scale: interpolate(f, [45, 49, 59], [1.13, 0.98, 1], clamp),
        }}
      >
        {value}
      </div>
      <div style={{ position: "absolute", left: 120, top: 655, fontSize: 40 }}>
        documents par campagne
      </div>
      <div
        style={{
          position: "absolute",
          left: 120,
          top: 827,
          fontSize: 33,
          lineHeight: 1.4,
          color: "#dce5ff",
        }}
      >
        Un envoi unique.
        <br />
        Ou des milliers d’attentions.
      </div>
      <div
        style={{
          position: "absolute",
          left: 1240,
          top: -75,
          width: 850,
          height: 1300,
          rotate: "-14deg",
          translate: interpolate(f, [0, 90], ["0px 80px", "0px -35px"], clamp),
        }}
      >
        {Array.from({ length: 48 }, (_, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              left: (i % 4) * 183,
              top: Math.floor(i / 4) * 177,
              width: 140,
              height: 160,
              background: C.paper,
              boxShadow: "9px 14px 0 #132d91",
              rotate: `${(i % 3) - 1}deg`,
              opacity: interpolate(
                f,
                [i * 0.35 + 8, i * 0.35 + 22],
                [0, 0.92],
                clamp,
              ),
            }}
          >
            <div
              style={{ background: C.blue, width: 28, height: 28, margin: 14 }}
            />
            {[0, 1, 2, 3].map((j) => (
              <div
                key={j}
                style={{
                  height: 3,
                  background: "#ccd0d6",
                  margin: "11px 14px",
                  width: 96 - j * 8,
                }}
              />
            ))}
          </div>
        ))}
      </div>
    </Frame>
  );
};
