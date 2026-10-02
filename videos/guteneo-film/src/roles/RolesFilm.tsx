import { AbsoluteFill, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import { Audio } from "@remotion/media";
import { Brand, C, Check, Frame, Lift, clamp, mono, serif } from "../landscape/components";
import { End } from "../landscape/End";
import { rolesCopy, type RoleFilmLocale } from "./copy";

const permissionRows = [
  [true, true, true, true],
  [true, true, "option", "option"],
  [true, true, false, false],
  [true, false, false, false],
] as const;

function Intro({ locale }: { locale: RoleFilmLocale }) {
  const copy = rolesCopy[locale];
  return (
    <Frame>
      <div style={{ position: "absolute", left: 140, top: 105 }}><Brand /></div>
      <Lift style={{ position: "absolute", left: 140, top: 315, fontFamily: serif, fontSize: 148, lineHeight: 1.04, letterSpacing: -3 }}>
        {copy.intro[0]}<br /><em style={{ color: C.blue }}>{copy.intro[1]}</em>
      </Lift>
      <div style={{ position: "absolute", left: 145, bottom: 135, fontFamily: mono, fontSize: 27, letterSpacing: 2 }}>01 / 04</div>
    </Frame>
  );
}

function Role({ locale, index, durationInFrames = 180 }: { locale: RoleFilmLocale; index: number; durationInFrames?: number }) {
  const copy = rolesCopy[locale];
  const scene = copy.scenes[index];
  const frame = useCurrentFrame();
  return (
    <Frame>
      <div style={{ position: "absolute", left: 140, top: 105 }}><Brand /></div>
      <Lift style={{ position: "absolute", left: 140, top: 310, width: 945 }}>
        <div style={{ color: C.blue, fontFamily: mono, fontSize: 27, marginBottom: 26 }}>{String(index + 1).padStart(2, "0")} / 04</div>
        <div style={{ fontFamily: serif, fontSize: 112, letterSpacing: -3, lineHeight: 1.04 }}>{scene.title}</div>
        <div style={{ fontSize: 52, lineHeight: 1.28, marginTop: 32, maxWidth: 900 }}>{scene.body}</div>
        <div style={{ fontSize: 34, lineHeight: 1.35, marginTop: 38, color: "#626b67", maxWidth: 910 }}>{scene.note}</div>
      </Lift>
      <div style={{ position: "absolute", left: 1190, right: 140, top: 298 }}>
        {copy.actions.map((action, row) => {
          const allowed = permissionRows[index][row];
          return (
            <Lift key={action} at={12 + row * 8} style={{ display: "flex", alignItems: "center", gap: 20, padding: "24px 0", borderBottom: "1px solid #d7dbd2", fontSize: 42 }}>
              <span style={{ flex: 1 }}>{action}</span>
              {allowed === "option" ? (
                <span style={{ fontFamily: mono, fontSize: 23, color: C.blue, border: `1px solid ${C.blue}`, padding: "10px 14px" }}>{copy.option}</span>
              ) : allowed ? <Check size={40} /> : <span style={{ fontSize: 42, color: "#858b83" }}>—</span>}
            </Lift>
          );
        })}
      </div>
      <div style={{ position: "absolute", left: 140, right: 140, bottom: 100, display: "flex", gap: 12 }}>
        {copy.scenes.map((item, i) => (
          <div key={item.title} style={{ flex: 1, height: 5, background: "#dce0d5", overflow: "hidden" }}>
            <div style={{ height: "100%", background: C.blue, width: i < index ? "100%" : i === index ? `${interpolate(frame, [0, durationInFrames - 1], [0, 100], clamp)}%` : "0%" }} />
          </div>
        ))}
      </div>
    </Frame>
  );
}

function Review({ locale }: { locale: RoleFilmLocale }) {
  const copy = rolesCopy[locale];
  return (
    <Frame blue>
      <Lift style={{ position: "absolute", left: 160, right: 160, top: 255, fontFamily: serif, fontSize: 108, lineHeight: 1.08, textAlign: "center" }}>{copy.review}</Lift>
      <Lift at={15} style={{ position: "absolute", left: 160, right: 160, top: 630, fontSize: 44, textAlign: "center", color: "#e1e6f4" }}>{copy.reviewItems}</Lift>
    </Frame>
  );
}

export type RoleFilmTimeline = {
  scenes: readonly {
    id: "intro" | "administrator" | "supervisor" | "operator" | "observer" | "review" | "logo";
    startFrame: number;
    durationInFrames: number;
  }[];
};

/** The original 36-second film remains the default; explicit timing follows narration. */
export function RolesFilm({ locale = "fr", timeline, musicFile = "audio/roles-soundtrack.wav" }: {
  locale?: RoleFilmLocale;
  timeline?: RoleFilmTimeline;
  musicFile?: string;
}) {
  if (timeline) {
    const roles = ["administrator", "supervisor", "operator", "observer"];
    return (
      <AbsoluteFill>
        <Audio src={staticFile(musicFile)} />
        {timeline.scenes.map((scene) => (
          <Sequence key={scene.id} from={scene.startFrame} durationInFrames={scene.durationInFrames}>
            {scene.id === "intro" ? <Intro locale={locale} />
              : scene.id === "review" ? <Review locale={locale} />
                : scene.id === "logo" ? <End />
                  : <Role locale={locale} index={roles.indexOf(scene.id)} durationInFrames={scene.durationInFrames} />}
          </Sequence>
        ))}
      </AbsoluteFill>
    );
  }
  return (
    <AbsoluteFill>
      <Audio src={staticFile(musicFile)} />
      <Sequence durationInFrames={90}><Intro locale={locale} /></Sequence>
      {[0, 1, 2, 3].map((index) => <Sequence key={index} from={90 + index * 180} durationInFrames={180}><Role locale={locale} index={index} /></Sequence>)}
      <Sequence from={810} durationInFrames={120}><Review locale={locale} /></Sequence>
      <Sequence from={930} durationInFrames={150}><End /></Sequence>
    </AbsoluteFill>
  );
}
