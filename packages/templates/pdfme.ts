import { getDefaultFont } from "@pdfme/common";
import { text, table, line, rectangle, ellipse, image } from "@pdfme/schemas";
/** The font bytes ship inside the pinned MIT pdfme package; no CDN or font URL. */
export const templateFonts = {
  GuteneoSans: { ...Object.values(getDefaultFont())[0], fallback: true },
};
export const templatePlugins = {
  Text: {
    ...text,
    propPanel: {
      ...text.propPanel,
      defaultSchema: {
        ...text.propPanel.defaultSchema,
        fontName: "GuteneoSans",
        overflow: "expand" as const,
      },
    },
  },
  Table: {
    ...table,
    propPanel: {
      ...table.propPanel,
      defaultSchema: {
        ...table.propPanel.defaultSchema,
        repeatHead: true,
        headStyles: {
          ...table.propPanel.defaultSchema.headStyles,
          fontName: "GuteneoSans",
        },
        bodyStyles: {
          ...table.propPanel.defaultSchema.bodyStyles,
          fontName: "GuteneoSans",
        },
      },
    },
  },
  Line: line,
  Rectangle: rectangle,
  Ellipse: ellipse,
  Image: image,
};
