/**
 * French Manon/Eleven v4 take 2, three enhanced two-slide blocks.
 * Six sample-exact cuts keep all 34.32 seconds of generated audio at native pace.
 * Each slide gets 12 entry frames and at least 15 breathing frames (30 fps).
 * The unmodified V5 End component retains its complete 150-frame closing card.
 */
export const NATURAL_ROLES_FR_TIMELINE = {
  durationInFrames: 1346,
  durationSeconds: 1346 / 30,
  endCardStartFrame: 1196,
  endCardStartSeconds: 1196 / 30,
  scenes: [
    { id: "intro", startFrame: 0, durationInFrames: 136 },
    { id: "administrator", startFrame: 136, durationInFrames: 212 },
    { id: "supervisor", startFrame: 348, durationInFrames: 230 },
    { id: "operator", startFrame: 578, durationInFrames: 176 },
    { id: "observer", startFrame: 754, durationInFrames: 276 },
    { id: "review", startFrame: 1030, durationInFrames: 166 },
    { id: "logo", startFrame: 1196, durationInFrames: 150 },
  ],
} as const;
