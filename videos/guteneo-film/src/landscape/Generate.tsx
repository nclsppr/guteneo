import {
  CanvasImage,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";
import {
  C,
  Check,
  clamp,
  ease,
  Frame,
  Head,
  Kicker,
  Lift,
  Mark,
  serif,
} from "./components";

export const Generate = () => {
  const f = useCurrentFrame();
  const prompt = "Crée une lettre en PDF, puis prépare son envoi avec Guteneo.";
  return (
    <Frame dark>
      <div style={{ position: "absolute", left: 120, top: 207, width: 790 }}>
        <Kicker light>De l’idée au document</Kicker>
        <Head size={111} style={{ marginTop: 59 }}>
          « Crée mon PDF.
          <br />
          <em>
            Prépare
            <br />
            l’envoi. »
          </em>
        </Head>
      </div>
      <div
        style={{
          position: "absolute",
          left: 980,
          top: 128,
          width: 810,
          height: 813,
          borderRadius: 26,
          background: "#fafaf8",
          color: C.ink,
          boxShadow: "0 35px 100px #0005",
          padding: 42,
          scale: interpolate(f, [0, 24, 140], [0.88, 1, 1.02], {
            ...clamp,
            easing: ease,
          }),
          rotate: interpolate(f, [0, 24], ["-4deg", "0deg"], {
            ...clamp,
            easing: ease,
          }),
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            fontSize: 30,
          }}
        >
          <CanvasImage
            src={staticFile("brand/chatgpt.svg")}
            style={{ width: 42, height: 42 }}
          />
          ChatGPT
          <span style={{ marginLeft: "auto", fontSize: 22, color: "#797f7b" }}>
            guteneo
          </span>
        </div>
        <div
          style={{
            marginTop: 38,
            marginLeft: 50,
            padding: 26,
            borderRadius: 19,
            background: "#eeefea",
            fontSize: 34,
            lineHeight: 1.3,
            minHeight: 154,
          }}
        >
          {prompt.slice(0, Math.max(0, Math.floor((f - 10) * 2.1)))}
        </div>
        <Lift at={48} style={{ marginTop: 35, fontSize: 32, lineHeight: 1.4 }}>
          Le PDF est créé.
          <br />
          Vous pouvez le relire avant l’envoi.
        </Lift>
        <Lift
          at={68}
          style={{
            marginTop: 29,
            padding: "25px 22px",
            border: "1px solid #d9ddd4",
            borderRadius: 13,
            display: "flex",
            alignItems: "center",
            gap: 20,
          }}
        >
          <div style={{ fontSize: 29, color: C.blue }}>PDF</div>
          <div style={{ fontSize: 30 }}>
            Votre-lettre.pdf
            <div style={{ fontSize: 23, color: "#72796f", marginTop: 9 }}>
              1 page · prêt à être relu
            </div>
          </div>
          <Check />
        </Lift>
        <Lift
          at={92}
          style={{
            marginTop: 32,
            display: "flex",
            gap: 19,
            alignItems: "center",
          }}
        >
          <Mark size={67} />
          <div>
            <div style={{ fontFamily: serif, fontSize: 43 }}>guteneo</div>
            <div style={{ fontSize: 26, color: "#72796f" }}>
              Préparer ce document ↗
            </div>
          </div>
        </Lift>
      </div>
    </Frame>
  );
};
