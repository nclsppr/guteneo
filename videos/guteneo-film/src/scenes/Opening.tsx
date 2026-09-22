import {
  CanvasImage,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";
import {
  Brand,
  C,
  clamp,
  Document,
  ease,
  Eyebrow,
  Paper,
  Reveal,
  serif,
} from "../design";

export const Opening = () => {
  const f = useCurrentFrame();
  return (
    <Paper>
      <div style={{ position: "absolute", left: 110, top: 78 }}>
        <Brand />
      </div>
      <div style={{ position: "absolute", left: 114, top: 296, zIndex: 3 }}>
        <Reveal>
          <Eyebrow>De l’intention à l’envoi</Eyebrow>
        </Reveal>
        <Reveal delay={12}>
          <div
            style={{
              fontFamily: serif,
              fontSize: 151,
              lineHeight: 0.95,
              letterSpacing: -5,
              marginTop: 37,
            }}
          >
            Vos mots.
          </div>
        </Reveal>
        <Reveal delay={38}>
          <div
            style={{
              fontFamily: serif,
              fontSize: 151,
              lineHeight: 0.95,
              letterSpacing: -5,
              color: C.blue,
              fontStyle: "italic",
            }}
          >
            Dans le monde réel.
          </div>
        </Reveal>
      </div>
      <div
        style={{
          position: "absolute",
          left: 1265,
          top: 155,
          transform: `perspective(1800px) rotateY(${interpolate(f, [0, 160], [-28, -12], clamp)}deg) rotateZ(${interpolate(f, [0, 160], [12, 5], clamp)}deg)`,
          translate: interpolate(f, [0, 70], ["190px 260px", "0px 0px"], {
            ...clamp,
            easing: ease,
          }),
          opacity: interpolate(f, [0, 24], [0, 1], clamp),
        }}
      >
        <Document style={{ width: 445, height: 630 }} />
      </div>
      <div
        style={{
          position: "absolute",
          left: 1435,
          top: 710,
          rotate: interpolate(f, [0, 160], ["-19deg", "-8deg"], clamp),
          scale: interpolate(f, [0, 160], [0.8, 1], clamp),
        }}
      >
        <CanvasImage
          src={staticFile("brand/guteneo-mark.png")}
          style={{ width: 200, height: 200 }}
        />
      </div>
      <Reveal
        delay={64}
        style={{
          position: "absolute",
          left: 115,
          bottom: 111,
          fontSize: 32,
          color: "#5d625f",
        }}
      >
        Du numérique au papier. Avec guteneo.
      </Reveal>
    </Paper>
  );
};
