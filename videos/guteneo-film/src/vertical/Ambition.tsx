import {
  AbsoluteFill,
  CanvasImage,
  interpolate,
  staticFile,
  spring,
  useCurrentFrame,
} from "remotion";
import {
  C,
  clamp,
  ease,
  Frame,
  Head,
  Kicker,
  Label,
  Lift,
  Sheet,
  serif,
  CornerBrand,
} from "./components";
import { usePortraitLayout } from "./layout";

export const One = () => {
  const f = useCurrentFrame();
  const { y } = usePortraitLayout();
  return (
    <Frame>
      <CornerBrand />
      <div style={{ position: "absolute", left: 82, top: y(355) }}>
        <Lift>
          <Kicker>La suite de vos mots</Kicker>
        </Lift>
        <Head size={146} style={{ marginTop: 44 }}>
          Tout part
          <br />
          d’un{" "}
          <span style={{ fontStyle: "italic", color: C.blue }}>document.</span>
        </Head>
      </div>
      <div
        style={{
          position: "absolute",
          left: 215,
          top: y(905),
          transform: `perspective(1400px) rotateX(${interpolate(f, [0, 75], [19, -2], clamp)}deg) rotateZ(${interpolate(f, [0, 75], [-15, -5], clamp)}deg)`,
          scale: interpolate(f, [0, 32, 88], [0.65, 1.02, 1.09], {
            ...clamp,
            easing: ease,
          }),
          translate: interpolate(f, [0, 28], ["0px 400px", "0px 0px"], {
            ...clamp,
            easing: ease,
          }),
        }}
      >
        <Sheet name="Camille" postmark={false} />
      </div>
      <div
        style={{
          position: "absolute",
          left: 700,
          top: y(920),
          fontSize: 130,
          fontFamily: serif,
          color: C.blue,
          rotate: "12deg",
          scale:
            1 +
            spring({ frame: f - 15, fps: 30, config: { damping: 13 } }) * 0.2,
        }}
      >
        1
      </div>
    </Frame>
  );
};

export const Scale = () => {
  const f = useCurrentFrame();
  const { y } = usePortraitLayout();
  const value =
    f < 13
      ? "1"
      : f < 23
        ? "10"
        : f < 33
          ? "100"
          : f < 45
            ? "1 000"
            : "10 000+";
  return (
    <Frame blue>
      <div style={{ position: "absolute", left: 82, top: y(200) }}>
        <Kicker light>De 1 à 10 000+ documents</Kicker>
        <Head size={114} style={{ marginTop: 44 }}>
          Changez
          <br />
          <em>d’échelle.</em>
        </Head>
      </div>
      <div
        style={{
          position: "absolute",
          left: 60,
          right: 130,
          top: y(665),
          fontFamily: serif,
          fontSize: f < 45 ? 280 : 221,
          lineHeight: 1,
          letterSpacing: -8,
          whiteSpace: "nowrap",
          textAlign: "center",
          scale: interpolate(f, [45, 49, 59], [1.17, 0.98, 1], clamp),
        }}
      >
        {value}
      </div>
      <div
        style={{ position: "absolute", left: 82, top: y(965), fontSize: 51 }}
      >
        documents par campagne
      </div>
      <div
        style={{
          position: "absolute",
          left: -55,
          top: y(1150),
          width: 1220,
          height: 900,
          perspective: 1000,
          transform: `rotate(-13deg) translateY(${interpolate(f, [0, 90], [90, -40], clamp)}px)`,
        }}
      >
        {Array.from({ length: 48 }, (_, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              left: (i % 8) * 155,
              top: Math.floor(i / 8) * 170,
              width: 121,
              height: 147,
              background: C.paper,
              boxShadow: "8px 14px 0 #132d91",
              rotate: `${(i % 3) - 1}deg`,
              opacity: interpolate(
                f,
                [i * 0.5 + 12, i * 0.5 + 30],
                [0, 0.92],
                clamp,
              ),
            }}
          >
            <div
              style={{ background: C.blue, width: 25, height: 25, margin: 12 }}
            />
            {[0, 1, 2, 3].map((j) => (
              <div
                key={j}
                style={{
                  height: 3,
                  background: "#ccd0d6",
                  margin: "10px 12px",
                  width: 80 - j * 7,
                }}
              />
            ))}
          </div>
        ))}
      </div>
      <div
        style={{
          position: "absolute",
          left: 62,
          top: y(1440),
          width: 845,
          padding: "26px 27px",
          background: "#163699",
          fontSize: 33,
          lineHeight: 1.3,
        }}
      >
        Un envoi unique.
        <br />
        Ou des milliers d’attentions.
      </div>
    </Frame>
  );
};

