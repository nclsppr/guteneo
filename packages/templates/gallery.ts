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
    fontColor: "#182338",
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
    fontColor: "#182338",
    borderColor: "#D5D9DE",
    backgroundColor: "",
  };
  return {
    name,
    type: "table",
    content: JSON.stringify([headers.map(() => "Example")]),
    position: { x: 20, y },
    width: 170,
    height: 22,
    showHead: true,
    repeatHead: true,
    head: headers,
    headWidthPercentages: headers.map(() => 100 / headers.length),
    tableStyles: { borderWidth: 0, borderColor: "#D5D9DE" },
    headStyles: { ...style, fontColor: "#FFFFFF", backgroundColor: "#234CE0" },
    bodyStyles: { ...style, alternateBackgroundColor: "#F7F5EF" },
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
    locale: "en-GB",
    definition: {
      basePdf: {
        width: 210,
        height: 297,
        padding: [22, 20, 20, 20],
        staticSchema: [
          textBlock("header", "EXAMPLE COMPANY", 20, 10, 170, 6, 8),
          textBlock(
            "footer",
            "Fictional data · Page {currentPage} / {totalPages}",
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
    "Business letter",
    "A customisable letter with address, subject and paragraphs. Examples are fictional.",
  );
  envelope.definition.schemas[0] = [
    textBlock(
      "recipient",
      "Example Company\n12 rue des Ateliers\n75002 Paris",
      112,
      35,
      78,
      25,
    ),
    textBlock("reference", "Letter subject", 20, 76, 170, 12, 16),
    textBlock(
      "body",
      "Dear Sir or Madam,\n\nYour personalised letter starts here.\n\nKind regards,",
      20,
      96,
      170,
      60,
    ),
    textBlock("signature", "The Example team", 20, 165, 170, 15),
  ];
  envelope.inputSchema = {
    type: "object",
    properties: {
      recipient: {
        type: "object",
        properties: {
          address: {
            type: "string",
            title: "Name and address",
            maxLength: 600,
          },
        },
        required: ["address"],
      },
      subject: { type: "string", title: "Subject", maxLength: 300 },
      body: { type: "string", title: "Letter body" },
      signature: {
        type: "string",
        title: "Signature",
        default: "The Example team",
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
      address: "Example Company\n12 rue des Ateliers\n75002 Paris",
    },
    subject: "Your personalised report",
    body: "Dear Sir or Madam,\n\nPlease find our report. French and German characters are preserved: é è ê ç œ — Ä Ö Ü ß — €125.00.\n\nKind regards,",
    signature: "The Example team",
  };
  return validateTemplateEnvelope(envelope);
}
export function invoiceTemplate(): TemplateEnvelope {
  const envelope = base(
    "Demo invoice",
    "An example with variable line items and a total calculated in integer minor units. No certification of tax compliance.",
  );
  envelope.definition.schemas[0] = [
    textBlock("title", "INVOICE · DEMONSTRATION", 20, 27, 170, 13, 21),
    textBlock("customer", "Example Company", 110, 47, 80, 20),
    textBlock("reference", "EX-001", 20, 49, 80),
    textBlock("date", "21/09/2026", 20, 63, 80),
    tableBlock("items", ["Description", "Quantity", "Unit price", "Amount"]),
    textBlock("total", "Total: 25.00 €", 110, 124, 80, 15, 14),
  ];
  envelope.inputSchema = {
    type: "object",
    properties: {
      customer: {
        type: "object",
        properties: { name: { type: "string", title: "Customer" } },
        required: ["name"],
      },
      reference: { type: "string", title: "Reference" },
      date: { type: "string", title: "Date", format: "date" },
      items: {
        type: "array",
        title: "Rows",
        maxItems: 500,
        items: {
          type: "object",
          properties: {
            description: {
              type: "string",
              title: "Description",
              maxLength: 1500,
            },
            quantity: { type: "integer", title: "Quantity" },
            unitPriceMinor: {
              type: "integer",
              title: "Unit price (minor units)",
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
      prefix: "Reference: ",
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
          title: "Quantity",
          path: "quantity",
          format: "integer",
          required: true,
        },
        {
          title: "Unit price",
          path: "unitPriceMinor",
          format: "money",
          currency: "EUR",
          required: true,
        },
        {
          title: "Amount",
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
      prefix: "Total: ",
      required: true,
    },
  ];
  envelope.sampleData = {
    customer: { name: "Example Company — München" },
    reference: "EX-001",
    date: "2026-09-21",
    items: [
      {
        description: "Consulting and document preparation",
        quantity: 2,
        unitPriceMinor: 1250,
      },
    ],
  };
  return validateTemplateEnvelope(envelope);
}
export function statementTemplate(): TemplateEnvelope {
  const envelope = base(
    "Tabular statement",
    "A multipage table with rows grouped by recipient.",
  );
  envelope.definition.schemas[0] = [
    textBlock("title", "ACTIVITY STATEMENT", 20, 28, 170, 13, 21),
    textBlock("customer", "Example Company", 20, 49, 170, 12),
    tableBlock("entries", ["Date", "Description", "Status"], 72),
  ];
  envelope.inputSchema = {
    type: "object",
    properties: {
      customer: { type: "string", title: "Customer" },
      entries: {
        type: "array",
        title: "Rows",
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
        { title: "Status", path: "status", format: "text", required: true },
      ],
    },
  ];
  envelope.sampleData = {
    customer: "Example Company",
    entries: [
      {
        date: "2026-09-21",
        description: "Case preparation",
        status: "Completed",
      },
    ],
  };
  return validateTemplateEnvelope(envelope);
}
export function blankTemplate(): TemplateEnvelope {
  return validateTemplateEnvelope(base("New template", "Blank page."));
}

export function quoteTemplate(): TemplateEnvelope {
  const envelope = invoiceTemplate();
  envelope.name = "Demo quotation";
  envelope.description =
    "A quotation with services, quantities, a total and an expiry date. Fictional data to adapt before use.";
  const blocks = envelope.definition.schemas[0];
  blocks.find((block) => block.name === "title")!.content =
    "QUOTE · DEMONSTRATION";
  blocks.find((block) => block.name === "date")!.position.y = 63;
  blocks.push(textBlock("validUntil", "Quote validity", 20, 76, 170, 8, 10));
  envelope.inputSchema.properties!.validUntil = {
    type: "string",
    title: "Valid until",
    format: "date",
  };
  envelope.inputSchema.required!.push("validUntil");
  envelope.bindings.push({
    block: "validUntil",
    kind: "value",
    path: "validUntil",
    format: "date",
    prefix: "Valid until: ",
    required: true,
  });
  envelope.bindings.find((binding) => binding.block === "date")!.prefix =
    "Issued on: ";
  envelope.bindings.find((binding) => binding.block === "total")!.prefix =
    "Proposed total: ";
  envelope.sampleData = {
    customer: { name: "Example Workshop — Luxembourg" },
    reference: "QUOTE-DEMO-001",
    date: "2026-10-02",
    validUntil: "2026-10-31",
    items: [
      {
        description: "Case design",
        quantity: 1,
        unitPriceMinor: 18000,
      },
      {
        description: "Copy preparation",
        quantity: 12,
        unitPriceMinor: 450,
      },
    ],
  };
  return validateTemplateEnvelope(envelope);
}

export function deliveryNoteTemplate(): TemplateEnvelope {
  const envelope = base(
    "Demo delivery note",
    "A recipient, a reference and the delivered items, without prices. All contact details are fictional.",
  );
  envelope.definition.schemas[0] = [
    textBlock("title", "DELIVERY NOTE", 20, 27, 170, 13, 21),
    textBlock("recipient", "Demo recipient", 110, 47, 80, 28),
    textBlock("reference", "DELIVERY-DEMO-001", 20, 49, 80),
    textBlock("date", "02/10/2026", 20, 63, 80),
    tableBlock("items", ["Item reference", "Description", "Quantity"], 92),
    textBlock("notes", "Delivery notes", 20, 128, 170, 22, 10),
  ];
  envelope.inputSchema = {
    type: "object",
    properties: {
      recipient: {
        type: "object",
        properties: {
          address: {
            type: "string",
            title: "Name and address",
            maxLength: 600,
          },
        },
        required: ["address"],
      },
      reference: { type: "string", title: "Delivery reference" },
      date: { type: "string", title: "Delivery date", format: "date" },
      items: {
        type: "array",
        title: "Delivered items",
        maxItems: 500,
        items: {
          type: "object",
          properties: {
            sku: { type: "string", title: "Item reference" },
            description: {
              type: "string",
              title: "Description",
              maxLength: 1500,
            },
            quantity: { type: "integer", title: "Delivered quantity" },
          },
          required: ["sku", "description", "quantity"],
        },
      },
      notes: {
        type: "string",
        title: "Notes",
        default: "Demo delivery, without actual dispatch.",
      },
    },
    required: ["recipient", "reference", "date", "items"],
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
      path: "reference",
      format: "text",
      prefix: "Reference: ",
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
          title: "Item reference",
          path: "sku",
          format: "text",
          required: true,
        },
        {
          title: "Description",
          path: "description",
          format: "text",
          required: true,
        },
        {
          title: "Quantity",
          path: "quantity",
          format: "integer",
          required: true,
        },
      ],
    },
    {
      block: "notes",
      kind: "value",
      path: "notes",
      format: "text",
      prefix: "Notes: ",
      required: false,
    },
  ];
  envelope.sampleData = {
    recipient: {
      address: "Example Workshop\n12 rue des Ateliers\n75002 Paris",
    },
    reference: "DELIVERY-DEMO-001",
    date: "2026-10-02",
    items: [
      { sku: "FOLDER-001", description: "Presentation folder", quantity: 12 },
      {
        sku: "ENVELOPE-002",
        description: "Demo envelope",
        quantity: 12,
      },
    ],
    notes: "Fictional example: check quantities before use.",
  };
  return validateTemplateEnvelope(envelope);
}

export function templateGallery(): {
  id: string;
  envelope: TemplateEnvelope;
}[] {
  return [
    { id: "letter", envelope: letterTemplate() },
    { id: "invoice", envelope: invoiceTemplate() },
    { id: "statement", envelope: statementTemplate() },
    { id: "quote", envelope: quoteTemplate() },
    { id: "delivery-note", envelope: deliveryNoteTemplate() },
  ];
}
