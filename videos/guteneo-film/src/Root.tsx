import "./index.css";
import { Composition, Folder } from "remotion";
import { Film } from "./Film";
import { Opening } from "./scenes/Opening";
import { Conversation } from "./scenes/Conversation";
import { Frontend } from "./scenes/Frontend";
import { Clap, Endcard, PromiseScene } from "./scenes/Closing";
import { VerticalFilm } from "./vertical/VerticalFilm";
import { HorizontalFilm } from "./landscape/HorizontalFilm";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="Guteneo-Horizontal-Vision"
        component={HorizontalFilm}
        durationInFrames={1680}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="Guteneo-iPhone-18-Pro"
        component={VerticalFilm}
        durationInFrames={1680}
        fps={30}
        width={1206}
        height={2622}
      />
      <Composition
        id="Guteneo-iPhone-18-Pro-Max"
        component={VerticalFilm}
        durationInFrames={1680}
        fps={30}
        width={1320}
        height={2868}
      />
      <Composition
        id="Guteneo-Vertical-Vision"
        component={VerticalFilm}
        durationInFrames={1680}
        fps={30}
        width={1080}
        height={1920}
      />
      <Composition
        id="Guteneo-Film"
        component={Film}
        durationInFrames={1380}
        fps={30}
        width={1920}
        height={1080}
      />
      <Folder name="Scenes">
        <Composition
          id="Opening"
          component={Opening}
          durationInFrames={162}
          fps={30}
          width={1920}
          height={1080}
        />
        <Composition
          id="Conversation"
          component={Conversation}
          durationInFrames={252}
          fps={30}
          width={1920}
          height={1080}
        />
        <Composition
          id="Frontend"
          component={Frontend}
          durationInFrames={222}
          fps={30}
          width={1920}
          height={1080}
        />
        <Composition
          id="Promise"
          component={PromiseScene}
          durationInFrames={120}
          fps={30}
          width={1920}
          height={1080}
        />
        <Composition
          id="Clap"
          component={Clap}
          durationInFrames={30}
          fps={30}
          width={1920}
          height={1080}
        />
        <Composition
          id="Endcard"
          component={Endcard}
          durationInFrames={150}
          fps={30}
          width={1920}
          height={1080}
        />
      </Folder>
    </>
  );
};
