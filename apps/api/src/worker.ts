import { WorkerEntrypoint } from "cloudflare:workers";
import { inspectTelnyxReadiness } from "../../../packages/providers/telnyx-readiness";
import {
  inspectPingenReadiness,
  inspectPingenUploadOrigin,
} from "../../../packages/providers/pingen-readiness";
import type { Env } from "./env";
import { inspectSesPrincipal } from "./provider-principal";
import { qualifyPingenSynthetic } from "../../../packages/providers/pingen-qualification";
import { configurePingenWebhooks } from "../../../packages/providers/pingen-webhook-setup";

import application from "./index";
import { servePublicAssets } from "./public-assets";

export default {
  ...application,
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const asset = await servePublicAssets(request, env);
    return asset ?? application.fetch(request, env, ctx);
  },
};

/** Available only through an authenticated same-account service binding. */
export class ProviderInspection extends WorkerEntrypoint<Env> {
  /** Fixed callback registration, private operator capability only. */
  async configurePingenWebhooks(input: unknown) {
    return configurePingenWebhooks(
      {
        clientId: this.env.PINGEN_CLIENT_ID || "",
        clientSecret: this.env.PINGEN_CLIENT_SECRET || "",
        organisationId: this.env.PINGEN_ORGANIZATION_ID || "",
        environment: this.env.ENVIRONMENT,
        mode: this.env.MODE,
        sandbox: this.env.PINGEN_SANDBOX || "",
        liveSendsEnabled: this.env.LIVE_SENDS_ENABLED || "",
        webhookSecret: this.env.PINGEN_WEBHOOK_SECRET || "",
      },
      this.env.DOCUMENTS,
      input,
    );
  }

  /** Temporary, fixed synthetic run. No public HTTP, arbitrary PDF or app approval. */
  async qualifyPingenSynthetic(input: unknown) {
    return qualifyPingenSynthetic(
      {
        clientId: this.env.PINGEN_CLIENT_ID || "",
        clientSecret: this.env.PINGEN_CLIENT_SECRET || "",
        organisationId: this.env.PINGEN_ORGANIZATION_ID || "",
        environment: this.env.ENVIRONMENT,
        mode: this.env.MODE,
        sandbox: this.env.PINGEN_SANDBOX || "",
        liveSendsEnabled: this.env.LIVE_SENDS_ENABLED || "",
        uploadOrigins: this.env.PINGEN_UPLOAD_ORIGINS || "",
      },
      this.env.DOCUMENTS,
      input,
    );
  }

  async inspectTelnyx() {
    return inspectTelnyxReadiness({
      apiKey: this.env.TELNYX_API_KEY || "",
      connectionId: this.env.TELNYX_CONNECTION_ID || "",
    });
  }

  async inspectSes() {
    return inspectSesPrincipal(this.env);
  }

  async inspectPingen() {
    return inspectPingenReadiness({
      clientId: this.env.PINGEN_CLIENT_ID || "",
      clientSecret: this.env.PINGEN_CLIENT_SECRET || "",
      organisationId: this.env.PINGEN_ORGANIZATION_ID || "",
      // The private read defaults to the production account, without configuring sends.
      sandbox: this.env.PINGEN_SANDBOX === "true",
    });
  }

  async inspectPingenUploadOrigin() {
    return inspectPingenUploadOrigin({
      clientId: this.env.PINGEN_CLIENT_ID || "",
      clientSecret: this.env.PINGEN_CLIENT_SECRET || "",
      sandbox: this.env.PINGEN_SANDBOX === "true",
    });
  }

  fetch() {
    return new Response("Not found", { status: 404 });
  }
}
