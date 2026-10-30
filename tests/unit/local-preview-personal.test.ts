import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import { createPreviewApi } from "../../apps/web/src/preview";
import { createPreviewPersonal } from "../../apps/web/src/preview-personal";
import type { PersonalSession } from "../../apps/web/src/personal-api";
import type {
  PersonalDocumentItem,
  PersonalDocumentView,
} from "../../packages/contracts/src/secure-distribution";

const configuration = {
  account: "viewer" as const,
  seed: "personal-fixtures",
  counts: {
    documents: 1000,
    dispatches: 20,
    templates: 20,
    datasets: 20,
    generations: 20,
  },
};
async function fixture() {
  const preview = createPreviewApi({ advancedLocal: true });
  await preview.configure(configuration);
  const personal = createPreviewPersonal(preview);
  const session = (await personal.request(
    "/personal/session",
  )) as PersonalSession;
  const options = { csrfToken: session.csrfToken };
  const list = (await personal.request("/personal/documents", options)) as {
    items: PersonalDocumentItem[];
    nextCursor: string;
  };
  return { preview, personal, session, options, list };
}

describe("local-only personal browser adapter", () => {
  beforeEach(() =>
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        throw new Error(
          "Personal fictional scenarios must never use a backend.",
        );
      }),
    ),
  );
  afterEach(() => {
    expect(fetch).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("rejects use outside the explicitly enabled local model", async () => {
    const personal = createPreviewPersonal(createPreviewApi());
    await expect(personal.request("/personal/session")).rejects.toMatchObject({
      code: "PREVIEW_LOCAL_ONLY",
      status: 403,
    });
    await expect(
      personal.blob("/personal/documents/example/pages/1"),
    ).rejects.toMatchObject({ code: "PREVIEW_LOCAL_ONLY", status: 403 });
  });

  it("projects a fictional actor without asserting real authentication or receipt", async () => {
    const { session, list } = await fixture();
    expect(session).toMatchObject({
      simulation: true,
      mfa: false,
      strongAuthentication: false,
      verifiedAccount: false,
      authenticatedAt: null,
    });
    expect(session.authenticationPolicyVersion).toBe(
      "fictional-browser-preview-no-authentication",
    );
    expect(session.user.id).toContain("viewer");
    expect(list.items).toHaveLength(50);
    expect(list.nextCursor).toBeTruthy();
    expect(
      list.items.every(
        (item) =>
          item.title.startsWith("Fictional received preview") &&
          item.sender.includes("no delivery") &&
          !item.allowOriginalDownload &&
          !item.allowVaultDeposit,
      ),
    ).toBe(true);
  });

  it("keeps pages bounded and uses separate identifiers for shared and saved-copy fixtures", async () => {
    const { personal, options, list } = await fixture();
    const next = (await personal.request(
      `/personal/documents?cursor=${encodeURIComponent(list.nextCursor)}`,
      options,
    )) as { items: PersonalDocumentItem[] };
    expect(next.items).toHaveLength(50);
    expect(next.items[0].id).not.toBe(list.items[0].id);
    const saved = (await personal.request(
      "/personal/documents?kind=personal",
      options,
    )) as { items: PersonalDocumentItem[] };
    expect(saved.items[0].kind).toBe("personal");
    expect(saved.items[0].id).not.toBe(list.items[0].id);
    await expect(
      personal.request(
        `/personal/documents?kind=personal&cursor=${encodeURIComponent(list.nextCursor)}`,
        options,
      ),
    ).rejects.toMatchObject({ code: "INVALID_PREVIEW_CURSOR" });
    await expect(
      personal.request(
        `/personal/documents?q=changed&cursor=${encodeURIComponent(list.nextCursor)}`,
        options,
      ),
    ).rejects.toMatchObject({ code: "INVALID_PREVIEW_CURSOR" });
    await expect(
      personal.request("/personal/documents?q=%E6%BC%A2%E5%AD%97", options),
    ).rejects.toMatchObject({
      code: "PREVIEW_SEARCH_INDEXED_ONLY",
      status: 409,
    });
  });

  it("provides read-only detail and accessible text without creating delivery or audit evidence", async () => {
    const { personal, options, list } = await fixture();
    const active = list.items.find((item) => item.status === "active")!;
    const path = `/personal/documents/${active.id}`;
    const detail = (await personal.request(
      path,
      options,
    )) as PersonalDocumentView;
    expect(detail.pages).toHaveLength(1);
    expect(detail.audit).toEqual([]);
    expect(await personal.request(`${path}/pages/1/text`, options)).toEqual({
      text: expect.stringContaining(
        "No document has been delivered, received or deposited",
      ),
    });
    expect(await personal.request(`${path}/audit`, options)).toEqual({
      items: [],
      nextCursor: null,
    });
    for (const suffix of ["/deposit", "/download", "/events"])
      await expect(
        personal.request(path + suffix, {
          ...options,
          method: "POST",
          body: {},
        }),
      ).rejects.toMatchObject({
        code: "PREVIEW_PERSONAL_READ_ONLY",
        status: 409,
      });
    await expect(
      personal.request(`${path}/pages/2/text`, options),
    ).rejects.toMatchObject({ code: "DOCUMENT_NOT_FOUND" });
    await expect(
      personal.blob(path + "/download", { ...options, method: "POST" }),
    ).rejects.toMatchObject({ code: "PREVIEW_PERSONAL_READ_ONLY" });
  });

  it("finds a known numbered document near a billion-sized collection's end in one indexed read", async () => {
    const preview = createPreviewApi({ advancedLocal: true });
    await preview.configure({
      ...configuration,
      counts: { ...configuration.counts, documents: 1_000_000_000 },
    });
    const personal = createPreviewPersonal(preview);
    const session = (await personal.request(
      "/personal/session",
    )) as PersonalSession;
    const create = vi.spyOn(PDFDocument, "create");
    const read = vi.spyOn(preview, "request");
    const found = (await personal.request("/personal/documents?q=999999999", {
      csrfToken: session.csrfToken,
    })) as { items: PersonalDocumentItem[]; nextCursor: string | null };
    expect(found.items).toHaveLength(1);
    expect(found.items[0].title).toContain("999999999");
    expect(found.nextCursor).toBeNull();
    expect(
      read.mock.calls.filter(([path]) => path.startsWith("/documents")),
    ).toEqual([["/documents?recordNumber=999999999", expect.anything()]]);
    expect(create).not.toHaveBeenCalled();
    const exact = (await personal.request(
      `/personal/documents?q=${encodeURIComponent(found.items[0].title)}`,
      { csrfToken: session.csrfToken },
    )) as { items: PersonalDocumentItem[] };
    expect(exact.items[0].id).toBe(found.items[0].id);
    const byId = (await personal.request(
      `/personal/documents?q=${found.items[0].id}`,
      { csrfToken: session.csrfToken },
    )) as { items: PersonalDocumentItem[] };
    expect(byId.items[0].id).toBe(found.items[0].id);
    await expect(
      personal.request("/personal/documents?q=Letter", {
        csrfToken: session.csrfToken,
      }),
    ).rejects.toMatchObject({
      code: "PREVIEW_SEARCH_INDEXED_ONLY",
      status: 409,
    });
    read.mockRestore();
    create.mockRestore();
  });

  it("rejects old personal sessions and document IDs after switching actors or reseeding", async () => {
    const { preview, personal, options, list } = await fixture();
    await preview.configure({ ...configuration, account: "member" });
    await expect(
      personal.request("/personal/documents", options),
    ).rejects.toMatchObject({ code: "PREVIEW_SCENARIO_CHANGED" });
    const next = (await personal.request(
      "/personal/session",
    )) as PersonalSession;
    await expect(
      personal.request(
        `/personal/documents?cursor=${encodeURIComponent(list.nextCursor)}`,
        { csrfToken: next.csrfToken },
      ),
    ).rejects.toMatchObject({ code: "INVALID_PREVIEW_CURSOR" });
    await expect(
      personal.request(`/personal/documents/${list.items[0].id}`, {
        csrfToken: next.csrfToken,
      }),
    ).rejects.toMatchObject({ code: "DOCUMENT_NOT_FOUND" });
    await preview.configure({ ...configuration, seed: "another-seed" });
    await expect(
      personal.request("/personal/documents", { csrfToken: next.csrfToken }),
    ).rejects.toMatchObject({ code: "PREVIEW_SCENARIO_CHANGED" });
  });

  it("fences repeated legacy scenarios even when the selected fake account is unchanged", async () => {
    const preview = createPreviewApi({ advancedLocal: true });
    await preview.configure({
      account: "admin",
      seed: "default",
      counts: null,
    });
    const personal = createPreviewPersonal(preview);
    const previous = (await personal.request(
      "/personal/session",
    )) as PersonalSession;
    await preview.configure({
      account: "admin",
      seed: "default",
      counts: null,
    });
    await expect(
      personal.request("/personal/documents", {
        csrfToken: previous.csrfToken,
      }),
    ).rejects.toMatchObject({ code: "PREVIEW_SCENARIO_CHANGED" });
  });

  it("returns only a local PNG for a ready page and rejects late pixels after a profile change", async () => {
    const { preview, personal, options, list } = await fixture();
    const active = list.items.find((item) => item.status === "active")!;
    let complete: ((value: Blob) => void) | undefined;
    const context = {
      scale: vi.fn(),
      fillRect: vi.fn(),
      fillText: vi.fn(),
      fillStyle: "",
      font: "",
    };
    vi.stubGlobal("document", {
      createElement: () => ({
        getContext: () => context,
        toBlob: (callback: (value: Blob) => void) => {
          complete = callback;
        },
      }),
    });
    const pending = personal.blob(
      `/personal/documents/${active.id}/pages/1`,
      options,
    );
    await vi.waitFor(() => expect(complete).toBeTypeOf("function"));
    await preview.configure({
      ...configuration,
      seed: "changed-during-render",
    });
    complete!(new Blob(["fictional png bytes"], { type: "image/png" }));
    await expect(pending).rejects.toMatchObject({
      code: "PREVIEW_SCENARIO_CHANGED",
    });
    expect(context.fillText).toHaveBeenCalledWith(
      expect.stringContaining("fictional document"),
      44,
      75,
    );
  });

  it("aborts reads and logs out only the fictional in-memory account", async () => {
    const { personal, options } = await fixture();
    const controller = new AbortController();
    controller.abort();
    await expect(
      personal.request("/personal/documents", {
        ...options,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    await personal.request("/personal/logout", { ...options, method: "POST" });
    await expect(personal.request("/personal/session")).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
    const restarted = (await personal.request("/dev/personal-login", {
      method: "POST",
    })) as PersonalSession;
    expect(restarted.simulation).toBe(true);
    expect(restarted.verifiedAccount).toBe(false);
  });

  it("routes the actual local personal client into the adapter and never falls back to a backend", async () => {
    vi.stubEnv("VITE_PUBLIC_PREVIEW", "true");
    vi.stubEnv("DEV", true);
    vi.stubGlobal("location", { hostname: "127.0.0.1" });
    vi.resetModules();
    const { publicPreview } = await import("../../apps/web/src/preview");
    await publicPreview.configure(configuration);
    const { personalApi, personalBlob } =
      await import("../../apps/web/src/personal-api");
    const session = await personalApi<PersonalSession>("/personal/session");
    expect(session.simulation).toBe(true);
    const documents = await personalApi<{ items: PersonalDocumentItem[] }>(
      "/personal/documents",
      session,
    );
    expect(documents.items).toHaveLength(50);
    await expect(
      personalApi("/personal/unknown", session),
    ).rejects.toMatchObject({
      code: "PREVIEW_PERSONAL_READ_ONLY",
      status: 409,
    });
    await expect(
      personalBlob(
        `/personal/documents/${documents.items[0].id}/download`,
        session,
        { method: "POST", expectedType: "pdf" },
      ),
    ).rejects.toMatchObject({ code: "PREVIEW_PERSONAL_READ_ONLY" });
  });
});

describe("normal personal-client transport remains authenticated", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
  it("preserves production request headers, credentials and binary type validation", async () => {
    vi.stubEnv("VITE_PUBLIC_PREVIEW", "");
    vi.stubGlobal("location", { hostname: "guteneo.com" });
    vi.resetModules();
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ id: "fictional-result" }))
      .mockResolvedValueOnce(
        new Response(new Uint8Array([137, 80, 78, 71]), {
          headers: { "Content-Type": "image/png" },
        }),
      )
      .mockResolvedValueOnce(
        new Response("not a pdf", {
          headers: { "Content-Type": "text/plain" },
        }),
      );
    vi.stubGlobal("fetch", transport);
    const { personalApi, personalBlob } =
      await import("../../apps/web/src/personal-api");
    const session = { csrfToken: "fictional-personal-csrf" };
    expect(
      await personalApi("/personal/documents/example/deposit", session, {
        method: "POST",
        body: { example: true },
        key: "fixture-key",
      }),
    ).toEqual({ id: "fictional-result" });
    expect(transport).toHaveBeenNthCalledWith(
      1,
      "/api/personal/documents/example/deposit",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        referrerPolicy: "no-referrer",
        headers: expect.objectContaining({
          "X-CSRF-Token": session.csrfToken,
          "Idempotency-Key": "fixture-key",
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({ example: true }),
      }),
    );
    expect(
      (
        await personalBlob("/personal/documents/example/pages/1", session, {
          expectedType: "image",
        })
      ).type,
    ).toBe("image/png");
    await expect(
      personalBlob("/personal/documents/example/download", session, {
        expectedType: "pdf",
      }),
    ).rejects.toMatchObject({ code: "DOCUMENT_UNAVAILABLE", status: 502 });
    expect(transport).toHaveBeenCalledTimes(3);
  });
});
