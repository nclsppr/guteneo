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
  Stamp,
  serif,
  Check,
  Sheet,
} from "./components";
import { usePortraitLayout } from "./layout";

export const Assistants = () => {
  const f = useCurrentFrame();
  const { y } = usePortraitLayout();
  return (
    <Frame>
      <div style={{ position: "absolute", left: 82, top: y(180) }}>
        <Kicker>Votre assistant, votre façon</Kicker>
        <Lift>
          <Head size={153} style={{ marginTop: 68 }}>
            Dites-le
            <br />
            <em style={{ color: C.blue }}>à votre IA.</em>
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
            left: 82,
            top: y(735 + i * 235),
            width: 795,
            height: 183,
            background: "#fffefa",
            border: "1px solid #d5d7cf",
            display: "flex",
            alignItems: "center",
            gap: 39,
            padding: "20px 37px",
            rotate: `${i % 2 ? 2 : -2}deg`,
            translate: interpolate(
              f,
              [i * 11, i * 11 + 25],
              ["1000px 0px", "0px 0px"],
              { ...clamp, easing: ease },
            ),
            boxShadow: "0 22px 45px #181b2211",
          }}
        >
          <CanvasImage
            src={staticFile(`brand/${icon}`)}
            style={{ width: 100, height: 100, objectFit: "contain" }}
          />
          <div style={{ fontSize: 65 }}>{name}</div>
          <span style={{ marginLeft: "auto", fontSize: 48, color: C.blue }}>
            ↗
          </span>
        </div>
      ))}
      <Label
        style={{ position: "absolute", left: 82, top: y(1500), width: 790 }}
      >
        Créez. Personnalisez.
        <br />
        Envoyez, avec votre IA.
      </Label>
    </Frame>
  );
};

export const Generate = () => {
  const f = useCurrentFrame();
  const { y } = usePortraitLayout();
  const prompt = "Crée une lettre en PDF, puis prépare son envoi avec Guteneo.";
  return (
    <Frame dark>
      <div style={{ position: "absolute", left: 82, top: y(165) }}>
        <Kicker light>De l’idée au document</Kicker>
        <Head size={123} style={{ marginTop: 65 }}>
          « Crée mon PDF.
          <br />
          <em>Prépare l’envoi. »</em>
        </Head>
      </div>
      <div
        style={{
          position: "absolute",
          left: 75,
          top: y(640),
          width: 820,
          height: 880,
          borderRadius: 30,
          background: "#fafaf8",
          color: C.ink,
          boxShadow: "0 35px 100px #0005",
          padding: 43,
          scale: interpolate(f, [0, 24, 140], [0.88, 1, 1.035], {
            ...clamp,
            easing: ease,
          }),
          rotate: interpolate(f, [0, 24], ["-5deg", "0deg"], {
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
            fontSize: 32,
          }}
        >
          <CanvasImage
            src={staticFile("brand/chatgpt.svg")}
            style={{ width: 42, height: 42 }}
          />
          ChatGPT
          <span style={{ marginLeft: "auto", fontSize: 23, color: "#797f7b" }}>
            guteneo
          </span>
        </div>
        <div
          style={{
            marginTop: 48,
            marginLeft: 60,
            padding: 28,
            borderRadius: 19,
            background: "#eeefea",
            fontSize: 38,
            lineHeight: 1.25,
            minHeight: 170,
          }}
        >
          {prompt.slice(0, Math.max(0, Math.floor((f - 10) * 2.1)))}
        </div>
        <Lift at={48} style={{ marginTop: 45, fontSize: 36, lineHeight: 1.4 }}>
          Le PDF est créé.
          <br />
          Vous pouvez le relire avant l’envoi.
        </Lift>
        <Lift
          at={68}
          style={{
            marginTop: 32,
            padding: "30px 24px",
            border: "1px solid #d9ddd4",
            borderRadius: 13,
            display: "flex",
            alignItems: "center",
            gap: 22,
          }}
        >
          <div style={{ fontSize: 31, color: C.blue }}>PDF</div>
          <div style={{ fontSize: 33 }}>
            Votre-lettre.pdf
            <div style={{ fontSize: 25, color: "#72796f", marginTop: 10 }}>
              1 page · prêt à être relu
            </div>
          </div>
          <Check />
        </Lift>
        <Lift
          at={92}
          style={{
            marginTop: 36,
            display: "flex",
            gap: 19,
            alignItems: "center",
          }}
        >
          <Stamp size={75} />
          <div>
            <div style={{ fontFamily: serif, fontSize: 48 }}>guteneo</div>
            <div style={{ fontSize: 28, color: "#72796f" }}>
              Préparer ce document ↗
            </div>
          </div>
        </Lift>
      </div>
    </Frame>
  );
};

export const Review = () => {
  const f = useCurrentFrame();
  const { y } = usePortraitLayout();
  const phase = f >= 85;
  return (
    <Frame>
      <div style={{ position: "absolute", left: 82, top: y(170) }}>
        <Kicker>Le dernier mot vous appartient</Kicker>
        <Head size={133} style={{ marginTop: 59 }}>
          {phase ? (
            <>
              Le bon PDF.
              <br />
              <em style={{ color: C.blue }}>Le bon devis.</em>
            </>
          ) : (
            <>
              Relisez.
              <br />
              <em style={{ color: C.blue }}>Puis validez.</em>
            </>
          )}
        </Head>
      </div>
      <div
        style={{
          position: "absolute",
          left: 85,
          top: y(690),
          width: 795,
          height: 555,
          overflow: "hidden",
          border: "1px solid #dadbd1",
          borderRadius: 12,
          boxShadow: "0 20px 55px #181b2215",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "#e9ece2",
            padding: 35,
          }}
        >
          <div style={{ fontSize: 27, color: C.blue }}>BON À TIRER</div>
          <div style={{ fontFamily: serif, fontSize: 55, marginTop: 20 }}>
            Votre campagne.
          </div>
          <div
            style={{ fontSize: 29, lineHeight: 1.5, marginTop: 22, width: 290 }}
          >
            Original vérifié.
            <br />
            Destinataires relus.
            <br />
            Devis confirmé.
          </div>
          <div
            style={{
              position: "absolute",
              right: 12,
              top: 35,
              transformOrigin: "top right",
              scale: interpolate(f, [0, 85], [0.46, 0.5], clamp),
              rotate: interpolate(f, [0, 85], ["5deg", "-2deg"], clamp),
            }}
          >
            <Sheet name="Camille" logoDisplayScale={0.5} />
          </div>
        </div>
        <div
          style={{
            position: "absolute",
            left: 0,
            bottom: 0,
            right: 0,
            padding: "17px 25px",
            background: C.blue,
            color: "white",
            fontSize: 26,
          }}
        >
          Tout est clair avant l’envoi.
        </div>
      </div>
      <div style={{ position: "absolute", left: 85, top: y(1290), width: 795 }}>
        {[
          "Document & destinataire",
          "Tarif & plafond",
          "Votre accord avant l’envoi",
        ].map((text, i) => (
          <div
            key={text}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 23,
              marginBottom: 27,
              fontSize: 39,
              opacity: interpolate(
                f,
                [18 + i * 20, 32 + i * 20],
                [0, 1],
                clamp,
              ),
              translate: interpolate(
                f,
                [18 + i * 20, 35 + i * 20],
                ["0px 20px", "0px 0px"],
                clamp,
              ),
            }}
          >
            <Check />
            {text}
          </div>
        ))}
      </div>
    </Frame>
  );
};
