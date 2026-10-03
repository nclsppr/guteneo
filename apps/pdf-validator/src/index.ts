import { Container } from "@cloudflare/containers";
import { handleRequest, type PdfValidatorEnv } from "./handler";
export { ValidatorQualification } from "./qualification";

export class PdfValidatorContainer extends Container<PdfValidatorEnv> {
  private admittedRequests = 0;
  defaultPort = 8080;
  sleepAfter = "5s";
  enableInternet = false;
  constructor(
    ctx: ConstructorParameters<typeof Container<PdfValidatorEnv>>[0],
    env: PdfValidatorEnv,
  ) {
    super(ctx, env);
    // Private self-inspection exists only during the operator's prelaunch run.
    this.envVars = {
      QUALIFICATION_ENABLED:
        env.QUALIFICATION_ENABLED === "true" ? "true" : "false",
    };
  }
  async fetch(request: Request): Promise<Response> {
    // SDK inflight accounting begins inside containerFetch, after readiness.
    // Count admission now so a five-second idle alarm cannot interrupt startup.
    this.admittedRequests += 1;
    try {
      if (
        (await this.getState()).status !== "healthy" ||
        !this.ctx.container?.running
      ) {
        // CPU-constrained startup includes VM allocation and the independently
        // bounded 20-second engine-version probe. The outer Worker signal
        // still caps the complete cold request at 45 seconds.
        await this.startAndWaitForPorts(this.defaultPort, {
          abort: request.signal,
          instanceGetTimeoutMS: 8000,
          portReadyTimeoutMS: 35000,
        });
      }
      return await this.containerFetch(request, this.defaultPort);
    } catch {
      return Response.json(
        {
          code: request.signal.aborted
            ? "VALIDATION_TIMEOUT"
            : "VALIDATOR_UNAVAILABLE",
        },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    } finally {
      this.admittedRequests -= 1;
      this.renewActivityTimeout();
    }
  }
  async onActivityExpired(): Promise<void> {
    if (this.admittedRequests > 0) {
      this.renewActivityTimeout();
      return;
    }
    // The SDK default emits a log line; this service keeps lifecycle logs off.
    await this.stop();
  }
  onError(_error: unknown): never {
    throw new Error("PDF_VALIDATOR_CONTAINER_ERROR");
  }
}

export default {
  fetch(request: Request, env: PdfValidatorEnv): Promise<Response> {
    return handleRequest(request, env);
  },
};
