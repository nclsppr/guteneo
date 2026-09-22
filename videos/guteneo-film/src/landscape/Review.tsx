import { interpolate, useCurrentFrame } from "remotion";
import {
  C,
  Check,
  clamp,
  Frame,
  Head,
  Kicker,
  Sheet,
  serif,
} from "./components";

export const Review = () => {
  const f = useCurrentFrame();
  return (
    <Frame>
      <div style={{ position: "absolute", left: 120, top: 149 }}>
        <Kicker>Le dernier mot vous appartient</Kicker>
        <Head size={135} style={{ marginTop: 52 }}>
          {f >= 85 ? (
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
      <div style={{ position: "absolute", left: 120, top: 650 }}>
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
              gap: 21,
              marginBottom: 27,
              fontSize: 34,
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
      <div
        style={{
          position: "absolute",
          left: 982,
          top: 190,
          width: 806,
          height: 700,
          overflow: "hidden",
          border: "1px solid #dadbd1",
          borderRadius: 12,
          background: "#e9ece2",
          boxShadow: "0 20px 55px #181b2215",
          padding: 40,
        }}
      >
        <div style={{ fontSize: 25, color: C.blue }}>BON À TIRER</div>
        <div style={{ fontFamily: serif, fontSize: 54, marginTop: 28 }}>
          Votre campagne.
        </div>
        <div
          style={{ fontSize: 28, lineHeight: 1.7, marginTop: 35, width: 285 }}
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
            right: 26,
            top: 160,
            transformOrigin: "top right",
            scale: interpolate(f, [0, 85], [0.5, 0.56], clamp),
            rotate: interpolate(f, [0, 85], ["5deg", "-2deg"], clamp),
          }}
        >
          <Sheet />
        </div>
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            padding: "27px 34px",
            background: C.blue,
            color: "white",
            fontSize: 29,
          }}
        >
          Tout est clair avant l’envoi.
        </div>
      </div>
    </Frame>
  );
};
