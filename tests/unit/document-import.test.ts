import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DocumentService,
  ImportSourceError,
  permittedImportUrl,
} from "../../apps/api/src/documents";
import type { Env } from "../../apps/api/src/env";
import type {
  DomainService,
  ActorContext,
} from "../../packages/domain/src/index";

const secret = "private_signed_url_token_document_name";
const host = "files.oaiusercontent.com";
const source = `https://${host}/${secret}?signature=${secret}`;
const actor = {
  organizationId: "fixture",
  userId: "fixture",
  role: "admin",
  actor: "mcp",
} as ActorContext;
function service(hosts: string | undefined = host) {
  const authorize = vi.fn(async () => {});
  const instance = new DocumentService(
    {
      ENVIRONMENT: "production",
      MODE: "production",
      IMPORT_ALLOWED_HOSTS: hosts,
    } as Env,
    { authorizeWrite: authorize } as unknown as DomainService,
  );
  const upload = vi
    .spyOn(instance, "upload")
    .mockResolvedValue({ id: "fixture" } as never);
  return { instance, authorize, upload };
}
const file = {
  file_id: secret,
  file_name: `${secret}.pdf`,
  mime_type: "application/pdf",
  download_url: source,
};
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function errorFor(url: string, hosts?: string) {
  try {
    permittedImportUrl(url, hosts);
  } catch (error) {
    return error as ImportSourceError;
  }
  throw new Error("Source unexpectedly permitted");
}

