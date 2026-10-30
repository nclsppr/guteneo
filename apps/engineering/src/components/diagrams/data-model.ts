/** Selected relationships verified against migrations 0001, 0008, 0024 and 0042. */
export const dataModelDiagram = {
  id: 'data-model',
  asset: 'data-model',
  title: 'Core records and tenant relationships',
  caption: 'Selected database relationships and columns. Crow’s-foot cardinalities describe the schema, not workflow permission. Solid links identify the child key; dotted links do not. The workspace is stored as an organization; current membership establishes tenant authority.',
  width: 1000,
  text: [
    'Organizations own document and dispatch records. A membership joins one user to one organization; the pair is the membership key. Tenant-aware domain lookups and composite relations keep records in the authenticated workspace.',
    'A dispatch may reference zero or one document. The unique organization/dispatch pair allows at most one current approval row, and dispatch uniqueness allows at most one reservation and outbox row. Approval is a separate record with kind, fingerprint and expiry, not a dispatch state.',
    'Attempts have a many-record relationship in the schema. That cardinality does not grant retry authority: the domain allows at most one automatic provider submission per business command, and unknown outcomes require reconciliation. This view omits other tables, columns and relationships, including Studio, billing, provider events and delegated-policy detail.',
  ],
};

export function dataModelMarkdown(): string {
  const diagram = dataModelDiagram;
  return `\n**Mermaid · ${diagram.title}**\n\n![${diagram.title}](/illustrations/data-model-mermaid.svg)\n\n${diagram.caption}\n\n${diagram.text.map((paragraph) => `- ${paragraph}`).join('\n')}\n\n[Open full-size SVG](/illustrations/data-model-mermaid.svg) · [Download SVG](/illustrations/data-model-mermaid.svg) · [Mermaid source](/illustrations/data-model.mmd)\n`;
}