export const Personal = () => {
  const f = useCurrentFrame();
  const { y, height } = usePortraitLayout();
  return (
    <Frame dark>
      <CanvasImage
        src={staticFile("vertical/campaign-paper.png")}
        style={{
          width: 1080,
          height,
          objectFit: "cover",
          scale: interpolate(f, [0, 120], [1, 1.055], clamp),
        }}
      />
      <AbsoluteFill
        style={{
          background: "linear-gradient(180deg,#12192466,transparent 70%)",
        }}
      />
      <div style={{ position: "absolute", left: 82, top: y(180) }}>
        <Kicker light>Votre campagne. Votre style.</Kicker>
        <Lift at={4}>
          <Head size={140} style={{ marginTop: 65 }}>
            Du simple.
            <br />
            <em>Au personnel.</em>
          </Head>
        </Lift>
        <Label light style={{ marginTop: 36, maxWidth: 800 }}>
          Simple ou ultra-personnalisée.
        </Label>
      </div>
      {["Camille", "Noor", "Alex"].map((name, i) => (
        <div
          key={name}
          style={{
            position: "absolute",
            top: y(830 + i * 150),
            left: 90 + i * 55,
            width: 690,
            padding: "28px 33px",
            background: i === 1 ? C.blue : C.paper,
            color: i === 1 ? "white" : C.ink,
            boxShadow: "0 25px 45px #0002",
            fontFamily: serif,
            fontSize: 61,
            rotate: `${i === 1 ? 4 : -4}deg`,
            opacity: interpolate(f, [15 + i * 12, 24 + i * 12], [0, 1], clamp),
            translate: interpolate(
              f,
              [15 + i * 12, 40 + i * 12],
              ["850px 0px", "0px 0px"],
              { ...clamp, easing: ease },
            ),
          }}
        >
          Bonjour <em>{name}</em>,
        </div>
      ))}
      <Label
        light
        style={{
          position: "absolute",
          left: 82,
          top: y(1420),
          fontSize: 44,
          maxWidth: 790,
          padding: "22px 26px",
          background: "#101a2de6",
        }}
      >
        Une même campagne.
        <br />À chacun sa version.
      </Label>
    </Frame>
  );
};

export const Sources = () => {
  const f = useCurrentFrame();
  const { y } = usePortraitLayout();
  return (
    <Frame>
      <div style={{ position: "absolute", left: 82, top: y(175) }}>
        <Kicker>Votre contenu, votre choix</Kicker>
        <Head size={137} style={{ marginTop: 61 }}>
          Votre PDF.
          <br />
          <em style={{ color: C.blue }}>Votre modèle.</em>
        </Head>
      </div>
      <div
        style={{
          position: "absolute",
          left: 85,
          top: y(715),
          width: 790,
          height: 202,
          border: `2px solid ${C.blue}`,
          padding: 39,
          display: "flex",
          alignItems: "center",
          gap: 30,
          translate: interpolate(f, [0, 24], ["-850px 0px", "0px 0px"], {
            ...clamp,
            easing: ease,
          }),
        }}
      >
        <div
          style={{
            fontSize: 43,
            color: C.blue,
            border: `2px solid ${C.blue}`,
            padding: 15,
          }}
        >
          PDF
        </div>
        <div style={{ fontSize: 43 }}>
          Importez votre original.
          <div style={{ fontSize: 29, color: "#697271", marginTop: 13 }}>
            Le document exact, conservé.
          </div>
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          left: 180,
          top: y(1080),
          rotate: interpolate(f, [25, 95], ["14deg", "-3deg"], {
            ...clamp,
            easing: ease,
          }),
          scale: 0.99,
          translate: interpolate(f, [25, 55], ["0px 700px", "0px 0px"], {
            ...clamp,
            easing: ease,
          }),
        }}
      >
        <Sheet template />
      </div>
      <div
        style={{
          position: "absolute",
          left: 80,
          top: y(955),
          fontSize: 43,
          opacity: interpolate(f, [27, 39], [0, 1], clamp),
        }}
      >
        Ou faites créer votre mise en page.
      </div>
      <div
        style={{
          position: "absolute",
          left: 82,
          top: y(1440),
          background: C.paper,
          padding: "21px 24px",
          fontSize: 32,
          width: 800,
          lineHeight: 1.35,
          borderLeft: `4px solid ${C.blue}`,
        }}
      >
        Votre mise en page. Vos données.
        <br />
        Un modèle, des milliers de versions.
      </div>
    </Frame>
  );
};
