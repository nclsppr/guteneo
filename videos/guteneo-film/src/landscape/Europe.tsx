import {
  CanvasImage,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";
import { Swallows } from "../vertical/PostalMotifs";
import { C, clamp, Frame, Head, Kicker, Label } from "./components";

export const Europe = () => {
  const f = useCurrentFrame();
  return (
    <Frame>
      <div style={{ position: "absolute", left: 120, top: 108, zIndex: 1 }}>
        <Kicker>Imprimé. Affranchi. Distribué.</Kicker>
        <Head size={148} style={{ marginTop: 34 }}>
          L’Europe. <em style={{ color: C.blue }}>Tout entière.</em>
        </Head>
        <Label style={{ marginTop: 28, fontSize: 36 }}>
          Vos documents, livrés par les postes.
        </Label>
      </div>
      <CanvasImage
        src={staticFile("brand/luxembourg-blue-panorama.webp")}
        style={{
          position: "absolute",
          width: 2160,
          height: 720,
          left: interpolate(f, [0, 150], [-60, -180], clamp),
          bottom: -30,
          mixBlendMode: "multiply",
          maskImage: "linear-gradient(to bottom, transparent, #000 18%)",
          scale: interpolate(f, [0, 150], [1.05, 1], clamp),
        }}
      />
      <Swallows width={1920} height={350} style={{ left: 0, top: 340 }} />
    </Frame>
  );
};
