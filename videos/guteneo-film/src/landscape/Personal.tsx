import {
  CanvasImage,
  interpolate,
  staticFile,
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
  serif,
} from "./components";

export const Personal = () => {
  const f = useCurrentFrame();
  return (
    <Frame dark>
      <CanvasImage
        src={staticFile("vertical/campaign-paper.png")}
        style={{
          position: "absolute",
          right: 0,
          top: 0,
          width: 940,
          height: 1080,
          objectFit: "cover",
          objectPosition: "center 65%",
          scale: interpolate(f, [0, 120], [1, 1.055], clamp),
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: 1300,
          height: 1080,
          background: "linear-gradient(90deg,#181b22 65%,#181b2200)",
        }}
      />
      <div style={{ position: "absolute", left: 120, top: 155 }}>
        <Kicker light>Votre campagne. Votre style.</Kicker>
        <Lift at={4}>
          <Head size={150} style={{ marginTop: 60 }}>
            Du simple.
            <br />
            <em>Au personnel.</em>
          </Head>
        </Lift>
        <Label light style={{ marginTop: 46 }}>
          Simple ou ultra-personnalisée.
        </Label>
      </div>
      {["Camille", "Noor", "Alex"].map((name, i) => (
        <div
          key={name}
          style={{
            position: "absolute",
            left: 1040 + i * 32,
            top: 425 + i * 150,
            width: 675,
            padding: "25px 36px",
            background: i === 1 ? C.blue : C.paper,
            color: i === 1 ? "white" : C.ink,
            boxShadow: "0 25px 45px #0003",
            fontFamily: serif,
            fontSize: 64,
            rotate: `${i === 1 ? 4 : -4}deg`,
            opacity: interpolate(f, [15 + i * 12, 24 + i * 12], [0, 1], clamp),
            translate: interpolate(
              f,
              [15 + i * 12, 40 + i * 12],
              ["900px 0px", "0px 0px"],
              { ...clamp, easing: ease },
            ),
          }}
        >
          Bonjour <em>{name}</em>,
        </div>
      ))}
      <Label
        light
        style={{ position: "absolute", left: 120, top: 817, fontSize: 36 }}
      >
        Une même campagne.
        <br />À chacun sa version.
      </Label>
    </Frame>
  );
};
