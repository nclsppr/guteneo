import "./index.css";
import { Composition, Folder } from "remotion";
import { Film } from "./Film";
import { Opening } from "./scenes/Opening";
import { Conversation } from "./scenes/Conversation";
import { Frontend } from "./scenes/Frontend";
import { Clap, Endcard, PromiseScene } from "./scenes/Closing";
import { VerticalFilm } from "./vertical/VerticalFilm";
import { HorizontalFilm } from "./landscape/HorizontalFilm";
import { FILM_LOCALES } from "./localization";
import { RolesFilm, type RolesFilmProps } from "./roles/RolesFilm";
import { NATURAL_ROLES_FR_TIMELINE } from "./roles/natural-timeline";
import { validateIntroductionTimeline, type IntroductionFilmProps } from "./natural-timing";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Folder name="Localized-V5">
        {FILM_LOCALES.map((locale) => (
          <Composition
            key={`landscape-${locale}`}
            id={`Guteneo-Horizontal-Vision-${locale.toUpperCase()}`}
            component={HorizontalFilm}
            defaultProps={{ locale }}
            durationInFrames={1680}
            fps={30}
            width={1920}
            height={1080}
          />
        ))}
        {FILM_LOCALES.map((locale) => (
          <Composition
            key={`portrait-${locale}`}
            id={`Guteneo-iPhone-18-Pro-Max-${locale.toUpperCase()}`}
            component={VerticalFilm}
            defaultProps={{ locale }}
            durationInFrames={1680}
            fps={30}
            width={1320}
            height={2868}
          />
        ))}
      </Folder>
      <Folder name="Natural-C">
        {FILM_LOCALES.map((locale) => (
          <Composition
            key={`natural-landscape-${locale}`}
            id={`Guteneo-Horizontal-Natural-C-${locale.toUpperCase()}`}
            component={HorizontalFilm}
            defaultProps={{ locale } as IntroductionFilmProps}
            durationInFrames={1680}
            calculateMetadata={({props}) => {
              const timeline = (props as IntroductionFilmProps).timeline;
              if (timeline) validateIntroductionTimeline(timeline);
              return {durationInFrames: timeline?.durationInFrames ?? 1680};
            }}
            fps={30}
            width={1920}
            height={1080}
          />
        ))}
        {FILM_LOCALES.map((locale) => (
          <Composition
            key={`natural-portrait-${locale}`}
            id={`Guteneo-iPhone-Natural-C-${locale.toUpperCase()}`}
            component={VerticalFilm}
            defaultProps={{ locale } as IntroductionFilmProps}
            durationInFrames={1680}
            calculateMetadata={({props}) => {
              const timeline = (props as IntroductionFilmProps).timeline;
              if (timeline) validateIntroductionTimeline(timeline);
              return {durationInFrames: timeline?.durationInFrames ?? 1680};
            }}
            fps={30}
            width={1320}
            height={2868}
          />
        ))}
        {FILM_LOCALES.filter((locale) => locale !== "fr").map((locale) => (
          <Composition
            key={`natural-roles-${locale}`}
            id={`Guteneo-Roles-${locale.toUpperCase()}-Natural-C`}
            component={RolesFilm}
            defaultProps={{ locale } as RolesFilmProps}
            durationInFrames={1080}
            calculateMetadata={({props}) => {
              const timeline = (props as RolesFilmProps).timeline;
              const last = timeline?.scenes[timeline.scenes.length - 1];
              return {durationInFrames: last ? last.startFrame + last.durationInFrames : 1080};
            }}
            fps={30}
            width={1920}
            height={1080}
          />
        ))}
      </Folder>
      <Folder name="Roles">
        {FILM_LOCALES.map((locale) => (
          <Composition
            key={`roles-${locale}`}
            id={`Guteneo-Roles-${locale.toUpperCase()}`}
            component={RolesFilm}
            defaultProps={{ locale }}
            durationInFrames={1080}
            fps={30}
            width={1920}
            height={1080}
          />
        ))}
        <Composition
          id="Guteneo-Roles-FR-Natural-C"
          component={RolesFilm}
          defaultProps={{ locale: "fr", timeline: NATURAL_ROLES_FR_TIMELINE, musicFile: "audio/roles-natural-c-fr-soundtrack.wav" }}
          durationInFrames={NATURAL_ROLES_FR_TIMELINE.durationInFrames}
          fps={30}
          width={1920}
          height={1080}
        />
      </Folder>
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
