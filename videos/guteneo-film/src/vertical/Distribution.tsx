import {
  AbsoluteFill,
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
  NativeApp,
} from "./components";
import { Swallows } from "./PostalMotifs";
import { usePortraitLayout } from "./layout";

export const Channels = () => {
  const f = useCurrentFrame();
  const { y } = usePortraitLayout();
  const items = [
    { name: "Fax", detail: "Le PDF à sa destination.", icon: "↗", live: true },
    {
      name: "Courrier postal",
      detail: "Imprimé. Mis sous pli. Posté.",
      icon: "↗",
      live: true,
    },
    {
      name: "E-mail classique",
      detail: "Simple. Direct. Personnalisé.",
      icon: "@",
      live: false,
    },
    {
      name: "E-mail chiffré",
      detail: "Une transmission confidentielle.",
      icon: "◇",
      live: false,
    },
  ];
  return (
    <Frame blue>
      <div style={{ position: "absolute", left: 82, top: y(165) }}>
        <Kicker light>Une seule intention</Kicker>
        <Head size={143} style={{ marginTop: 55 }}>
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
            left: 82,
            top: y(670 + i * 221),
            width: 800,
            height: 186,
            padding: "26px 28px",
            background: item.live ? C.paper : "#163aaf",
            color: item.live ? C.ink : C.paper,
            border: item.live ? "none" : "1px solid #6e89e4",
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
          <div style={{ fontSize: 54, letterSpacing: -1 }}>
            <span
              style={{
                display: "inline-block",
                width: 67,
                color: item.live ? C.blue : "#d0dbff",
              }}
            >
              {item.icon}
            </span>
            {item.name}
          </div>
          <div
            style={{
              fontSize: 31,
              marginTop: 18,
              paddingLeft: 67,
              color: item.live ? "#727a71" : "#d2dcff",
            }}
          >
            {item.detail}
          </div>
        </div>
      ))}
    </Frame>
  );
};

export const Europe = () => {
  const f = useCurrentFrame();
  const { y } = usePortraitLayout();
  return (
    <Frame>
      <div style={{ position: "absolute", left: 82, top: y(170) }}>
        <Kicker>Imprimé. Affranchi. Distribué.</Kicker>
        <Head size={157} style={{ marginTop: 59 }}>
          L’Europe.
          <br />
          <em style={{ color: C.blue }}>Tout entière.</em>
        </Head>
        <Label style={{ fontSize: 42, marginTop: 40 }}>
          Vos documents, livrés par les postes.
        </Label>
      </div>
      <div
        style={{
          position: "absolute",
          left: 0,
          top: y(725),
          width: 1080,
          height: 670,
          overflow: "hidden",
        }}
      >
        <CanvasImage
          src={staticFile("brand/luxembourg-blue-panorama.webp")}
          style={{
            position: "absolute",
            width: 2010,
            height: 670,
            left: interpolate(f, [0, 150], [-200, -700], clamp),
            mixBlendMode: "multiply",
            scale: interpolate(f, [0, 150], [1.1, 1], clamp),
          }}
        />
      </div>
      <Swallows height={350} style={{ left: 0, top: y(635) }} />
      <div style={{ position: "absolute", left: 82, top: y(1410), width: 800 }}>
        <Kicker>Depuis votre atelier numérique</Kicker>
        <div style={{ fontFamily: serif, fontSize: 65, marginTop: 22 }}>
          Jusqu’à leur boîte aux lettres.
          <br />
        </div>
      </div>
    </Frame>
  );
};

export const PhysicalBurst = () => {
  const f = useCurrentFrame();
  const { y, height } = usePortraitLayout();
  const index = f < 40 ? 0 : f < 80 ? 1 : 2;
  const local = f % 40;
  const shots = [
    {
      file: "printed-paper.png",
      position: "75% center",
      text: <>Du numérique.</>,
    },
    {
      file: "courier.png",
      position: "70% center",
      text: (
        <>
          Au <em>réel.</em>
        </>
      ),
    },
    {
      file: "fax.png",
      position: "75% center",
      text: (
        <>
          Avec <em>guteneo.</em>
        </>
      ),
    },
  ];
  const shot = shots[index];
  return (
    <Frame dark>
      <CanvasImage
        src={staticFile(`images/${shot.file}`)}
        style={{
          width: 1080,
          height,
          objectFit: "cover",
          objectPosition: shot.position,
          scale: interpolate(local, [0, 9, 39], [1.15, 1.02, 1.07], {
            ...clamp,
            easing: ease,
          }),
          filter: `blur(${interpolate(local, [0, 7], [7, 0], clamp)}px)`,
        }}
      />
      <AbsoluteFill
        style={{
          background:
            "linear-gradient(180deg,#0e152466,transparent 40%,#0e1524b0)",
        }}
      />
      <div style={{ position: "absolute", left: 82, top: y(210) }}>
        <Kicker light>La suite de vos mots</Kicker>
      </div>
      <Head
        size={129}
        style={{ position: "absolute", left: 82, top: y(1230), width: 800 }}
      >
        {shot.text}
      </Head>
    </Frame>
  );
};

