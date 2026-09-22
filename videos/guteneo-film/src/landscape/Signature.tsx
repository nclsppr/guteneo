import { interpolate, useCurrentFrame } from "remotion";
import { Swallows } from "../vertical/PostalMotifs";
import { clamp, Frame, Head, Lift } from "./components";

export const Signature = () => {
  const f = useCurrentFrame();
  return (
    <Frame blue>
      <Swallows
        light
        width={1920}
        count={2}
        height={260}
        frameOffset={55}
        opacity={0.7}
        style={{ left: 0, top: 105 }}
      />
      <div
        style={{
          position: "absolute",
          left: 120,
          right: 120,
          top: 380,
          scale: interpolate(f, [0, 60], [1.04, 1], clamp),
        }}
      >
        <Lift>
          <Head size={215} style={{ textAlign: "center" }}>
            La suite <em>de vos mots.</em>
          </Head>
        </Lift>
      </div>
    </Frame>
  );
};
