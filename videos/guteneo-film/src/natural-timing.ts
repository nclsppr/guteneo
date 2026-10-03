import type { FilmProps } from "./localization";

export const INTRODUCTION_CUE_IDS = [
  "one", "scale", "personal", "sources", "assistants", "generate", "review",
  "channels", "europe", "physical", "access",
] as const;
export type IntroductionCueId = typeof INTRODUCTION_CUE_IDS[number];
export type IntroductionSceneId = IntroductionCueId | "signature" | "logo";
export type IntroductionFilmTimeline = {
  durationInFrames: number;
  endCardStartFrame: number;
  endCardStartSeconds: number;
  scenes: readonly {
    id: IntroductionSceneId;
    startFrame: number;
    durationInFrames: number;
  }[];
};
export type IntroductionFilmProps = FilmProps & {
  timeline?: IntroductionFilmTimeline;
  musicFile?: string;
};

export const INTRODUCTION_MINIMUM_FRAMES = [90, 90, 120, 120, 120, 150, 180, 180, 150, 120, 150] as const;

/** Native voice duration + entry/breathing room; original animations keep their time. */
export function introductionTimeline(voiceDurations: Record<IntroductionCueId, number>): IntroductionFilmTimeline {
  let cursor = 0;
  const scenes: IntroductionFilmTimeline["scenes"][number][] = INTRODUCTION_CUE_IDS.map((id, index) => {
    const duration = voiceDurations[id];
    if (!Number.isFinite(duration) || duration <= 0) throw new Error(`Missing complete voice duration: ${id}`);
    const durationInFrames = Math.max(INTRODUCTION_MINIMUM_FRAMES[index], Math.ceil(duration * 30) + 12 + 15);
    const scene = {id, startFrame: cursor, durationInFrames};
    cursor += durationInFrames;
    return scene;
  });
  scenes.push({id: "signature", startFrame: cursor, durationInFrames: 60});
  cursor += 60;
  const endCardStartFrame = cursor;
  scenes.push({id: "logo", startFrame: cursor, durationInFrames: 150});
  return {durationInFrames: cursor + 150, endCardStartFrame, endCardStartSeconds: cursor / 30, scenes};
}

/** Fail before rendering if a custom timeline skips a scene or changes the closing card. */
export function validateIntroductionTimeline(timeline: IntroductionFilmTimeline) {
  const ids: readonly IntroductionSceneId[] = [...INTRODUCTION_CUE_IDS, "signature", "logo"];
  if (timeline.scenes.length !== ids.length) throw new Error("An introduction needs eleven scenes, its silent signature and its logo.");
  let cursor = 0;
  for (const [index, scene] of timeline.scenes.entries()) {
    const minimum = index < 11 ? INTRODUCTION_MINIMUM_FRAMES[index] : index === 11 ? 60 : 150;
    if (scene.id !== ids[index] || scene.startFrame !== cursor || !Number.isInteger(scene.durationInFrames)
      || scene.durationInFrames < minimum || (index >= 11 && scene.durationInFrames !== minimum)) {
      throw new Error(`Introduction scene timing is invalid: ${scene.id}`);
    }
    cursor += scene.durationInFrames;
  }
  if (cursor !== timeline.durationInFrames || timeline.endCardStartFrame !== cursor - 150
    || Math.abs(timeline.endCardStartSeconds - (cursor - 150) / 30) > 0.000001) {
    throw new Error("Introduction duration and five-second logo disagree.");
  }
  return Object.fromEntries(timeline.scenes.map((scene) => [scene.id, scene])) as Record<IntroductionSceneId, IntroductionFilmTimeline["scenes"][number]>;
}
