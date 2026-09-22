import {
  AbsoluteFill,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";
import { Audio } from "@remotion/media";
import { TransitionSeries } from "@remotion/transitions";
import { One, Scale, Personal, Sources } from "./Ambition";
import { Assistants, Generate, Review } from "./Assistants";
import {
  Access,
  Channels,
  Europe,
  PhysicalBurst,
  Signature,
  VerticalEnd,
} from "./Distribution";
import { C, clamp } from "./components";
import { PortraitStage } from "./layout";

const Cut = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          top: -180,
          bottom: -180,
          width: 1600,
          background: C.blue,
          rotate: "-8deg",
          left: interpolate(f, [0, 4, 10], [-1900, -240, 1650], clamp),
        }}
      />
      <div
        style={{
          position: "absolute",
          top: -180,
          bottom: -180,
          width: 140,
          background: C.paper,
          rotate: "-8deg",
          left: interpolate(f, [0, 4, 10], [-1910, -250, 1640], clamp),
        }}
      />
    </AbsoluteFill>
  );
};

export const VerticalFilm = () => (
  <PortraitStage>
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
      <TransitionSeries.Sequence durationInFrames={150} name="L'Europe">
        <Europe />
      </TransitionSeries.Sequence>
      <TransitionSeries.Sequence durationInFrames={120} name="Le monde réel">
        <PhysicalBurst />
      </TransitionSeries.Sequence>
      <TransitionSeries.Sequence durationInFrames={150} name="Dans votre poche">
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
        <VerticalEnd />
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
  </PortraitStage>
);
