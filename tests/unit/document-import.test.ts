import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DocumentService,
  ImportSourceError,
  permittedImportUrl,
} from "../../apps/api/src/documents";
import type { Env } from "../../apps/api/src/env";
import { getCapabilities } from "../../apps/api/src/index";
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
function service(environment: Env["ENVIRONMENT"] = "production") {
  const authorize = vi.fn(async () => {});
  const instance = new DocumentService(
    {
      ENVIRONMENT: environment,
      MODE: "production",
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

function errorFor(url: string) {
  try {
    permittedImportUrl(url);
  } catch (error) {
    return error as ImportSourceError;
  }
  throw new Error("Source unexpectedly permitted");
}

describe("exact remote document imports", () => {
  it.each(["production", "staging", "local"] as const)(
    "advertises URL import only when public egress is available in %s",
    (environment) => {
      expect(
        getCapabilities({ ENVIRONMENT: environment } as Env).documents
          .urlImport,
      ).toBe(environment !== "local");
    },
  );
  it.each([
    host,
    "oaisdmntprukwest.blob.core.windows.net",
    "oaisdmntprnortheu.blob.core.windows.net",
    "oaisdmntprdenmarkeast.blob.core.windows.net",
    "any-other-account.blob.core.windows.net",
    "downloads.another-assistant.com",
    "customer-owned-storage.net",
    "sub.files.oaiusercontent.com",
  ])(
    "imports exact bytes from public domain %s without any configuration",
    async (sourceHost) => {
      const url = `https://${sourceHost}/${secret}?signature=${secret}`;
      expect(permittedImportUrl(url).href).toBe(url);
      const { instance, upload } = service();
      const bytes = new TextEncoder().encode("%PDF-exact-synthetic-bytes");
      const fetcher = vi.fn(
        async (_input: RequestInfo | URL, _init?: RequestInit) =>
          new Response(bytes),
      );
      vi.stubGlobal("fetch", fetcher);
      await instance.importFile(actor, { ...file, download_url: url });
      expect(String(fetcher.mock.calls[0][0])).toBe(url);
      expect(fetcher.mock.calls[0][1]).toMatchObject({
        redirect: "manual",
        headers: { Accept: "application/pdf" },
      });
      expect(Object.keys(fetcher.mock.calls[0][1]?.headers ?? {})).toEqual([
        "Accept",
      ]);
      expect(upload).toHaveBeenCalledWith(actor, {
        name: file.file_name,
        bytes,
      });
    },
  );

  it.each([
    ["http://files.oaiusercontent.com/a", "invalid_scheme"],
    ["https://username:password@files.oaiusercontent.com/a", "credentials"],
    ["https://files.oaiusercontent.com:444/a", "port"],
    ["https://files.oaiusercontent.com/a#fragment", "fragment"],
    ["https://127.0.0.1/a", "private_host"],
    ["https://127.1/a", "private_host"],
    ["https://2130706433/a", "private_host"],
    ["https://0x7f000001/a", "private_host"],
    ["https://10.0.0.1/a", "private_host"],
    ["https://169.254.169.254/a", "private_host"],
    ["https://[::1]/a", "private_host"],
    ["https://[::ffff:127.0.0.1]/a", "private_host"],
    ["https://[fc00::1]/a", "private_host"],
    ["https://localhost/a", "private_host"],
    ["https://sub.localhost./a", "private_host"],
    ["https://metadata.internal/a", "private_host"],
    ["https://printer.local/a", "private_host"],
    ["https://router.home.arpa/a", "private_host"],
    ["https://router.lan/a", "private_host"],
    ["https://files.test/a", "private_host"],
    ["https://files.invalid/a", "private_host"],
    ["https://files.onion/a", "private_host"],
    ["sandbox:/mnt/data/private.pdf", "invalid_scheme"],
    ["file:///mnt/data/private.pdf", "invalid_scheme"],
    ["not a URL", "invalid_url"],
  ])(
    "rejects %s before any download with bounded reason %s",
    async (url, reason) => {
      const error = errorFor(url);
      expect(error.reason).toBe(reason);
      expect(JSON.stringify(error.observation())).not.toContain("password");
      expect(JSON.stringify(error.observation())).not.toContain("private.pdf");
      const { instance, upload } = service();
      const fetcher = vi.fn();
      vi.stubGlobal("fetch", fetcher);
      await expect(
        instance.importFile(actor, { ...file, download_url: url }),
      ).rejects.toMatchObject({ reason });
      expect(fetcher).not.toHaveBeenCalled();
      expect(upload).not.toHaveBeenCalled();
    },
  );

  it("allows standard HTTPS normalization without changing signed paths or query parameters", () => {
    expect(
      permittedImportUrl(`https://${host.toUpperCase()}:443/a?sig=%2F%2B%3D`)
        .href,
    ).toBe(`https://${host}/a?sig=%2F%2B%3D`);
    expect(permittedImportUrl(`https://${host}./a`).hostname).toBe(`${host}.`);
  });

  it("keeps the local developer network unreachable through remote imports", async () => {
    const { instance, upload } = service("local");
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    await expect(instance.importFile(actor, file)).rejects.toMatchObject({
      code: "SOURCE_NOT_ALLOWED",
      reason: "local_import_disabled",
    });
    expect(fetcher).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });

  it("reports a public source failure without logging arbitrary domains or signed URLs", () => {
    const domain = "customer-owned-storage.net";
    const error = errorFor(`http://${domain}/${secret}?signature=${secret}`);
    expect(error).toMatchObject({
      code: "SOURCE_NOT_ALLOWED",
      reason: "invalid_scheme",
      sourceHost: domain,
    });
    expect(error.observation()).toEqual({
      reason: "invalid_scheme",
      sourceCategory: "public_host",
    });
    expect(JSON.stringify(error)).not.toContain(secret);
    const known = errorFor(`http://${host}/${secret}`);
    expect(known.observation()).toEqual({
      reason: "invalid_scheme",
      sourceCategory: "known_provider",
      knownHost: host,
    });
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
