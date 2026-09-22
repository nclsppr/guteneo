import { interpolate, useCurrentFrame } from "remotion";
import { Stamp } from "../vertical/components";
import { Swallows } from "../vertical/PostalMotifs";
import { clamp, ease, Frame, serif } from "./components";

export const End = () => {
  const f = useCurrentFrame();
  return (
    <Frame>
      <Swallows
        width={1920}
        height={245}
        durationInFrames={84}
        style={{ left: 0, top: 100 }}
      />
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 275,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <Stamp
          size={340}
          postmarkProgress={interpolate(f, [24, 32], [0, 1], clamp)}
          style={{
            scale: interpolate(f, [0, 26], [1.16, 1], {
              ...clamp,
              easing: ease,
            }),
            translate: interpolate(f, [0, 26], ["44px 36px", "44px 0px"], {
              ...clamp,
              easing: ease,
            }),
            opacity: interpolate(f, [0, 10], [0, 1], clamp),
            rotate: interpolate(f, [0, 26], ["-5deg", "4deg"], {
              ...clamp,
              easing: ease,
            }),
          }}
        />
        <div
          style={{
            fontFamily: serif,
            fontSize: 86,
            letterSpacing: -2,
            marginTop: 65,
            opacity: interpolate(f, [15, 33], [0, 1], clamp),
          }}
        >
          guteneo.com
        </div>
      </div>
    </Frame>
  );
};
