import {
  TEMPLATE_LIMITS,
  TemplateError,
  type GraphicBlock,
  type TemplateEnvelope,
} from "../contracts/src/templates";

type Definition = TemplateEnvelope["definition"];
const forbidden = new Set(["__proto__", "prototype", "constructor"]);
const safeName = (name: string) =>
  /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(name) && !forbidden.has(name);
const blocks = (definition: Definition) => [
  ...definition.schemas.flat(),
  ...(definition.basePdf.staticSchema ?? []),
];

/** Canonical object order makes schema identity independent of JSON key order. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, item]) => `${JSON.stringify(name)}:${canonical(item)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
function shape(block: GraphicBlock, ignorePosition = false) {
  const { name: _name, id: _id, ...rest } = block;
  if (ignorePosition) delete (rest as Partial<GraphicBlock>).position;
  return canonical(rest);
}
function normalizeName(name: string): string {
  let result = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!/^[A-Za-z]/.test(result)) result = `block_${result}`;
  if (forbidden.has(result)) result = `block_${result}`;
  return (result || "block").slice(0, 64);
}

/** Native names are presentation labels; persisted block identifiers stay safe.
 * Already valid unique names are reserved first, so a copied label cannot steal
 * another block's identifier. Business field paths are never renamed here. */
export function normalizeDesignerDefinition(raw: Definition): Definition {
  const definition = structuredClone(raw),
    all = blocks(definition);
  if (all.length > TEMPLATE_LIMITS.blocks)
    throw new TemplateError(
      "TEMPLATE_BLOCK_LIMIT",
      "Le modèle dépasse 100 blocs.",
    );
  const reserved = new Set(all.map((block) => block.name).filter(safeName));
  const used = new Set<string>();
  for (const block of all) {
    if (safeName(block.name) && !used.has(block.name)) {
      used.add(block.name);
      continue;
    }
    const stem = normalizeName(block.name);
    let candidate = stem,
      suffix = 1;
    while (reserved.has(candidate) || used.has(candidate)) {
      const tail = `_${++suffix}`;
      candidate = stem.slice(0, 64 - tail.length) + tail;
    }
    block.name = candidate;
    used.add(candidate);
  }
  return definition;
}

/** Match the native pdfme copy command only when both its label and exact
 * clamped 10 mm translation agree. Arbitrarily moved similar blocks do not
 * inherit customer bindings through a heuristic. */
function isNativeCopy(
  next: GraphicBlock,
  old: GraphicBlock,
  base: Definition["basePdf"],
) {
  const suffix = next.name.slice(old.name.length);
  return (
    next.name.startsWith(old.name) &&
    /^ copy(?: [0-9]+)?$/.test(suffix) &&
    shape(next, true) === shape(old, true) &&
    next.position.x === Math.min(old.position.x + 10, base.width - old.width) &&
    next.position.y === Math.min(old.position.y + 10, base.height - old.height)
  );
}

/** Reconcile one native Designer event with the whole business envelope.
 * Existing names survive formatting, an exact rename moves its binding, and an
 * identified copy duplicates that binding. Ambiguous rename events fail closed;
 * deletion removes only bindings whose blocks were explicitly removed. */
export function reconcileDesignerChange(
  previous: TemplateEnvelope,
  raw: Definition,
): TemplateEnvelope {
  const definition = normalizeDesignerDefinition(raw);
  const oldBlocks = blocks(previous.definition),
    incoming = blocks(raw),
    normalized = blocks(definition);
  const byName = new Map(oldBlocks.map((block) => [block.name, block]));
  const claimed = new Set<string>();
  const matches = new Map<number, GraphicBlock>();
  // First preserve explicit identity, regardless of native graphical edits.
  incoming.forEach((block, index) => {
    const old = byName.get(block.name);
    if (old && !claimed.has(old.name)) {
      matches.set(index, old);
      claimed.add(old.name);
    }
  });
  const unresolved: number[] = [];
  incoming.forEach((block, index) => {
    if (matches.has(index)) return;
    const exact = oldBlocks.filter((old) => shape(old) === shape(block));
    const unclaimed = exact.filter((old) => !claimed.has(old.name));
    const candidates = unclaimed.length
      ? unclaimed
      : exact.length
        ? exact
        : oldBlocks.filter((old) =>
            isNativeCopy(block, old, definition.basePdf),
          );
    if (candidates.length > 1) {
      throw new TemplateError(
        "TEMPLATE_BINDING_AMBIGUOUS",
        "Plusieurs blocs identiques rendent ce renommage ambigu. Annulez puis renommez un seul bloc à la fois.",
      );
    }
    if (candidates[0]) {
      matches.set(index, candidates[0]);
      claimed.add(candidates[0].name);
    } else unresolved.push(index);
  });
  if (
    unresolved.length &&
    previous.bindings.some((binding) => !claimed.has(binding.block))
  )
    throw new TemplateError(
      "TEMPLATE_BINDING_RENAME_UNRESOLVED",
      "Une liaison métier ne peut pas être réconciliée. Annulez puis renommez le bloc avant de modifier son contenu ou sa position.",
    );
  return {
    ...previous,
    definition,
    bindings: previous.bindings.flatMap((binding) =>
      [...matches.entries()]
        .filter(([, old]) => old.name === binding.block)
        .map(([index]) => ({
          ...structuredClone(binding),
          block: normalized[index].name,
        })),
    ),
  };
}
