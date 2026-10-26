import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { buildMcpUiProbeResource } from "../../scripts/build-mcp-ui-probe.mjs";
import { buildMcpDocumentUploadResource } from "../../scripts/build-mcp-document-upload.mjs";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [
    {
      name: "guteneo-mcp-app-resources-check",
      apply: "build",
      async generateBundle() {
        for (const buildResource of [
          buildMcpUiProbeResource,
          buildMcpDocumentUploadResource,
        ]) {
          const { text, manifest } = await buildResource({ check: true });
          this.emitFile({
            type: "asset",
            fileName: manifest.path.slice(1),
            source: text,
          });
        }
      },
    },
    react(),
  ],
  build: { outDir: "../../dist/web", emptyOutDir: true },
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:8787",
      "/oauth": "http://127.0.0.1:8787",
      "/mcp": "http://127.0.0.1:8787",
    },
  },
});
