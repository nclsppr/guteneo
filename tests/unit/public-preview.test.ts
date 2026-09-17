import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import { createPreviewApi } from "../../apps/web/src/preview";
import type { WelcomeCredit } from "../../apps/web/src/credit-balance";
import type {
  Dispatch,
  DispatchDetail,
  DocumentRecord,
  Page,
  Session,
} from "../../apps/web/src/api";

const email = {
  channel: "email",
  recipient: { email: "fictional@example.invalid" },
  subject: "Exemple de courrier",
  html: "<p>Contenu fictif.</p>",
  text: "Contenu fictif.",
  ceilingMinor: 500,
};

describe("public browser design preview", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        throw new Error("The public preview must never call a backend");
      }),
    );
  });
  afterEach(() => {
    expect(fetch).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("keeps one fictional credit balance across channels, holds uncertainty and blocks unaffordable ceilings", async () => {
    const preview = createPreviewApi();
    const balance = async () =>
      ((await preview.request("/billing")) as { welcomeCredit: WelcomeCredit })
        .welcomeCredit;
    const initial = await balance();
    expect(initial).toMatchObject({
      kind: "simulation",
      grantedMinor: 5000,
      spentMinor: 158,
      reservedMinor: 500,
      availableMinor: 4342,
      topUpAvailable: false,
      renewal: "none",
    });
    expect(
      ((await preview.request("/usage")) as { welcomeCredit: WelcomeCredit })
        .welcomeCredit,
    ).toEqual(initial);
    const unaffordable = (await preview.request("/dispatches", {
      method: "POST",
      body: { ...email, ceilingMinor: 4343 },
      key: "unaffordable",
    })) as Dispatch;
    await preview.request(`/dispatches/${unaffordable.id}/approve`, {
      method: "POST",
      body: { fingerprint: unaffordable.fingerprint },
    });
    await expect(
      preview.request(`/dispatches/${unaffordable.id}/confirm`, {
        method: "POST",
        key: "reject-credit",
      }),
    ).rejects.toMatchObject({ code: "CREDIT_EXHAUSTED" });
    expect(await balance()).toEqual(initial);
    const affordable = (await preview.request("/dispatches", {
      method: "POST",
      body: email,
      key: "affordable",
    })) as Dispatch;
    await preview.request(`/dispatches/${affordable.id}/approve`, {
      method: "POST",
      body: { fingerprint: affordable.fingerprint },
    });
    for (let attempt = 0; attempt < 2; attempt++)
      await preview.request(`/dispatches/${affordable.id}/confirm`, {
        method: "POST",
        key: "consume-once",
      });
    expect(await balance()).toMatchObject({
      spentMinor: 159,
      reservedMinor: 500,
      availableMinor: 4341,
    });
    expect(
      (
        (await createPreviewApi().request("/billing")) as {
          welcomeCredit: WelcomeCredit;
        }
      ).welcomeCredit,
    ).toEqual(initial);
  });

  it("starts with a fictional session, real fixture PDF bytes, and matching metadata", async () => {
    const preview = createPreviewApi();
    const session = (await preview.request("/session")) as Session;
    expect(session.simulation).toBe(true);
    expect(session.organization.id).toBe("preview_atelier");
    const { items } = (await preview.request(
      "/documents",
    )) as Page<DocumentRecord>;
    expect(items).toHaveLength(2);
    const bytes = await preview.documentContent(items[0].id);
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(items[0].pages);
    expect(bytes.byteLength).toBe(items[0].size);
    const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
    expect(
      Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join(""),
    ).toBe(items[0].sha256);
    bytes.fill(0);
    expect((await preview.documentContent(items[0].id))[0]).toBe(37);
  });

  it("requires matching, unexpired approval and only records a fictional outcome", async () => {
    const preview = createPreviewApi();
    const dispatch = (await preview.request("/dispatches", {
      method: "POST",
      body: email,
      key: "prepare",
    })) as Dispatch;
    expect(
      await preview.request("/dispatches", {
        method: "POST",
        body: email,
        key: "prepare",
      }),
    ).toEqual(dispatch);
    await expect(
      preview.request("/dispatches", {
        method: "POST",
        body: { ...email, subject: "Changed" },
        key: "prepare",
      }),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    await expect(
      preview.request(`/dispatches/${dispatch.id}/confirm`, { method: "POST" }),
    ).rejects.toMatchObject({ code: "APPROVAL_REQUIRED" });
    await expect(
      preview.request(`/dispatches/${dispatch.id}/approve`, {
        method: "POST",
        body: { fingerprint: "changed" },
      }),
    ).rejects.toMatchObject({ code: "FINGERPRINT_MISMATCH" });
    await preview.request(`/dispatches/${dispatch.id}/approve`, {
      method: "POST",
      body: { fingerprint: dispatch.fingerprint },
    });
    await preview.request(`/dispatches/${dispatch.id}/confirm`, {
      method: "POST",
      key: "confirm",
    });
    await preview.request(`/dispatches/${dispatch.id}/confirm`, {
      method: "POST",
      key: "confirm",
    });
    const detail = (await preview.request(
      `/dispatches/${dispatch.id}`,
    )) as DispatchDetail;
    expect(detail.dispatch).toMatchObject({
      status: "delivered",
      mode: "simulation",
    });
    expect(detail.attempts).toHaveLength(1);
    expect(detail.events.at(-1)?.detail).toContain(
      "Aucun fournisseur contacté",
    );
    detail.dispatch.subject = "Caller mutation";
    expect(
      ((await preview.request(`/dispatches/${dispatch.id}`)) as DispatchDetail)
        .dispatch.subject,
    ).toBe(email.subject);
  });

  it("rejects expired approvals and keeps uncertain examples from retrying", async () => {
    const preview = createPreviewApi();
    const dispatch = (await preview.request("/dispatches", {
      method: "POST",
      body: email,
    })) as Dispatch;
    await preview.request(`/dispatches/${dispatch.id}/approve`, {
      method: "POST",
      body: { fingerprint: dispatch.fingerprint },
    });
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 16 * 60_000);
    await expect(
      preview.request(`/dispatches/${dispatch.id}/confirm`, { method: "POST" }),
    ).rejects.toMatchObject({ code: "APPROVAL_REQUIRED" });
    await expect(
      preview.request("/dispatches/preview_atelier_dispatch_5/confirm", {
        method: "POST",
      }),
    ).rejects.toMatchObject({ code: "INVALID_STATE" });
    await expect(
      preview.request("/dispatches/preview_atelier_dispatch_5/cancel", {
        method: "POST",
      }),
    ).rejects.toMatchObject({ code: "INVALID_STATE" });
  });

  it("keeps organizations and browser instances separate and clears state on logout", async () => {
    const preview = createPreviewApi();
    const dispatch = (await preview.request("/dispatches", {
      method: "POST",
      body: email,
    })) as Dispatch;
    const documents = (await preview.request(
      "/documents",
    )) as Page<DocumentRecord>;
    await preview.request("/dev/login", {
      method: "POST",
      body: { organization: "studio" },
    });
    await expect(
      preview.request(`/dispatches/${dispatch.id}`),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      preview.documentContent(documents.items[0].id),
    ).rejects.toMatchObject({ code: "DOCUMENT_NOT_FOUND" });
    await expect(
      preview.request("/dispatches", {
        method: "POST",
        body: { ...email, documentId: documents.items[0].id },
      }),
    ).rejects.toMatchObject({ code: "DOCUMENT_NOT_FOUND" });
    await expect(
      createPreviewApi().request(`/dispatches/${dispatch.id}`),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await preview.request("/logout", { method: "POST" });
    await expect(preview.request("/session")).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
    await preview.request("/dev/login", {
      method: "POST",
      body: { organization: "atelier" },
    });
    await expect(
      preview.request(`/dispatches/${dispatch.id}`),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("supports CSV feedback and campaign preparation without bypassing review", async () => {
    const preview = createPreviewApi();
    expect(
      await preview.request("/recipients/validate", {
        method: "POST",
        body: {
          csv: "channel,email\nemail,camille@example.invalid\nemail,CAMILLE@example.invalid\nemail,invalid",
        },
      }),
    ).toMatchObject({
      valid: false,
      duplicates: [{ line: 3, duplicateOf: 2 }],
      errors: [{ line: 4 }],
    });
    const campaign = (await preview.request("/campaigns", {
      method: "POST",
      body: { name: "Exemple de campagne" },
    })) as { id: string };
    const dispatch = (await preview.request("/dispatches", {
      method: "POST",
      body: { ...email, campaignId: campaign.id },
    })) as Dispatch;
    expect(await preview.request(`/campaigns/${campaign.id}`)).toMatchObject({
      dispatches: [{ id: dispatch.id, status: "prepared" }],
    });
    await preview.request("/admin/channels/email", {
      method: "POST",
      body: { enabled: false },
    });
    await expect(
      preview.request("/dispatches", { method: "POST", body: email }),
    ).rejects.toMatchObject({ code: "CHANNEL_PAUSED" });
  });

  it("rejects document upload, HTML rendering, unknown actions and aborted reads", async () => {
    const preview = createPreviewApi();
    const file = new File(["private content"], "private.pdf");
    const form = new FormData();
    form.append("file", file);
    const read = vi.spyOn(file, "arrayBuffer");
    await expect(
      preview.request("/documents", { method: "POST", body: form }),
    ).rejects.toMatchObject({ code: "PREVIEW_DOCUMENTS_UNAVAILABLE" });
    expect(read).not.toHaveBeenCalled();
    await expect(
      preview.request("/documents/render", {
        method: "POST",
        body: { html: "<p>Private content</p>" },
      }),
    ).rejects.toMatchObject({ code: "PREVIEW_DOCUMENTS_UNAVAILABLE" });
    await expect(
      preview.request("/connections", {
        method: "POST",
        body: { clientId: "example" },
      }),
    ).rejects.toMatchObject({ code: "PREVIEW_UNAVAILABLE" });
    await expect(
      preview.request("/documents", { signal: AbortSignal.abort() }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("routes the public build API and PDF helper locally without fetch", async () => {
    vi.stubEnv("VITE_PUBLIC_PREVIEW", "true");
    vi.resetModules();
    const { api, getDocumentContent, isPublicPreview, ApiError } =
      await import("../../apps/web/src/api");
    expect(isPublicPreview).toBe(true);
    expect((await api<Session>("/session")).simulation).toBe(true);
    const { items } = await api<Page<DocumentRecord>>("/documents");
    expect((await getDocumentContent(items[0].id)).byteLength).toBe(
      items[0].size,
    );
    await expect(
      api("/provider/send", { method: "POST" }),
    ).rejects.toBeInstanceOf(ApiError);
  });
});

describe("normal application transport", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("keeps authenticated API and document requests when the preview flag is absent", async () => {
    vi.stubEnv("VITE_PUBLIC_PREVIEW", "");
    vi.resetModules();
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ id: "server_dispatch" }))
      .mockResolvedValueOnce(new Response(new Uint8Array([37, 80, 68, 70])));
    vi.stubGlobal("fetch", transport);
    const { api, getDocumentContent, isPublicPreview, setSession } =
      await import("../../apps/web/src/api");
    expect(isPublicPreview).toBe(false);
    setSession({
      organization: { id: "real_org", name: "Organization" },
      user: { id: "user", name: "User", role: "admin" },
      csrfToken: "csrf-fixture",
      simulation: false,
    });
    expect(
      await api("/dispatches", {
        method: "POST",
        body: email,
        key: "request-key",
      }),
    ).toEqual({ id: "server_dispatch" });
    expect(transport).toHaveBeenNthCalledWith(
      1,
      "/api/dispatches",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        headers: expect.objectContaining({
          "X-CSRF-Token": "csrf-fixture",
          "Idempotency-Key": "request-key",
        }),
        body: JSON.stringify(email),
      }),
    );
    expect(await getDocumentContent("document/id")).toEqual(
      new Uint8Array([37, 80, 68, 70]),
    );
    expect(transport).toHaveBeenNthCalledWith(
      2,
      "/api/documents/document%2Fid/content",
      expect.objectContaining({ credentials: "same-origin" }),
    );
  });
});