export const Access = () => {
  const f = useCurrentFrame();
  const { y } = usePortraitLayout();
  return (
    <Frame>
      <div style={{ position: "absolute", left: 82, top: y(165) }}>
        <Kicker>L’atelier dans votre poche</Kicker>
        <Head size={129} style={{ marginTop: 59 }}>
          Sur le web.
          <br />
          <em style={{ color: C.blue }}>Sur iPhone.</em>
        </Head>
        <Label style={{ marginTop: 35, fontSize: 35 }}>
          Vos documents et vos campagnes,
          <br />
          sur le site ou l’application iOS.
        </Label>
      </div>
      <div
        style={{
          position: "absolute",
          left: 245,
          top: y(740),
          width: 434,
          height: 860,
          padding: 13,
          borderRadius: 60,
          background: "#1a1d23",
          border: "3px solid #494c52",
          boxShadow: "0 45px 80px #18243944",
          transform: `perspective(1500px) rotateY(${interpolate(f, [0, 110], [21, -9], clamp)}deg) rotateZ(${interpolate(f, [0, 130], [8, -5], clamp)}deg)`,
          translate: interpolate(f, [0, 30], ["0px 400px", "0px 0px"], {
            ...clamp,
            easing: ease,
          }),
          scale: interpolate(f, [0, 30, 150], [0.9, 1, 1], {
            ...clamp,
            easing: ease,
          }),
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 12,
            borderRadius: 47,
            overflow: "hidden",
            background: C.paper,
          }}
        >
          <CanvasImage
            src={staticFile("vertical/mobile-web.png")}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              objectPosition: "top",
            }}
          />
          {/* Canonical small mark composited over the captured site's 44px logo.
              Source viewport: 390px; header logo at x=22, y=16.5.
              The original screenshot remains unchanged. */}
          <div
            style={{
              position: "absolute",
              left: `${(21 / 390) * 100}%`,
              top: 0,
              width: `${(46 / 390) * 100}%`,
              aspectRatio: 1,
              translate: `0 ${(15.5 / 46) * 100}%`,
              background: C.paper,
              padding: 1,
            }}
          >
            <CanvasImage
              src={staticFile("brand/guteneo-mark.png")}
              style={{
                width: "100%",
                height: "100%",
                mixBlendMode: "multiply",
              }}
            />
          </div>
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: 504,
              height: 1024,
              scale: 0.813,
              transformOrigin: "top left",
              opacity: interpolate(f, [48, 62], [0, 1], clamp),
            }}
          >
            <NativeApp />
          </div>
          <div
            style={{
              position: "absolute",
              left: 142,
              top: 10,
              width: 125,
              height: 32,
              borderRadius: 30,
              background: "#111",
            }}
          />
        </div>
      </div>
    </Frame>
  );
};

export const Signature = () => {
  const f = useCurrentFrame();
  return (
    <Frame blue>
      <Swallows
        light
        count={2}
        height={270}
        frameOffset={55}
        opacity={0.7}
        style={{ left: 0, top: "calc(50% - 500px)" }}
      />
      <div
        style={{
          position: "absolute",
          left: 82,
          right: 82,
          top: "50%",
          translate: "0 -50%",
          scale: interpolate(f, [0, 60], [1.04, 1], clamp),
        }}
      >
        <Lift>
          <Head size={150} style={{ lineHeight: 1.03, color: C.paper }}>
            La suite
            <br />
            <em>de vos mots.</em>
          </Head>
        </Lift>
      </div>
    </Frame>
  );
};

export const VerticalEnd = () => {
  const f = useCurrentFrame();
  const { y, height } = usePortraitLayout();
  return (
    <Frame>
      <Swallows
        height={300}
        durationInFrames={84}
        style={{ left: 0, top: y(240) }}
      />
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 590 + (height - 1920) / 2,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <Stamp
          size={425}
          postmarkProgress={interpolate(f, [24, 32], [0, 1], clamp)}
          style={{
            scale: interpolate(f, [0, 26], [1.16, 1], {
              ...clamp,
              easing: ease,
            }),
            translate: interpolate(f, [0, 26], ["55px 36px", "55px 0px"], {
              ...clamp,
              easing: ease,
            }),
            opacity: interpolate(f, [0, 10], [0, 1], clamp),
            rotate: interpolate(f, [0, 26], ["-5deg", "4deg"], {
              ...clamp,
              easing: ease,
            }),
          }}
        />
        <div
          style={{
            fontFamily: serif,
            fontSize: 97,
            letterSpacing: -3,
            marginTop: 72,
            opacity: interpolate(f, [15, 33], [0, 1], clamp),
          }}
        >
          guteneo.com
        </div>
      </div>
    </Frame>
  );
};
