import { interpolate, useCurrentFrame } from "remotion";
import {
  Brand,
  C,
  clamp,
  ease,
  Frame,
  Head,
  Kicker,
  Lift,
  Sheet,
  serif,
} from "./components";

export const One = () => {
  const f = useCurrentFrame();
  return (
    <Frame>
      <div style={{ position: "absolute", left: 120, top: 94 }}>
        <Brand />
      </div>
      <div style={{ position: "absolute", left: 120, top: 350 }}>
        <Lift>
          <Kicker>La suite de vos mots</Kicker>
        </Lift>
        <Head size={160} style={{ marginTop: 45 }}>
          Tout part
          <br />
          d’un <em style={{ color: C.blue }}>document.</em>
        </Head>
      </div>
      <div
        style={{
          position: "absolute",
          right: 120,
          top: 150,
          color: C.blue,
          opacity: 0.08,
          fontFamily: serif,
          fontSize: 700,
          lineHeight: 1,
        }}
      >
        1
      </div>
      <div
        style={{
          position: "absolute",
          left: 1200,
          top: 200,
          transform: `perspective(1400px) rotateX(${interpolate(f, [0, 75], [19, -2], clamp)}deg) rotateZ(${interpolate(f, [0, 75], [-14, -5], clamp)}deg)`,
          scale: interpolate(f, [0, 32, 88], [0.72, 1, 1.045], {
            ...clamp,
            easing: ease,
          }),
          translate: interpolate(f, [0, 28], ["0px 360px", "0px 0px"], {
            ...clamp,
            easing: ease,
          }),
        }}
      >
        <Sheet />
      </div>
    </Frame>
  );
};