describe("exact remote document imports", () => {
  it("distinguishes missing configuration from an unknown host without retaining source secrets", () => {
    const error = errorFor(source);
    expect(error).toMatchObject({
      code: "SOURCE_NOT_ALLOWED",
      reason: "missing_configuration",
      sourceHost: host,
    });
    expect(error.observation()).toEqual({
      reason: "missing_configuration",
      sourceCategory: "known_provider",
      knownHost: host,
    });
    expect(error.message).toContain(host);
    expect(JSON.stringify(error)).not.toContain(secret);
    const unknown = errorFor(
      `https://private-document-host.example/a?token=${secret}`,
      host,
    );
    expect(unknown.reason).toBe("untrusted_host");
    expect(unknown.sourceHost).toBe("private-document-host.example");
    expect(unknown.observation()).toEqual({
      reason: "untrusted_host",
      sourceCategory: "unknown_host",
    });
  });

  it.each([
    ["http://files.oaiusercontent.com/a", "invalid_scheme"],
    ["https://username:password@files.oaiusercontent.com/a", "credentials"],
    ["https://files.oaiusercontent.com:444/a", "port"],
    ["https://files.oaiusercontent.com/a#fragment", "fragment"],
    ["https://127.0.0.1/a", "private_host"],
    ["https://0x7f000001/a", "private_host"],
    ["https://[::1]/a", "private_host"],
    ["https://localhost/a", "private_host"],
    ["https://metadata.internal/a", "private_host"],
    ["https://files.oaiusercontent.com.evil.example/a", "untrusted_host"],
    ["https://sub.files.oaiusercontent.com/a", "untrusted_host"],
    ["sandbox:/mnt/data/private.pdf", "invalid_scheme"],
    ["not a URL", "invalid_url"],
  ])("rejects %s with bounded reason %s", (url, reason) => {
    const error = errorFor(
      url,
      `${host},127.0.0.1,localhost,metadata.internal,[::1]`,
    );
    expect(error.reason).toBe(reason);
    expect(JSON.stringify(error.observation())).not.toContain("password");
    expect(JSON.stringify(error.observation())).not.toContain("private.pdf");
  });

  it("accepts only an exact configured normalized hostname and preserves the full signed URL for fetch", async () => {
    expect(permittedImportUrl(source, ` ${host.toUpperCase()} `).href).toBe(
      source,
    );
    expect(() => permittedImportUrl(source, "*.oaiusercontent.com")).toThrow();
    const { instance, upload } = service();
    const bytes = new TextEncoder().encode("%PDF-exact-synthetic-bytes");
    const fetcher = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(bytes),
    );
    vi.stubGlobal("fetch", fetcher);
    await instance.importFile(actor, file);
    expect(String(fetcher.mock.calls[0][0])).toBe(source);
    expect(fetcher.mock.calls[0][1]).toMatchObject({
      redirect: "manual",
      headers: { Accept: "application/pdf" },
    });
    expect(upload).toHaveBeenCalledWith(actor, { name: file.file_name, bytes });
  });

  it("imports from the observed ChatGPT Azure account without authorizing other storage accounts", async () => {
    const azureHost = "oaisdmntprnortheu.blob.core.windows.net";
    const azureSource = `https://${azureHost}/${secret}?sig=${secret}`;
    const allowed = `${host}, ${azureHost.toUpperCase()} `;
    expect(permittedImportUrl(azureSource, allowed).href).toBe(azureSource);
    for (const rejected of [
      "another-account.blob.core.windows.net",
      `sub.${azureHost}`,
      `${azureHost}.evil.example`,
    ]) {
      expect(errorFor(`https://${rejected}/a`, allowed).reason).toBe(
        "untrusted_host",
      );
    }
    expect(() =>
      permittedImportUrl(azureSource, "*.blob.core.windows.net"),
    ).toThrow();
    const observation = errorFor(azureSource, host).observation();
    expect(observation).toEqual({
      reason: "untrusted_host",
      sourceCategory: "known_provider",
      knownHost: azureHost,
    });
    expect(JSON.stringify(observation)).not.toContain(secret);
    const { instance, upload } = service(allowed);
    const bytes = new TextEncoder().encode("%PDF-exact-azure-synthetic-bytes");
    const fetcher = vi.fn(async (_input: RequestInfo | URL) => new Response(bytes));
    vi.stubGlobal("fetch", fetcher);
    await instance.importFile(actor, { ...file, download_url: azureSource });
    expect(String(fetcher.mock.calls[0]?.[0])).toBe(azureSource);
    expect(upload).toHaveBeenCalledWith(actor, { name: file.file_name, bytes });
  });

  it.each([
    [302, "SOURCE_REDIRECT_NOT_ALLOWED", "redirect_rejected"],
    [403, "SOURCE_EXPIRED_OR_UNAVAILABLE", "source_expired"],
    [404, "SOURCE_EXPIRED_OR_UNAVAILABLE", "source_expired"],
    [410, "SOURCE_EXPIRED_OR_UNAVAILABLE", "source_expired"],
    [408, "SOURCE_DOWNLOAD_TIMEOUT", "download_timeout"],
    [500, "DOWNLOAD_FAILED", "download_failed"],
  ])(
    "handles upstream %s without following redirects or echoing a secret response",
    async (status, code, reason) => {
      const { instance, upload } = service();
      const cancel = vi.fn();
      const fetcher = vi.fn(
        async () =>
          new Response(new ReadableStream({ cancel }), {
            status,
            headers: { Location: `http://127.0.0.1/${secret}` },
          }),
      );
      vi.stubGlobal("fetch", fetcher);
      const error = await instance
        .importFile(actor, file)
        .catch((error) => error as ImportSourceError);
      expect(error).toMatchObject({ code, reason });
      expect(JSON.stringify(error)).not.toContain(secret);
      expect(fetcher).toHaveBeenCalledOnce();
      expect(cancel).toHaveBeenCalledOnce();
      expect(upload).not.toHaveBeenCalled();
    },
  );

  it("sanitizes a provider exception that contains the signed URL", async () => {
    const { instance } = service();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error(source);
      }),
    );
    const error = await instance
      .importFile(actor, file)
      .catch((error) => error as ImportSourceError);
    expect(error).toMatchObject({
      code: "DOWNLOAD_FAILED",
      reason: "download_failed",
    });
    if (!(error instanceof ImportSourceError))
      throw new Error("Expected import rejection");
    expect(error.message).not.toContain(secret);
    expect(JSON.stringify(error.observation())).not.toContain(secret);
  });

  it.each(["fetch", "body", "cancel"])(
    "bounds an uncooperative %s by the same 15 second deadline",
    async (phase) => {
      vi.useFakeTimers();
      vi.spyOn(AbortSignal, "timeout").mockImplementation((ms) => {
        const controller = new AbortController();
        setTimeout(() => controller.abort(), ms);
        return controller.signal;
      });
      const { instance, upload } = service();
      const never = () => new Promise<never>(() => {});
      const cancel = vi.fn(never);
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          if (phase === "cancel")
            controller.enqueue(new Uint8Array(10 * 1024 * 1024 + 1));
        },
        cancel,
      });
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => (phase === "fetch" ? never() : new Response(stream))),
      );
      const promise = instance
        .importFile(actor, file)
        .catch((error) => error as ImportSourceError);
      await vi.advanceTimersByTimeAsync(15_000);
      const error = await promise;
      expect(error).toMatchObject({
        code: "SOURCE_DOWNLOAD_TIMEOUT",
        reason: "download_timeout",
        status: 408,
      });
      if (phase !== "fetch") expect(cancel).toHaveBeenCalledOnce();
      expect(upload).not.toHaveBeenCalled();
    },
  );

  it("rejects before any external transfer when membership authorization fails", async () => {
    const { instance, authorize } = service();
    authorize.mockRejectedValue(new Error("access denied"));
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    await expect(instance.importFile(actor, file)).rejects.toThrow(
      "access denied",
    );
    expect(fetcher).not.toHaveBeenCalled();
  });
});
