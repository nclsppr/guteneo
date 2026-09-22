import { interpolate, useCurrentFrame } from "remotion";
import { C, clamp, ease, Frame, Head, Kicker } from "./components";

export const Channels = () => {
  const f = useCurrentFrame();
  const items = [
    { name: "Fax", detail: "Le PDF à sa destination.", icon: "↗" },
    {
      name: "Courrier postal",
      detail: "Imprimé. Mis sous pli. Posté.",
      icon: "↗",
    },
    {
      name: "E-mail classique",
      detail: "Simple. Direct. Personnalisé.",
      icon: "@",
    },
    {
      name: "E-mail chiffré",
      detail: "Une transmission confidentielle.",
      icon: "◇",
    },
  ];
  return (
    <Frame blue>
      <div style={{ position: "absolute", left: 120, top: 205 }}>
        <Kicker light>Une seule intention</Kicker>
        <Head size={160} style={{ marginTop: 55 }}>
          Plusieurs
          <br />
          <em>chemins.</em>
        </Head>
      </div>
      {items.map((item, i) => (
        <div
          key={item.name}
          style={{
            position: "absolute",
            left: 990,
            top: 112 + i * 221,
            width: 808,
            height: 186,
            padding: "25px 30px",
            background: i < 2 ? C.paper : "#163aaf",
            color: i < 2 ? C.ink : C.paper,
            border: i < 2 ? "none" : "1px solid #6e89e4",
            translate: interpolate(
              f,
              [7 + i * 18, 27 + i * 18],
              ["1000px 0px", "0px 0px"],
              { ...clamp, easing: ease },
            ),
            rotate: interpolate(
              f,
              [7 + i * 18, 27 + i * 18],
              ["5deg", "0deg"],
              clamp,
            ),
          }}
        >
          <div style={{ fontSize: 49, letterSpacing: -1 }}>
            <span
              style={{
                display: "inline-block",
                width: 61,
                color: i < 2 ? C.blue : "#d0dbff",
              }}
            >
              {item.icon}
            </span>
            {item.name}
          </div>
          <div
            style={{
              fontSize: 28,
              marginTop: 16,
              paddingLeft: 61,
              color: i < 2 ? "#727a71" : "#d2dcff",
            }}
          >
            {item.detail}
          </div>
        </div>
      ))}
    </Frame>
  );
};
