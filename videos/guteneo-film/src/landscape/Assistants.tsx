import {
  CanvasImage,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";
import { C, clamp, ease, Frame, Head, Kicker, Label, Lift } from "./components";

export const Assistants = () => {
  const f = useCurrentFrame();
  return (
    <Frame>
      <div style={{ position: "absolute", left: 120, top: 130 }}>
        <Kicker>Votre assistant, votre façon</Kicker>
        <Lift>
          <Head size={159} style={{ marginTop: 49 }}>
            Dites-le <em style={{ color: C.blue }}>à votre IA.</em>
          </Head>
        </Lift>
      </div>
      {[
        ["chatgpt.svg", "ChatGPT"],
        ["claude.svg", "Claude"],
        ["copilot.svg", "Copilot"],
      ].map(([icon, name], i) => (
        <div
          key={name}
          style={{
            position: "absolute",
            left: 120 + i * 566,
            top: 465,
            width: 535,
            height: 320,
            background: "#fffefa",
            border: "1px solid #d5d7cf",
            padding: "43px 40px",
            rotate: `${i === 1 ? 2 : -2}deg`,
            translate: interpolate(
              f,
              [i * 11, i * 11 + 25],
              ["0px 650px", "0px 0px"],
              { ...clamp, easing: ease },
            ),
            boxShadow: "0 22px 45px #181b2211",
          }}
        >
          <CanvasImage
            src={staticFile(`brand/${icon}`)}
            style={{ width: 98, height: 98, objectFit: "contain" }}
          />
          <div
            style={{
              display: "flex",
              alignItems: "center",
              fontSize: 55,
              marginTop: 32,
            }}
          >
            {name}
            <span style={{ marginLeft: "auto", color: C.blue }}>↗</span>
          </div>
        </div>
      ))}
      <Label
        style={{ position: "absolute", left: 120, top: 877, fontSize: 38 }}
      >
        Créez. Personnalisez. Envoyez, avec votre IA.
      </Label>
    </Frame>
  );
};
