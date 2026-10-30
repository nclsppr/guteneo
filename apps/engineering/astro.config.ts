import {
  diagramMarkdown,
  type DiagramId,
} from "./src/components/diagrams/model";
import { dataModelMarkdown } from "./src/components/diagrams/data-model";
import { serviceReleaseMarkdown } from "./src/components/diagrams/service-release";
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import nimbus, {
  defineConfig as defineNimbusConfig,
} from "@cloudflare/nimbus-docs";
import { tableScroll } from "@cloudflare/nimbus-docs/markdown";

const nimbusConfig = defineNimbusConfig({
  site: "https://engineering.guteneo.com",
  title: "guteneo Engineering",
  description:
    "Understand Guteneo’s architecture, build a local environment, and work with its document and dispatch contracts.",
  locale: "en",
  search: { provider: "pagefind" },
  homeLabel: "Engineering",
  github: "https://github.com/nclsppr/guteneo",
  editPattern:
    "https://github.com/nclsppr/guteneo/edit/main/apps/engineering/{path}",
  socialImageAlt:
    "Guteneo engineering documentation on ivory paper with the official blue Gutenberg portrait.",
  sidebar: {
    items: [
      "index",
      {
        label: "Getting started",
        autogenerate: { directory: "getting-started" },
      },
      { label: "Architecture", autogenerate: { directory: "architecture" } },
      {
        label: "Administration",
        autogenerate: { directory: "administration" },
      },
      { label: "Workflows", autogenerate: { directory: "workflows" } },
      { label: "Integrations", autogenerate: { directory: "integrations" } },
      {
        label: "Engineering practice",
        autogenerate: { directory: "engineering" },
      },
      { label: "Feature reference", autogenerate: { directory: "features" } },
    ],
  },
});

export default defineConfig({
  output: "static",
  trailingSlash: "always",
  vite: { plugins: [tailwindcss()] },
  prefetch: { prefetchAll: true, defaultStrategy: "hover" },
  integrations: [
    nimbus(nimbusConfig, {
      rules: {
        "nimbus/frontmatter-shape": "error",
        "nimbus/internal-link": "error",
        "nimbus/single-h1": "error",
      },
      markdown: {
        componentMap: {
          ServiceRelease: {
            revision: "guteneo-service-release-diagram-v1",
            render: () => serviceReleaseMarkdown(),
          },
          DataModelDiagram: {
            revision: "guteneo-data-model-diagram-v1",
            render: () => dataModelMarkdown(),
          },
          MermaidDiagram: {
            revision: "guteneo-mermaid-diagram-v1",
            render: ({ attrs }) =>
              diagramMarkdown((attrs.diagram ?? "system") as DiagramId, true),
          },
          SystemArchitecture: {
            revision: "guteneo-system-diagram-v1",
            render: () => diagramMarkdown("system"),
          },
          DispatchLifecycle: {
            revision: "guteneo-dispatch-diagram-v1",
            render: () => diagramMarkdown("dispatch"),
          },
          DocumentPipeline: {
            revision: "guteneo-document-diagram-v1",
            render: () => diagramMarkdown("documents"),
          },
          GutenbergNote: {
            revision: "guteneo-gutenberg-note-v1",
            render: ({ attrs, children }) => {
              const title =
                typeof attrs.title === "string"
                  ? attrs.title
                  : "A note from Gutenberg";
              return [
                `> **${title}**`,
                ">",
                ...children
                  .trim()
                  .split("\n")
                  .map((line) => `> ${line}`),
              ].join("\n");
            },
          },
        },
        hastPlugins: [tableScroll()],
        features: { headingAttributes: true },
      },
    }),
  ],
});
