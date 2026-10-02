import { describe, expect, it } from "vitest";
import {
  blankTemplate,
  letterTemplate,
  textBlock,
} from "../../packages/templates/gallery";
import {
  normalizeDesignerDefinition,
  reconcileDesignerChange,
} from "../../packages/templates/designer";
import { validateTemplateEnvelope } from "../../packages/contracts/src/templates";

describe("Native Designer and business envelope reconciliation", () => {
  it("normalizes copied and accented labels without stealing valid existing identifiers", () => {
    const definition = blankTemplate().definition;
    definition.schemas = [
      [
        "Référence client",
        "reference_copy",
        "reference copy",
        "constructor",
        "123",
        "a".repeat(80),
      ].map((name, index) =>
        textBlock(name, "Texte", 20, 30 + index * 20, 170),
      ),
    ];
    const normalized = normalizeDesignerDefinition(definition);
    expect(normalized.schemas[0].map((block) => block.name)).toEqual([
      "Reference_client",
      "reference_copy",
      "reference_copy_2",
      "block_constructor",
      "block_123",
      "a".repeat(64),
    ]);
    expect(normalizeDesignerDefinition(normalized)).toEqual(normalized);
    expect(definition.schemas[0][0].name).toBe("Référence client");
  });

  it("preserves formatting edits and reconciles exact renames without changing business field paths", () => {
    const previous = letterTemplate(),
      definition = structuredClone(previous.definition);
    const recipient = definition.schemas[0].find(
      (block) => block.name === "recipient",
    )!;
    recipient.fontSize = 14;
    const reference = definition.schemas[0].find(
      (block) => block.name === "reference",
    )!;
    reference.name = "Objet du courrier";
    const result = reconcileDesignerChange(previous, definition);
    expect(result.inputSchema).toEqual(previous.inputSchema);
    expect(result.sampleData).toEqual(previous.sampleData);
    expect(result.bindings).toEqual(
      previous.bindings.map((binding) =>
        binding.block === "reference"
          ? { ...binding, block: "Objet_du_courrier" }
          : binding,
      ),
    );
    expect(() => validateTemplateEnvelope(result)).not.toThrow();
    expect(
      previous.definition.schemas[0].some(
        (block) => block.name === "reference",
      ),
    ).toBe(true);
  });

  it("duplicates the explicit binding for an exact native copy with the engine's clamped translation", () => {
    const previous = letterTemplate(),
      definition = structuredClone(previous.definition);
    const source = definition.schemas[0].find(
      (block) => block.name === "reference",
    )!;
    definition.schemas[0].push({
      ...structuredClone(source),
      name: "reference copy",
      position: {
        x: Math.min(
          source.position.x + 10,
          definition.basePdf.width - source.width,
        ),
        y: Math.min(
          source.position.y + 10,
          definition.basePdf.height - source.height,
        ),
      },
    });
    const result = reconcileDesignerChange(previous, definition);
    const sourceBinding = previous.bindings.find(
      (binding) => binding.block === "reference",
    )!;
    expect(result.bindings).toContainEqual(sourceBinding);
    expect(result.bindings).toContainEqual({
      ...sourceBinding,
      block: "reference_copy",
    });
    expect(result.bindings).toHaveLength(previous.bindings.length + 1);
  });

  it("removes a deleted block binding and refuses to guess a simultaneous rename and content change", () => {
    const previous = letterTemplate(),
      deletion = structuredClone(previous.definition);
    deletion.schemas[0] = deletion.schemas[0].filter(
      (block) => block.name !== "reference",
    );
    expect(reconcileDesignerChange(previous, deletion).bindings).toEqual(
      previous.bindings.filter((binding) => binding.block !== "reference"),
    );
    const ambiguous = structuredClone(previous.definition);
    const changed = ambiguous.schemas[0].find(
      (block) => block.name === "reference",
    )!;
    changed.name = "nouveau";
    changed.content = "Un contenu nouveau";
    expect(() => reconcileDesignerChange(previous, ambiguous)).toThrow(
      "liaison métier",
    );
  });

  it("preserves a known unchanged match before resolving an otherwise identical renamed block", () => {
    const previous = letterTemplate();
    const reference = previous.definition.schemas[0].find(
      (block) => block.name === "reference",
    )!;
    previous.definition.schemas[0].push({
      ...structuredClone(reference),
      name: "second_reference",
    });
    const originalBinding = previous.bindings.find(
      (binding) => binding.block === "reference",
    )!;
    previous.bindings.push({
      ...originalBinding,
      block: "second_reference",
      path: "signature",
    });
    const definition = structuredClone(previous.definition);
    definition.schemas[0].find(
      (block) => block.name === "second_reference",
    )!.name = "Renommé";
    const result = reconcileDesignerChange(previous, definition);
    expect(result.bindings).toContainEqual(originalBinding);
    expect(result.bindings).toContainEqual({
      ...originalBinding,
      block: "Renomme",
      path: "signature",
    });
    definition.schemas[0].find((block) => block.name === "reference")!.name =
      "Autre nom";
    expect(() => reconcileDesignerChange(previous, definition)).toThrow(
      "ambigu",
    );
  });
});
