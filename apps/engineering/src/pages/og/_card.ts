/** Branded social previews, generated from the same titles as the docs. */
import { readFile } from "node:fs/promises";
import {
  createCardRenderer,
  type CardNode,
  type CardTypography,
} from "@cloudflare/nimbus-docs/og";
import { root } from "astro:config/server";

const INK = "#181b22";
const PAPER = "#f6f5ef";
const COBALT = "#2450db";
const WIDTH = 1200;
const HEIGHT = 630;
const LEFT = 80;
const COLUMN = WIDTH - LEFT * 2;

const TITLE: CardTypography = {
  fontFamily: "EB Garamond",
  fontWeight: 400,
  letterSpacing: "-0.02em",
  lineHeight: 1.08,
  color: INK,
};
const SECTION: CardTypography = {
  fontFamily: "IBM Plex Sans",
  fontWeight: 400,
  lineHeight: 1.4,
  color: "#565d68",
};
const font = (family: string, file: string) =>
  new URL(`node_modules/@fontsource/${family}/files/${file}`, root);
const renderer = await createCardRenderer({
  width: WIDTH,
  height: HEIGHT,
  fonts: [
    {
      name: "EB Garamond",
      source: font("eb-garamond", "eb-garamond-latin-400-normal.woff"),
      weight: 400,
    },
    {
      name: "IBM Plex Sans",
      source: font("ibm-plex-sans", "ibm-plex-sans-latin-400-normal.woff"),
      weight: 400,
    },
  ],
  emoji: "strip",
});
const portrait = `data:image/png;base64,${(await readFile(new URL("public/brand/guteneo-portrait.png", root))).toString("base64")}`;
type Style = Record<string, string | number>;
const el = (
  type: string,
  style: Style,
  children?: CardNode | (CardNode | undefined)[] | string,
): CardNode => ({ type, props: { style, children } });

async function card({
  section,
  title,
  sizes,
}: {
  section?: string;
  title: string;
  sizes: number[];
}): Promise<CardNode> {
  const heading = await renderer.fit(title, {
    width: COLUMN,
    sizes,
    lines: 3,
    style: TITLE,
  });
  const label = section
    ? await renderer.fit(section, {
        width: COLUMN,
        sizes: [25],
        lines: 1,
        style: SECTION,
      })
    : undefined;
  return el(
    "div",
    {
      width: WIDTH,
      height: HEIGHT,
      display: "flex",
      position: "relative",
      background: PAPER,
    },
    [
      el(
        "div",
        {
          position: "absolute",
          left: LEFT,
          top: 58,
          display: "flex",
          alignItems: "center",
          gap: 18,
        },
        [
          { type: "img", props: { src: portrait, width: 64, height: 64 } },
          el(
            "span",
            {
              fontFamily: "EB Garamond",
              fontWeight: 400,
              fontSize: 46,
              color: INK,
              letterSpacing: "-0.03em",
            },
            "guteneo",
          ),
          el(
            "span",
            {
              fontFamily: "IBM Plex Sans",
              fontWeight: 400,
              fontSize: 22,
              color: INK,
              marginLeft: 10,
            },
            "Engineering",
          ),
        ],
      ),
      el("div", {
        position: "absolute",
        left: LEFT,
        right: LEFT,
        top: 162,
        height: 0,
        borderTop: "1px solid #d9d9d0",
      }),
      el(
        "div",
        {
          position: "absolute",
          left: LEFT,
          top: 208,
          display: "flex",
          flexDirection: "column",
        },
        [
          label && el("div", { display: "flex", marginBottom: 20 }, label.node),
          heading.node,
        ],
      ),
      el("div", {
        position: "absolute",
        left: LEFT,
        bottom: 58,
        width: 72,
        height: 4,
        background: COBALT,
      }),
    ],
  );
}

export const renderPageCard = async (input: {
  section?: string;
  title: string;
}) => renderer.png(await card({ ...input, sizes: [76, 68, 60, 52, 44] }));

export const renderSiteCard = async (input: { title: string }) =>
  renderer.png(await card({ ...input, sizes: [76, 68, 60, 52, 44] }));
