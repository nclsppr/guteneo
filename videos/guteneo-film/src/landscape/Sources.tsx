import { interpolate, useCurrentFrame } from "remotion";
import {
  C,
  clamp,
  ease,
  Frame,
  Head,
  Kicker,
  Label,
  Sheet,
} from "./components";

export const Sources = () => {
  const f = useCurrentFrame();
  return (
    <Frame>
      <div style={{ position: "absolute", left: 120, top: 145 }}>
        <Kicker>Votre contenu, votre choix</Kicker>
        <Head size={148} style={{ marginTop: 55 }}>
          Votre PDF.
          <br />
          <em style={{ color: C.blue }}>Votre modèle.</em>
        </Head>
      </div>
      <div
        style={{
          position: "absolute",
          left: 120,
          top: 595,
          width: 795,
          padding: "34px 32px",
          border: `2px solid ${C.blue}`,
          display: "flex",
          alignItems: "center",
          gap: 30,
          translate: interpolate(f, [0, 24], ["-1000px 0px", "0px 0px"], {
            ...clamp,
            easing: ease,
          }),
        }}
      >
        <div
          style={{
            fontSize: 37,
            color: C.blue,
            border: `2px solid ${C.blue}`,
            padding: 16,
          }}
        >
          PDF
        </div>
        <div style={{ fontSize: 34 }}>
          Importez votre original.
          <div style={{ fontSize: 26, color: "#697271", marginTop: 12 }}>
            Le document exact, conservé.
          </div>
        </div>
      </div>
      <Label
        style={{ position: "absolute", left: 120, top: 833, fontSize: 33 }}
      >
        Votre mise en page. Vos données.
        <br />
        Un modèle, des milliers de versions.
      </Label>
      <div
        style={{
          position: "absolute",
          left: 1190,
          top: 180,
          rotate: interpolate(f, [25, 95], ["13deg", "-4deg"], {
            ...clamp,
            easing: ease,
          }),
          translate: interpolate(f, [25, 55], ["0px 900px", "0px 0px"], {
            ...clamp,
            easing: ease,
          }),
        }}
      >
        <Sheet template />
      </div>
    </Frame>
  );
};
