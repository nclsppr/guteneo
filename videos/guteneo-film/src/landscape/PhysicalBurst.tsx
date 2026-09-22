import {
  AbsoluteFill,
  CanvasImage,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";
import { clamp, ease, Frame, Head, Kicker } from "./components";

export const PhysicalBurst = () => {
  const f = useCurrentFrame();
  const index = f < 40 ? 0 : f < 80 ? 1 : 2;
  const local = f % 40;
  const shots = [
    { file: "printed-paper.png", text: <>Du numérique.</> },
    {
      file: "courier.png",
      text: (
        <>
          Au <em>réel.</em>
        </>
      ),
    },
    {
      file: "fax.png",
      text: (
        <>
          Avec <em>guteneo.</em>
        </>
      ),
    },
  ];
  return (
    <Frame dark>
      <CanvasImage
        src={staticFile(`images/${shots[index].file}`)}
        style={{
          width: 1920,
          height: 1080,
          objectFit: "cover",
          scale: interpolate(local, [0, 9, 39], [1.13, 1.02, 1.055], {
            ...clamp,
            easing: ease,
          }),
          filter: `blur(${interpolate(local, [0, 7], [7, 0], clamp)}px)`,
        }}
      />
      <AbsoluteFill
        style={{
          background:
            "linear-gradient(180deg,#0e152455,transparent 38%,#0e1524bb)",
        }}
      />
      <div style={{ position: "absolute", left: 120, top: 118 }}>
        <Kicker light>La suite de vos mots</Kicker>
      </div>
      <Head size={157} style={{ position: "absolute", left: 120, top: 788 }}>
        {shots[index].text}
      </Head>
    </Frame>
  );
};
