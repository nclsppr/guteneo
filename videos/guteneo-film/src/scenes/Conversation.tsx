import {
  CanvasImage,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";
import { C, clamp, ease, Eyebrow, Paper, Reveal, sans, serif } from "../design";

const prompt = "Prépare ce courrier pour l’envoi.";
export const Conversation = () => {
  const f = useCurrentFrame();
  const typed = prompt.slice(0, Math.max(0, Math.floor((f - 25) * 0.9)));
  return (
    <Paper>
      <div style={{ position: "absolute", left: 110, top: 77 }}>
        <Eyebrow>01 / Une conversation</Eyebrow>
      </div>
      <Reveal style={{ position: "absolute", left: 110, top: 183, width: 560 }}>
        <div
          style={{
            fontFamily: serif,
            fontSize: 105,
            lineHeight: 0.99,
            letterSpacing: -2.5,
          }}
        >
          Tout commence
          <br />
          par{" "}
          <span style={{ fontStyle: "italic", color: C.blue }}>vos mots.</span>
        </div>
        <Reveal
          delay={36}
          style={{
            fontSize: 35,
            lineHeight: 1.45,
            marginTop: 44,
            maxWidth: 430,
          }}
        >
          Votre assistant prépare.
          <br />
          Vous gardez la main.
        </Reveal>
      </Reveal>
      <div
        style={{
          position: "absolute",
          left: 732,
          top: 110,
          width: 1080,
          height: 850,
          background: "#fff",
          border: "1px solid #e1e0d9",
          borderRadius: 23,
          boxShadow: "0 35px 100px #181b2215",
          overflow: "hidden",
          translate: interpolate(f, [0, 35], ["100px 30px", "0px 0px"], {
            ...clamp,
            easing: ease,
          }),
          scale: interpolate(f, [0, 255], [0.98, 1.015], clamp),
        }}
      >
        <div
          style={{
            height: 83,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 38px",
            borderBottom: "1px solid #efefed",
          }}
        >
          <span style={{ fontFamily: sans, fontSize: 30 }}>
            ChatGPT <span style={{ color: "#9c9c99" }}>⌄</span>
          </span>
          <span style={{ fontSize: 20, color: "#777" }}>Démonstration</span>
        </div>
        <div
          style={{
            margin: "40px 42px 0 auto",
            width: 570,
            background: "#f3f3f1",
            borderRadius: 22,
            padding: "22px 30px",
            minHeight: 163,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 15,
              marginBottom: 20,
            }}
          >
            <div
              style={{
                border: "1px solid #d7d8d3",
                borderRadius: 8,
                background: "white",
                padding: 12,
                fontSize: 18,
                color: C.blue,
              }}
            >
              PDF
            </div>
            <div style={{ fontSize: 23 }}>
              Lettre.pdf{" "}
              <span style={{ color: "#81817b", fontSize: 19 }}> · 1 page</span>
            </div>
          </div>
          <div style={{ fontSize: 28 }}>
            {typed}
            <span style={{ opacity: f < 70 ? 1 : 0, color: C.blue }}>▍</span>
          </div>
        </div>
        <Reveal delay={78} style={{ padding: "37px 43px 0" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
              marginBottom: 22,
            }}
          >
            <CanvasImage
              src={staticFile("brand/chatgpt.svg")}
              style={{ width: 35, height: 35 }}
            />
            <span style={{ fontSize: 23, fontWeight: 500 }}>ChatGPT</span>
          </div>
          <div style={{ fontSize: 30, lineHeight: 1.45 }}>
            Votre courrier est préparé.
            <br />
            Vérifiez le document, le destinataire et le tarif
            <br />
            dans Guteneo avant de confirmer.
          </div>
        </Reveal>
        <Reveal
          delay={115}
          style={{
            margin: "30px 43px 0",
            padding: 24,
            border: "1px solid #d9ded2",
            borderRadius: 14,
            background: "#fbfcf8",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 17 }}>
            <CanvasImage
              src={staticFile("brand/guteneo-mark.png")}
              style={{ width: 57, height: 57 }}
            />
            <div>
              <div style={{ fontFamily: serif, fontSize: 33, lineHeight: 1 }}>
                guteneo
              </div>
              <div style={{ fontSize: 20, color: "#73766f", marginTop: 8 }}>
                Courrier préparé · En attente de validation
              </div>
            </div>
          </div>
          <div
            style={{
              marginTop: 21,
              height: 53,
              background: C.blue,
              color: "white",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 22,
              borderRadius: 7,
            }}
          >
            Vérifier dans Guteneo <span style={{ marginLeft: 14 }}>↗</span>
          </div>
        </Reveal>
        <div
          style={{
            position: "absolute",
            bottom: 21,
            left: 43,
            right: 43,
            padding: "18px 22px",
            border: "1px solid #e6e6e2",
            borderRadius: 30,
            color: "#94958f",
            fontSize: 20,
          }}
        >
          Poser une question{" "}
          <span style={{ float: "right", color: C.ink }}>↑</span>
        </div>
      </div>
    </Paper>
  );
};
