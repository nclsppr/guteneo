import {
  registerAppResource,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import type { McpServer } from "@modelcontextprotocol/server";
import { AuthError, type AuthEnv } from "./auth";
import { readLimited } from "./documents";

export type PinnedMcpAppManifest = {
  path: string;
  bytes: number;
  sha256: string;
  resourceUri: string;
};

/** Fixed binding reads share the integrity, cancellation and authority boundary. */
export function registerPinnedMcpAppResource(
  server: McpServer,
  env: AuthEnv,
  manifest: PinnedMcpAppManifest,
  options: {
    title: string;
    code: string;
    message: string;
    assertCurrent: () => Promise<void>;
    assets?: Pick<Fetcher, "fetch">;
  },
): void {
  const metadata = {
    ui: {
      prefersBorder: true,
      csp: { connectDomains: [], resourceDomains: [], frameDomains: [] },
    },
  };
  const unavailable = () => new AuthError(options.code, options.message, 503);
  registerAppResource(
    server,
    options.title,
    manifest.resourceUri,
    { _meta: metadata },
    async () => {
      await options.assertCurrent();
      if (!options.assets) throw unavailable();
      const controller = new AbortController();
      let rejectDeadline: () => void = () => {};
      const expired = new Promise<never>((_resolve, reject) => {
        rejectDeadline = () => reject(unavailable());
      });
      const timeout = setTimeout(() => {
        controller.abort();
        rejectDeadline();
      }, 5000);
      let response: Response | undefined;
      try {
        response = await Promise.race([
          options.assets
            .fetch(
              new Request(new URL(manifest.path, env.APP_ORIGIN), {
                signal: controller.signal,
              }),
            )
            .then((loaded) => {
              if (controller.signal.aborted) {
                void loaded.body?.cancel().catch(() => {});
                throw unavailable();
              }
              return loaded;
            }),
          expired,
        ]);
        if (
          !response.ok ||
          response.headers
            .get("Content-Type")
            ?.split(";")[0]
            .trim()
            .toLowerCase() !== "text/plain"
        )
          throw unavailable();
        const bytes = await readLimited(
          response,
          Math.min(manifest.bytes, 700_000),
          controller.signal,
        );
        const digest = Array.from(
          new Uint8Array(
            await crypto.subtle.digest(
              "SHA-256",
              bytes as Uint8Array<ArrayBuffer>,
            ),
          ),
          (byte) => byte.toString(16).padStart(2, "0"),
        ).join("");
        if (bytes.length !== manifest.bytes || digest !== manifest.sha256)
          throw unavailable();
        const html = new TextDecoder().decode(bytes);
        await options.assertCurrent();
        return {
          contents: [
            {
              uri: manifest.resourceUri,
              mimeType: RESOURCE_MIME_TYPE,
              text: html,
              _meta: metadata,
            },
          ],
        };
      } catch (error) {
        controller.abort();
        void response?.body?.cancel().catch(() => {});
        throw error instanceof AuthError ? error : unavailable();
      } finally {
        clearTimeout(timeout);
      }
    },
  );
}
