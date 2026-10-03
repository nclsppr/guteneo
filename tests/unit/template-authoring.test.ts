import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  PDFME_VERSION,
  TEMPLATE_GRAPHIC_PROPERTIES,
  TemplateBindingSchema,
  TemplateEnvelopeSchema,
  TemplatePatchSchema,
  prepareTemplateRender,
  validateTemplateEnvelope,
} from "../../packages/contracts/src/templates";
import {
  getTemplateExample,
  templateAuthoringGuide,
  templateExampleCatalog,
} from "../../packages/templates/authoring";

const ids = ["letter", "invoice", "statement", "quote", "delivery-note"];

describe("Executable template authoring reference", () => {
  it("publishes the live input schemas and graphic allowlist without sending authority", () => {
    const guide = templateAuthoringGuide();
    expect(guide.engineVersion).toBe(PDFME_VERSION);
    expect(guide.envelopeSchema).toEqual(
      z.toJSONSchema(TemplateEnvelopeSchema, { io: "input", reused: "ref" }),
    );
    expect(guide.bindingSchema).toEqual(
      z.toJSONSchema(TemplateBindingSchema, { io: "input", reused: "ref" }),
    );
    expect(guide.patchSchema).toEqual(
      z.toJSONSchema(TemplatePatchSchema, { io: "input", reused: "ref" }),
    );
    expect(guide.safeGraphicProperties).toEqual([
      ...TEMPLATE_GRAPHIC_PROPERTIES,
    ]);
    expect(guide.safeGraphicProperties).not.toContain("onClick");
    expect(guide.safeGraphicProperties).not.toContain("javascript");
    expect(guide.semanticRules.map((rule) => rule.id)).toEqual(
      expect.arrayContaining([
        "binding-paths",
        "resource-safety",
        "synthetic-samples",
        "validation-and-preview",
        "no-send-authority",
      ]),
    );
    expect(new Set(guide.semanticRules.map((rule) => rule.id)).size).toBe(
      guide.semanticRules.length,
    );
    const tools = guide.workflow.map((step) => step.tool);
    expect(tools).toContain("create_template");
    expect(tools.indexOf("preview_template")).toBeLessThan(
      tools.indexOf("publish_template"),
    );
    expect(tools.some((tool) => /approve|confirm|send|enable/.test(tool))).toBe(
      false,
    );
    expect(JSON.parse(JSON.stringify(guide))).toEqual(guide);
  });

  it("provides a usable minimal creation envelope and declares semantic checks beyond JSON Schema", () => {
    const guide = templateAuthoringGuide();
    const request = JSON.parse(
      JSON.stringify({ envelope: guide.minimalEnvelope }),
    );
    const envelope = validateTemplateEnvelope(request.envelope);
    expect(
      prepareTemplateRender(envelope, { personName: "Alex Exemple" }).inputs,
    ).toEqual([{ greeting: "Bonjour Alex Exemple" }]);
    expect(() => prepareTemplateRender(envelope, {})).toThrow("obligatoire");

    const undeclaredPath = structuredClone(envelope);
    undeclaredPath.bindings[0].path = "undeclaredName";
    expect(TemplateEnvelopeSchema.safeParse(undeclaredPath).success).toBe(true);
    expect(() => validateTemplateEnvelope(undeclaredPath)).toThrow();
    const unsafeProperty = structuredClone(envelope);
    unsafeProperty.definition.schemas[0][0].onClick = "run()";
    expect(() => validateTemplateEnvelope(unsafeProperty)).toThrow();
  });

  it("advertises exactly five synthetic examples with metadata matching executable definitions", () => {
    const catalog = templateExampleCatalog();
    expect(catalog.map((entry) => entry.id)).toEqual(ids);
    expect(templateAuthoringGuide().examples).toEqual(catalog);
    for (const entry of catalog) {
      const example = getTemplateExample(entry.id)!;
      expect(entry).toEqual({
        id: example.id,
        name: example.envelope.name,
        description: example.envelope.description,
        sampleDataSynthetic: true,
      });
      expect(entry).not.toHaveProperty("sampleData");
    }
  });

  it.each(ids)(
    "%s can be copied into a create request and prepared from its declared sample",
    (id) => {
      const example = getTemplateExample(id)!;
      const createRequest = JSON.parse(
        JSON.stringify({ envelope: example.envelope }),
      );
      const envelope = validateTemplateEnvelope(createRequest.envelope);
      const before = JSON.stringify(envelope);
      const prepared = prepareTemplateRender(envelope, envelope.sampleData);
      expect(prepared.inputs).toHaveLength(1);
      expect(Object.keys(prepared.inputs[0]).length).toBeGreaterThan(0);
      expect(envelope.sampleDataSynthetic).toBe(true);
      expect(envelope.resources).toEqual([]);
      expect(JSON.stringify(envelope)).toBe(before);

      const required = envelope.inputSchema.required?.[0];
      expect(required).toBeDefined();
      const incomplete = structuredClone(envelope.sampleData);
      delete incomplete[required!];
      expect(() => prepareTemplateRender(envelope, incomplete)).toThrow(
        "obligatoire",
      );
    },
  );

  it("returns independent deep copies so one author's changes cannot affect later readers", () => {
    const expectedGuide = templateAuthoringGuide();
    const changedGuide = templateAuthoringGuide();
    changedGuide.minimalEnvelope.sampleData.personName = "Changed";
    changedGuide.minimalEnvelope.definition.schemas[0][0].position.x = 123;
    changedGuide.safeGraphicProperties.pop();
    changedGuide.semanticRules[0].rule = "Changed";
    changedGuide.workflow[0].purpose = "Changed";
    changedGuide.examples[0].name = "Changed";
    expect(templateAuthoringGuide()).toEqual(expectedGuide);

    for (const id of ids) {
      const first = getTemplateExample(id)!;
      const original = structuredClone(first);
      first.envelope.name = "Changed";
      first.envelope.sampleData.injected = "Changed";
      first.envelope.definition.schemas[0][0].position.x = 123;
      first.envelope.bindings[0].path = "changed";
      expect(getTemplateExample(id)).toEqual(original);
    }
    const catalog = templateExampleCatalog();
    catalog[0].name = "Changed";
    expect(templateExampleCatalog()[0].name).not.toBe("Changed");
  });

  it("does not silently substitute a demo for unknown or prototype-shaped identifiers", () => {
    for (const id of [
      "",
      "unknown",
      "__proto__",
      "constructor",
      "../invoice",
      "INVOICE",
      "invoice ",
    ])
      expect(getTemplateExample(id), id).toBeUndefined();
  });

  it("keeps quote totals exact while the delivery note has quantities without prices", () => {
    const quote = getTemplateExample("quote")!.envelope;
    const proposal = prepareTemplateRender(quote, quote.sampleData).inputs[0];
    expect(proposal.total).toBe("Total proposé : 234,00 €");
    expect(proposal.validUntil).toContain("31/10/2026");
    const delivery = getTemplateExample("delivery-note")!.envelope;
    const receipt = prepareTemplateRender(delivery, delivery.sampleData)
      .inputs[0];
    expect(
      JSON.parse(receipt.items).map((row: string[]) => [row[0], row[2]]),
    ).toEqual([
      ["DOS-001", "12"],
      ["ENV-002", "12"],
    ]);
    expect(
      delivery.bindings.some(
        (binding) => binding.kind === "sum" || binding.format === "money",
      ),
    ).toBe(false);
    expect(Object.values(receipt).join(" ")).not.toContain("€");
  });
});
