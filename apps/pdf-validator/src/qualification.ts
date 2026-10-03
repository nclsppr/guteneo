import { WorkerEntrypoint } from "cloudflare:workers";
import type { PdfValidatorEnv } from "./handler";

interface QualificationContainer extends DurableObjectStub {
  getState(): Promise<{ status: string }>;
  stop(): Promise<void>;
}

/** Account-private RPC entrypoint. Never bound to the customer application. */
export class ValidatorQualification extends WorkerEntrypoint<PdfValidatorEnv> {
  async release(): Promise<{ sourceCommit: string; workerVersion: string }> {
    if (this.env.QUALIFICATION_ENABLED !== "true")
      throw new Error("QUALIFICATION_DISABLED");
    const sourceCommit = this.env.SOURCE_COMMIT ?? "";
    const workerVersion = this.env.CF_VERSION_METADATA?.id ?? "";
    if (
      !/^[a-f0-9]{40}$/.test(sourceCommit) ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(
        workerVersion,
      )
    )
      throw new Error("QUALIFICATION_INVALID_RELEASE");
    return { sourceCommit, workerVersion };
  }

  private container(): QualificationContainer {
    if (this.env.QUALIFICATION_ENABLED !== "true")
      throw new Error("QUALIFICATION_DISABLED");
    return this.env.PDF_VALIDATOR_CONTAINER.getByName(
      "pdf-validator-v1",
    ) as QualificationContainer;
  }

  async state(): Promise<{ status: string }> {
    const state = await this.container().getState();
    if (
      !new Set([
        "running",
        "stopping",
        "stopped",
        "healthy",
        "stopped_with_code",
      ]).has(state.status)
    )
      throw new Error("QUALIFICATION_INVALID_STATE");
    return { status: state.status };
  }

  async stop(): Promise<{ status: string }> {
    await this.container().stop();
    return this.state();
  }

  async privacy(): Promise<{ temporaryDirectories: number }> {
    const response = await this.container().fetch(
      new Request("http://validator.internal/qualification/privacy"),
    );
    if (!response.ok) throw new Error("QUALIFICATION_UNAVAILABLE");
    const result = (await response.json()) as {
      temporaryDirectories?: unknown;
    };
    if (
      typeof result.temporaryDirectories !== "number" ||
      !Number.isSafeInteger(result.temporaryDirectories) ||
      result.temporaryDirectories < 0
    )
      throw new Error("QUALIFICATION_INVALID_PRIVACY_RESULT");
    return { temporaryDirectories: result.temporaryDirectories };
  }

  async processDeadline(): Promise<{
    code: "VALIDATION_TIMEOUT";
    temporaryDirectories: number;
  }> {
    const response = await this.container().fetch(
      new Request("http://validator.internal/qualification/process-deadline"),
    );
    if (!response.ok) throw new Error("QUALIFICATION_UNAVAILABLE");
    const result = (await response.json()) as Record<string, unknown>;
    if (
      result.code !== "VALIDATION_TIMEOUT" ||
      result.temporaryDirectories !== 0
    )
      throw new Error("QUALIFICATION_DEADLINE_FAILED");
    return { code: "VALIDATION_TIMEOUT", temporaryDirectories: 0 };
  }
}
