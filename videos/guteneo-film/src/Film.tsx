import { AbsoluteFill, staticFile } from "remotion";
import { Audio } from "@remotion/media";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { wipe } from "@remotion/transitions/wipe";
import { Opening } from "./scenes/Opening";
import { Conversation } from "./scenes/Conversation";
import { Frontend } from "./scenes/Frontend";
import { Physical } from "./scenes/Physical";
import { Clap, Endcard, PromiseScene } from "./scenes/Closing";

export const Film = () => (
  <AbsoluteFill>
    <Audio src={staticFile("audio/soundtrack.wav")} />
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={162} name="Vos mots">
        <Opening />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={wipe({ direction: "from-right" })}
        timing={linearTiming({ durationInFrames: 12 })}
      />
      <TransitionSeries.Sequence
        durationInFrames={252}
        name="ChatGPT et guteneo"
      >
        <Conversation />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: 12 })}
      />
      <TransitionSeries.Sequence
        durationInFrames={222}
        name="L’atelier Guteneo"
      >
        <Frontend />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={wipe({ direction: "from-bottom" })}
        timing={linearTiming({ durationInFrames: 12 })}
      />
      <TransitionSeries.Sequence durationInFrames={162} name="Le papier">
        <Physical kind="print" />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: 12 })}
      />
      <TransitionSeries.Sequence durationInFrames={192} name="Le courrier">
        <Physical kind="courier" />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: 12 })}
      />
      <TransitionSeries.Sequence durationInFrames={162} name="Le fax">
        <Physical kind="fax" />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: 12 })}
      />
      <TransitionSeries.Sequence
        durationInFrames={120}
        name="La portée des mots"
      >
        <PromiseScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Sequence durationInFrames={30} name="Clap de fin">
        <Clap />
      </TransitionSeries.Sequence>
      <TransitionSeries.Sequence durationInFrames={150} name="guteneo.com">
        <Endcard />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  </AbsoluteFill>
);
