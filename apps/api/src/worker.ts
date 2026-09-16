import { WorkerEntrypoint } from "cloudflare:workers";
import { inspectTelnyxReadiness } from "../../../packages/providers/telnyx-readiness";
import { inspectPingenReadiness } from "../../../packages/providers/pingen-readiness";
import type { Env } from "./env";
import { inspectSesPrincipal } from "./provider-principal";

export { default } from "./index";

/** Available only through an authenticated same-account service binding. */
export class ProviderInspection extends WorkerEntrypoint<Env> {
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

  fetch() {
    return new Response("Not found", { status: 404 });
  }
}
