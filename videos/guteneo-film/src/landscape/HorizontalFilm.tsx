import {
  AbsoluteFill,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";
import { Audio } from "@remotion/media";
import { TransitionSeries } from "@remotion/transitions";
import { C, clamp } from "./components";
import { One } from "./One";
import { Scale } from "./Scale";
import { Personal } from "./Personal";
import { Sources } from "./Sources";
import { Assistants } from "./Assistants";
import { Generate } from "./Generate";
import { Review } from "./Review";
import { Channels } from "./Channels";
import { Europe } from "./Europe";
import { PhysicalBurst } from "./PhysicalBurst";
import { Access } from "./Access";
import { Signature } from "./Signature";
import { End } from "./End";

const Cut = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          top: -200,
          bottom: -200,
          width: 2400,
          background: C.blue,
          rotate: "-8deg",
          left: interpolate(f, [0, 4, 10], [-2700, -180, 2350], clamp),
        }}
      />
      <div
        style={{
          position: "absolute",
          top: -200,
          bottom: -200,
          width: 150,
          background: C.paper,
          rotate: "-8deg",
          left: interpolate(f, [0, 4, 10], [-2710, -190, 2340], clamp),
        }}
      />
    </AbsoluteFill>
  );
};

/** Native 1920 x 1080 composition, sharing only assets and the 56-second score. */
export const HorizontalFilm = () => (
  <AbsoluteFill>
    <Audio src={staticFile("audio/vertical-soundtrack.wav")} />
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={90} name="Un document">
        <One />
      </TransitionSeries.Sequence>
      <TransitionSeries.Sequence durationInFrames={90} name="Objectif 10000">
        <Scale />
      </TransitionSeries.Sequence>
      <TransitionSeries.Sequence durationInFrames={120} name="Personnalisation">
        <Personal />
      </TransitionSeries.Sequence>
      <TransitionSeries.Sequence durationInFrames={120} name="PDF et modèle">
        <Sources />
      </TransitionSeries.Sequence>
      <TransitionSeries.Sequence durationInFrames={120} name="Les assistants">
        <Assistants />
      </TransitionSeries.Sequence>
      <TransitionSeries.Sequence durationInFrames={150} name="Générer un PDF">
        <Generate />
      </TransitionSeries.Sequence>
      <TransitionSeries.Sequence
        durationInFrames={180}
        name="Bon à tirer et devis"
      >
        <Review />
      </TransitionSeries.Sequence>
      <TransitionSeries.Sequence durationInFrames={180} name="Les canaux">
        <Channels />
      </TransitionSeries.Sequence>
      <TransitionSeries.Sequence durationInFrames={150} name="L’Europe">
        <Europe />
      </TransitionSeries.Sequence>
      <TransitionSeries.Sequence durationInFrames={120} name="Le monde réel">
        <PhysicalBurst />
      </TransitionSeries.Sequence>
      <TransitionSeries.Sequence durationInFrames={150} name="Web et iPhone">
        <Access />
      </TransitionSeries.Sequence>
      <TransitionSeries.Sequence
        durationInFrames={60}
        name="La suite de vos mots"
      >
        <Signature />
      </TransitionSeries.Sequence>
      <TransitionSeries.Sequence
        durationInFrames={150}
        name="Le timbre oblitéré"
      >
        <End />
      </TransitionSeries.Sequence>
    </TransitionSeries>
    {[180, 420, 690, 1050, 1320].map((frame) => (
      <Sequence
        key={frame}
        from={frame - 4}
        durationInFrames={10}
        layout="none"
      >
        <Cut />
      </Sequence>
    ))}
  </AbsoluteFill>
);
