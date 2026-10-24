/** Release gates verified against MAIN_RELEASE, provider adapters and deploy guards. */
export const serviceReleaseDiagram = {
  id: "service-release",
  asset: "service-release",
  title: "Source, service and provider qualification",
  caption:
    "A dependency map of separate gates, not an automatic deployment workflow. Each operation uses its applicable dependencies; the optional PDF validator is not required for every dispatch. CI success, hosted-service qualification, provider readiness and authority for one exact communication are distinct evidence.",
  width: 1100,
  text: [
    "Required CI checks the exact reviewed source. An authorized merge and clean main matching a fresh origin/main precede the application build, fingerprint, separately authorized release and canonical asset/browser checks.",
    "Private service releases require their own source and runtime qualification: scanner freshness and exact bytes, isolated renderer outputs and validator profiles/reports. External Telnyx, Pingen and Resend/SES provider readiness is a separate boundary; provider systems do not run inside the Cloudflare private services.",
    "Current capability gates do not approve a dispatch. The current actor, immutable approval, credit and quota must still permit the exact operation before atomic acceptance and durable outbox insertion. Nothing in this diagram authorizes activation, a real send, or automatic retry after an unknown provider outcome.",
  ],
};

export function serviceReleaseMarkdown(): string {
  const diagram = serviceReleaseDiagram;
  return `\n**Mermaid · ${diagram.title}**\n\n![${diagram.title}](/illustrations/service-release-mermaid.svg)\n\n${diagram.caption}\n\n${diagram.text.map((paragraph) => `- ${paragraph}`).join("\n")}\n\n[Open full-size SVG](/illustrations/service-release-mermaid.svg) · [Download SVG](/illustrations/service-release-mermaid.svg) · [Mermaid source](/illustrations/service-release.mmd)\n`;
}
