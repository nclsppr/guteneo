import {
  PDFME_VERSION,
  validateTemplateEnvelope,
  type GraphicBlock,
  type TemplateEnvelope,
} from "../contracts/src/templates";

export function textBlock(
  name: string,
  content: string,
  x: number,
  y: number,
  width: number,
  height = 10,
  fontSize = 11,
): GraphicBlock {
  return {
    name,
    type: "text",
    content,
    position: { x, y },
    width,
    height,
    fontName: "GuteneoSans",
    fontSize,
    fontColor: "#202827",
    lineHeight: 1.25,
    characterSpacing: 0,
    alignment: "left",
    verticalAlignment: "top",
    overflow: "expand",
    readOnly: true,
  };
}
export function tableBlock(
  name: string,
  headers: string[],
  y = 92,
): GraphicBlock {
  const border = { top: 0, right: 0, bottom: 0.2, left: 0 },
    padding = { top: 2.5, right: 2, bottom: 2.5, left: 2 };
  const style = {
    fontName: "GuteneoSans",
    fontSize: 10,
    characterSpacing: 0,
    alignment: "left",
    verticalAlignment: "middle",
    lineHeight: 1.2,
    borderWidth: border,
    padding,
    fontColor: "#202827",
    borderColor: "#D9DEDA",
    backgroundColor: "",
  };
  return {
    name,
    type: "table",
    content: JSON.stringify([headers.map(() => "Exemple")]),
    position: { x: 20, y },
    width: 170,
    height: 22,
    showHead: true,
    repeatHead: true,
    head: headers,
    headWidthPercentages: headers.map(() => 100 / headers.length),
    tableStyles: { borderWidth: 0, borderColor: "#D9DEDA" },
    headStyles: { ...style, fontColor: "#FFFFFF", backgroundColor: "#24594C" },
    bodyStyles: { ...style, alternateBackgroundColor: "#F4F6F3" },
    columnStyles: {},
    readOnly: false,
  };
}
function base(name: string, description: string): TemplateEnvelope {
  return {
    schemaVersion: 1,
    engine: "pdfme",
    engineVersion: PDFME_VERSION,
    name,
    description,
    locale: "fr-FR",
    definition: {
      basePdf: {
        width: 210,
        height: 297,
        padding: [22, 20, 20, 20],
        staticSchema: [
          textBlock("header", "ENTREPRISE EXEMPLE", 20, 10, 170, 6, 8),
          textBlock(
            "footer",
            "Données fictives · Page {currentPage} / {totalPages}",
            20,
            283,
            170,
            6,
            8,
          ),
        ],
      },
      schemas: [[]],
      pdfmeVersion: PDFME_VERSION,
    },
    inputSchema: { type: "object", properties: {} },
    bindings: [],
    sampleData: {},
    sampleDataSynthetic: true,
    resources: [],
  };
}
export function letterTemplate(): TemplateEnvelope {
  const envelope = base(
    "Courrier professionnel",
    "Un courrier personnalisable avec adresse, objet et paragraphes. Les exemples sont fictifs.",
  );
  envelope.definition.schemas[0] = [
    textBlock(
      "recipient",
      "Entreprise Exemple\n12 rue des Ateliers\n75002 Paris",
      112,
      35,
      78,
      25,
    ),
    textBlock("reference", "Objet du courrier", 20, 76, 170, 12, 16),
    textBlock(
      "body",
      "Madame, Monsieur,\n\nVotre courrier personnalisé commence ici.\n\nCordialement,",
      20,
      96,
      170,
      60,
    ),
    textBlock("signature", "L’équipe Exemple", 20, 165, 170, 15),
  ];
  envelope.inputSchema = {
    type: "object",
    properties: {
      recipient: {
        type: "object",
        properties: {
          address: { type: "string", title: "Nom et adresse", maxLength: 600 },
        },
        required: ["address"],
      },
      subject: { type: "string", title: "Objet", maxLength: 300 },
      body: { type: "string", title: "Courrier" },
      signature: {
        type: "string",
        title: "Signature",
        default: "L’équipe Exemple",
      },
    },
    required: ["recipient", "subject", "body"],
  };
  envelope.bindings = [
    {
      block: "recipient",
      kind: "value",
      path: "recipient.address",
      format: "text",
      required: true,
    },
    {
      block: "reference",
      kind: "value",
      path: "subject",
      format: "text",
      required: true,
    },
    {
      block: "body",
      kind: "value",
      path: "body",
      format: "text",
      required: true,
    },
    {
      block: "signature",
      kind: "value",
      path: "signature",
      format: "text",
      required: false,
    },
  ];
  envelope.sampleData = {
    recipient: {
      address: "Entreprise Exemple\n12 rue des Ateliers\n75002 Paris",
    },
    subject: "Votre compte rendu personnalisé",
    body: "Madame, Monsieur,\n\nVeuillez trouver notre compte rendu. Les caractères français et allemands sont conservés : é è ê ç œ — Ä Ö Ü ß — 125,00 €.\n\nCordialement,",
    signature: "L’équipe Exemple",
  };
  return validateTemplateEnvelope(envelope);
}
export function invoiceTemplate(): TemplateEnvelope {
  const envelope = base(
    "Facture de démonstration",
    "Exemple de lignes variables et total calculé en unités mineures entières. Aucune certification de conformité fiscale.",
  );
  envelope.definition.schemas[0] = [
    textBlock("title", "FACTURE · DÉMONSTRATION", 20, 27, 170, 13, 21),
    textBlock("customer", "Entreprise Exemple", 110, 47, 80, 20),
    textBlock("reference", "EX-001", 20, 49, 80),
    textBlock("date", "21/09/2026", 20, 63, 80),
    tableBlock("items", [
      "Description",
      "Quantité",
      "Prix unitaire",
      "Montant",
    ]),
    textBlock("total", "Total : 25,00 €", 110, 124, 80, 15, 14),
  ];
  envelope.inputSchema = {
    type: "object",
    properties: {
      customer: {
        type: "object",
        properties: { name: { type: "string", title: "Client" } },
        required: ["name"],
      },
      reference: { type: "string", title: "Référence" },
      date: { type: "string", title: "Date", format: "date" },
      items: {
        type: "array",
        title: "Lignes",
        maxItems: 500,
        items: {
          type: "object",
          properties: {
            description: {
              type: "string",
              title: "Description",
              maxLength: 1500,
            },
            quantity: { type: "integer", title: "Quantité" },
            unitPriceMinor: {
              type: "integer",
              title: "Prix unitaire (centimes)",
            },
          },
          required: ["description", "quantity", "unitPriceMinor"],
        },
      },
    },
    required: ["customer", "reference", "date", "items"],
  };
  envelope.bindings = [
    {
      block: "customer",
      kind: "value",
      path: "customer.name",
      format: "text",
      required: true,
    },
    {
      block: "reference",
      kind: "value",
      path: "reference",
      format: "text",
      prefix: "Référence : ",
      required: true,
    },
    {
      block: "date",
      kind: "value",
      path: "date",
      format: "date",
      required: true,
    },
    {
      block: "items",
      kind: "table",
      path: "items",
      format: "text",
      required: true,
      columns: [
        {
          title: "Description",
          path: "description",
          format: "text",
          required: true,
        },
        {
          title: "Quantité",
          path: "quantity",
          format: "integer",
          required: true,
        },
        {
          title: "Prix unitaire",
          path: "unitPriceMinor",
          format: "money",
          currency: "EUR",
          required: true,
        },
        {
          title: "Montant",
          path: "unitPriceMinor",
          multiplyBy: "quantity",
          format: "money",
          currency: "EUR",
          required: true,
        },
      ],
    },
    {
      block: "total",
      kind: "sum",
      path: "items",
      valuePath: "unitPriceMinor",
      multiplyBy: "quantity",
      format: "money",
      currency: "EUR",
      prefix: "Total : ",
      required: true,
    },
  ];
  envelope.sampleData = {
    customer: { name: "Entreprise Exemple — München" },
    reference: "EX-001",
    date: "2026-09-21",
    items: [
      {
        description: "Conseil et préparation documentaire",
        quantity: 2,
        unitPriceMinor: 1250,
      },
    ],
  };
  return validateTemplateEnvelope(envelope);
}
export function statementTemplate(): TemplateEnvelope {
  const envelope = base(
    "Relevé tabulaire",
    "Un tableau multipage avec des lignes regroupées par destinataire.",
  );
  envelope.definition.schemas[0] = [
    textBlock("title", "RELEVÉ D’ACTIVITÉ", 20, 28, 170, 13, 21),
    textBlock("customer", "Entreprise Exemple", 20, 49, 170, 12),
    tableBlock("entries", ["Date", "Description", "Statut"], 72),
  ];
  envelope.inputSchema = {
    type: "object",
    properties: {
      customer: { type: "string", title: "Client" },
      entries: {
        type: "array",
        title: "Lignes",
        items: {
          type: "object",
          properties: {
            date: { type: "string", format: "date" },
            description: { type: "string" },
            status: { type: "string" },
          },
          required: ["date", "description", "status"],
        },
      },
    },
    required: ["customer", "entries"],
  };
  envelope.bindings = [
    {
      block: "customer",
      kind: "value",
      path: "customer",
      format: "text",
      required: true,
    },
    {
      block: "entries",
      kind: "table",
      path: "entries",
      format: "text",
      required: true,
      columns: [
        { title: "Date", path: "date", format: "date", required: true },
        {
          title: "Description",
          path: "description",
          format: "text",
          required: true,
        },
        { title: "Statut", path: "status", format: "text", required: true },
      ],
    },
  ];
  envelope.sampleData = {
    customer: "Entreprise Exemple",
    entries: [
      {
        date: "2026-09-21",
        description: "Préparation du dossier",
        status: "Terminé",
      },
    ],
  };
  return validateTemplateEnvelope(envelope);
}
export function blankTemplate(): TemplateEnvelope {
  return validateTemplateEnvelope(base("Nouveau modèle", "Page vierge."));
}
export function templateGallery(): {
  id: string;
  envelope: TemplateEnvelope;
}[] {
  return [
    { id: "letter", envelope: letterTemplate() },
    { id: "invoice", envelope: invoiceTemplate() },
    { id: "statement", envelope: statementTemplate() },
  ];
}
