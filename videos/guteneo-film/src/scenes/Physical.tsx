import {
  AbsoluteFill,
  CanvasImage,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";
import { clamp, Eyebrow, Reveal, serif, sans } from "../design";

export const Physical: React.FC<{ kind: "print" | "courier" | "fax" }> = ({
  kind,
}) => {
  const f = useCurrentFrame();
  const info = {
    print: {
      file: "printed-paper.png",
      eyebrow: "03 / Le numérique prend forme",
      line1: "De l’écran",
      line2: "au papier.",
      sub: "Vos documents prennent une autre dimension.",
      duration: 162,
    },
    courier: {
      file: "courier.png",
      eyebrow: "Par courrier",
      line1: "Une lettre.",
      line2: "Un geste.",
      sub: "Impression. Mise sous pli. Envoi postal.",
      duration: 192,
    },
    fax: {
      file: "fax.png",
      eyebrow: "Ou par fax",
      line1: "L’essentiel.",
      line2: "Transmis.",
      sub: "Un document. Un envoi. Un suivi.",
      duration: 162,
    },
  }[kind];
  return (
    <AbsoluteFill
      style={{ background: "#12171e", color: "#fffefa", fontFamily: sans }}
    >
      <CanvasImage
        src={staticFile(`images/${info.file}`)}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          scale: interpolate(f, [0, info.duration], [1.015, 1.085], clamp),
          translate: interpolate(
            f,
            [0, info.duration],
            ["0px 0px", "-18px -5px"],
            clamp,
          ),
        }}
      />
      <AbsoluteFill
        style={{
          background:
            "linear-gradient(90deg,rgba(12,17,24,.72) 0%,rgba(12,17,24,.28) 48%,rgba(12,17,24,0) 78%)",
        }}
      />
      <div style={{ position: "absolute", left: 110, top: 94 }}>
        <Reveal delay={12}>
          <Eyebrow light>{info.eyebrow}</Eyebrow>
        </Reveal>
      </div>
      <div style={{ position: "absolute", left: 108, top: 330 }}>
        <Reveal
          delay={16}
          style={{
            fontFamily: serif,
            fontSize: 147,
            lineHeight: 0.98,
            letterSpacing: -3,
          }}
        >
          {info.line1}
        </Reveal>
        <Reveal
          delay={26}
          style={{
            fontFamily: serif,
            fontSize: 147,
            lineHeight: 0.98,
            letterSpacing: -3,
            fontStyle: "italic",
          }}
        >
          {info.line2}
        </Reveal>
        <Reveal
          delay={40}
          style={{
            fontSize: 32,
            marginTop: 48,
            maxWidth: 640,
            lineHeight: 1.4,
          }}
        >
          {info.sub}
        </Reveal>
      </div>
      <div
        style={{
          position: "absolute",
          right: 67,
          bottom: 45,
          fontSize: 20,
          opacity: 0.65,
          letterSpacing: 0.3,
        }}
      >
        Mise en scène
      </div>
    </AbsoluteFill>
  );
};
