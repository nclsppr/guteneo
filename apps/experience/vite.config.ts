import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { readFile, readdir } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import brandIconsCatalog from "../../packages/contracts/src/brand-icons.json";
import { experienceApiOrigin, experienceHeaders } from "./build/headers";

const repository = fileURLToPath(new URL("../..", import.meta.url));
const brandIconFiles: string[] = brandIconsCatalog.files;
const productPublic = fileURLToPath(new URL("../web/public/", import.meta.url));

/**
 * The browser icon family is owned by the product site. Serve and emit those
 * exact bytes instead of keeping a second copy that could drift.
 */
function brandIcons(): Plugin {
  const names = new Set(brandIconFiles.map((name) => `/${name}`));
  const types: Record<string, string> = {
    svg: "image/svg+xml",
    ico: "image/x-icon",
    png: "image/png",
  };
  return {
    name: "guteneo-experience-brand-icons",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const path = (request.url ?? "").split("?")[0];
        if (!names.has(path)) return next();
        response.setHeader(
          "Content-Type",
          types[path.split(".").at(-1) ?? ""] ?? "application/octet-stream",
        );
        response.end(await readFile(`${productPublic}${path.slice(1)}`));
      });
    },
    async generateBundle() {
      for (const name of brandIconFiles)
        this.emitFile({
          type: "asset",
          fileName: name,
          source: await readFile(`${productPublic}${name}`),
        });
    },
  };
}

const messagesPath = `${realpathSync(fileURLToPath(new URL("./src/locales/", import.meta.url)))}/`;
const LOCALE_MODULE = "virtual:experience-locale/";

/**
 * Interface copy is authored once, with its four languages side by side, in
 * `src/locales/*.json`. Each language becomes its own module here, so
 * a reader downloads one language and the catalogs cannot drift apart.
 */
function localeCatalogs(): Plugin {
  return {
    name: "guteneo-experience-locales",
    configureServer(server) {
      const changed = (file: string) => {
        if (!file.startsWith(messagesPath) || !file.endsWith(".json")) return;
        for (const [id, module] of server.moduleGraph.idToModuleMap) {
          if (id.startsWith(`\0${LOCALE_MODULE}`))
            server.moduleGraph.invalidateModule(module);
        }
        server.ws.send({ type: "full-reload" });
      };
      server.watcher.on("add", changed);
      server.watcher.on("change", changed);
      server.watcher.on("unlink", changed);
    },
    resolveId(id) {
      return id.startsWith(LOCALE_MODULE) ? `\0${id}` : null;
    },
    async load(id) {
      if (!id.startsWith(`\0${LOCALE_MODULE}`)) return null;
      const locale = id.slice(LOCALE_MODULE.length + 1);
      const messages: Record<string, Record<string, string>> = {};
      for (const filename of (await readdir(messagesPath))
        .filter((file) => file.endsWith(".json"))
        .sort()) {
        const path = `${messagesPath}${filename}`;
        this.addWatchFile(path);
        const fragment = JSON.parse(await readFile(path, "utf8")) as Record<
          string,
          Record<string, string>
        >;
        for (const [key, value] of Object.entries(fragment)) {
          if (messages[key])
            throw new Error(`Duplicate experience translation: ${key}`);
          messages[key] = value;
        }
      }
      const catalog: Record<string, string> = {};
      for (const [key, translations] of Object.entries(messages)) {
        const text = translations[locale];
        if (typeof text !== "string" || !text)
          throw new Error(`Missing ${locale} translation for "${key}"`);
        catalog[key] = text;
      }
      return `export default ${JSON.stringify(catalog)};`;
    },
    handleHotUpdate(context) {
      if (
        !context.file.startsWith(messagesPath) ||
        !context.file.endsWith(".json")
      )
        return;
      for (const [id, module] of context.server.moduleGraph.idToModuleMap) {
        if (id.startsWith(`\0${LOCALE_MODULE}`))
          context.server.moduleGraph.invalidateModule(module);
      }
      context.server.ws.send({ type: "full-reload" });
      return [];
    },
  };
}

/** Static response headers are generated with the configured API origin. */
function staticHeaders(apiOrigin: string): Plugin {
  return {
    name: "guteneo-experience-headers",
    apply: "build",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "_headers",
        source: experienceHeaders(apiOrigin),
      });
    },
  };
}

export default defineConfig(({ command }) => {
  const apiOrigin = experienceApiOrigin(
    process.env.GUTENEO_API_ORIGIN,
    command === "serve" ? "http://localhost:8787" : "https://guteneo.com",
  );
  return {
    root: fileURLToPath(new URL(".", import.meta.url)),
    plugins: [
      localeCatalogs(),
      brandIcons(),
      staticHeaders(apiOrigin),
      react(),
    ],
    define: {
      __GUTENEO_API_ORIGIN__: JSON.stringify(apiOrigin),
    },
    build: {
      outDir: "../../dist/experience",
      emptyOutDir: true,
      // Never ship source text of the application to visitors.
      sourcemap: false,
    },
    server: {
      host: "localhost",
      port: 8850,
      strictPort: true,
      // Brand assets and shared contracts live outside this application root.
      fs: { allow: [repository] },
    },
    preview: { host: "localhost", port: 8850, strictPort: true },
  };
});
