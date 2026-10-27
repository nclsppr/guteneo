import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import type { App } from "e2e";
import type { Browser } from "@e2e-dev/web";
import {
  expect,
  localApi,
  loginWorkshop,
  readSecureCharge,
  resetRecipientWorkspaceFixture,
  test,
  uploadSyntheticPdf,
} from "./fixtures";

type Publication = {
  id: string;
  dispatchId: string | null;
  status: string;
  approved: boolean;
  quote: { sharedMinor: number; personalMinor: number; totalMinor: number };
  audit: { id: string; type: string; provenance: string }[];
};

async function localIdentity(
  browser: Browser,
  app: App,
  identity: "atelier" | "recipient" | "other-recipient",
  assurance: "strong" | "weak" = "strong",
) {
  const status = await browser.evaluate(
    async ({ identity, assurance }) => {
      const workshop = identity === "atelier";
      const response = await fetch(
        workshop ? "/api/dev/login" : "/api/dev/personal-login",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            workshop ? { organization: "atelier" } : { identity, assurance },
          ),
        },
      );
      return response.status;
    },
    { identity, assurance },
  );
  expect(status).toBe(200);
  await app.open(
    identity === "atelier"
      ? "/#/app/secure-distributions"
      : "/#/app/my-documents",
  );
  // Auth0 normally returns through a full navigation. A hash-only navigation
  // after a local cookie exchange would retain the previous account's CSRF state.
  await browser.reload();
}

test.beforeEach(async () => resetRecipientWorkspaceFixture());

test(
  "a paid sharing period, recipient association, original download and independent personal copy follow their separate rights",
  { timeout: 180_000 },
  async ({ app, screen, browser }) => {
    await loginWorkshop(app, screen);
    const source = await uploadSyntheticPdf(app, screen, browser, 4);
    await app.open("/#/app/secure-distributions/new");
    await screen.getByLabel("PDF vérifié").selectOption({ value: source.id });
    await screen.getByLabel("Accès au document").selectOption({ value: "independent" });
    await screen
      .getByLabel("Nom du destinataire")
      .fill("Destinataire de simulation");
    await screen
      .getByLabel("Adresse e-mail du destinataire")
      .fill("recipient@example.test");
    await screen
      .getByRole("checkbox", /Autoriser le téléchargement du PDF original/)
      .check();
    await screen
      .getByRole("checkbox", /Autoriser une copie personnelle conservée/)
      .check();
    const [preparedResponse] = await Promise.all([
      browser.waitForResponse("**/api/secure-distributions"),
      screen.getByRole("button", "Préparer et vérifier le partage").tap(),
    ]);
    expect(preparedResponse.status).toBe(201);
    const prepared = await preparedResponse.json<{ id: string }>();
    const path = `/api/secure-distributions/${prepared.id}`;
    await expect
      .poll(
        async () => {
          const response = await localApi<Publication>(browser, path);
          return (
            response.body.status === "prepared" &&
            response.body.dispatchId !== null
          );
        },
        { timeout: 45_000, interval: 1_500 },
      )
      .toBe(true);
    let publication = (await localApi<Publication>(browser, path)).body;
    expect(await readSecureCharge(prepared.id)).toEqual([]);
    await browser.reload();
    await expect(browser.locator(".app-topbar > span")).toHaveText(
      "Distribution sécurisée",
    );
    await expect(
      browser.locator('.workspace-navigation a[href="#/app/secure-distributions"]'),
    ).toHaveAttribute("aria-current", "page");
    await expect(
      screen.getByRole("button", /^Simuler l’envoi pour /u),
    ).toBeDisabled();
    await screen
      .getByRole(
        "checkbox",
        "J’ai vérifié le document, le destinataire, les droits et le prix.",
      )
      .check();
    await screen
      .getByRole(
        "checkbox",
        "Je confirme que ce destinataire a demandé cet e-mail et son document. Cet envoi ne constitue pas une prospection.",
      )
      .check();
    await screen.getByRole("button", /^Simuler l’envoi pour /u).tap();
    await expect
      .poll(
        async () => (await localApi<Publication>(browser, path)).body.status,
        { interval: 500 },
      )
      .toBe("active");
    publication = (await localApi<Publication>(browser, path)).body;
    const committedCharge = await readSecureCharge(prepared.id);
    expect(committedCharge).toEqual([
      {
        amount_minor:
          publication.quote.sharedMinor + publication.quote.personalMinor,
        evidence: "simulation",
      },
    ]);

    // Delivery stays in browser memory: exercise the real incoming fragment,
    // its cleanup before login, and the same-tab full-navigation handoff. Never
    // return the invitation to the runner, including when an assertion fails.
    const handoff = await browser.evaluate(async (dispatchId: string) => {
      const response = await fetch(
        `/api/dispatches/${encodeURIComponent(dispatchId)}`,
      );
      const message = (await response.json()) as { dispatch: { text: string } };
      const token = message.dispatch.text.match(
        /[?&]invitation=([a-f0-9]{64})/,
      )?.[1];
      if (!token) throw new Error("The simulated invitation is missing.");
      const account = await fetch("/api/personal/session");
      const session = (await account.json()) as { csrfToken: string };
      const logout = await fetch("/api/personal/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": session.csrfToken },
        body: "{}",
      });
      location.hash = `/app/my-documents?invitation=${token}`;
      const deadline = Date.now() + 8000;
      while (Date.now() < deadline && (location.hash.includes("invitation=") ||
        !document.querySelector('a[href^="/auth/login"]'))) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      const pending = JSON.parse(sessionStorage.getItem("guteneo.pending-document-invitation.v1") ?? "null") as { token?: string; expiresAt?: number } | null;
      const link = document.querySelector<HTMLAnchorElement>('a[href^="/auth/login"]');
      const login = link ? new URL(link.href) : null;
      const returnTo = login?.searchParams.get("returnTo");
      return {
        signedOut: logout.status === 200,
        cleanHash: location.hash === "#/app/my-documents",
        storedInThisTab: pending?.token === token,
        ttlMs: pending?.expiresAt ? pending.expiresAt - Date.now() : 0,
        cleanLogin: Boolean(login && !decodeURIComponent(login.href).includes(token) &&
          returnTo === "/#/app/my-documents"),
      };
    }, publication.dispatchId!);
    expect(handoff.signedOut).toBe(true);
    expect(handoff.cleanHash).toBe(true);
    expect(handoff.storedInThisTab).toBe(true);
    expect(handoff.cleanLogin).toBe(true);
    expect(handoff.ttlMs > 0 && handoff.ttlMs <= 600000).toBe(true);
    const [loginResponse] = await Promise.all([
      browser.waitForResponse(/\/auth\/login\?/),
      screen.getByRole("link", "Se connecter à mon compte").tap(),
    ]);
    expect(loginResponse.status >= 300 && loginResponse.status < 400).toBe(true);
    // The local server has no live identity-provider configuration. The fixture
    // represents its successful callback; it does not qualify Auth0 or MFA.
    const returned = await browser.evaluate(() => ({
      hashClean: location.hash === "#/app/my-documents",
      noPrivateQuery: !/[a-f0-9]{64}|invitation=/u.test(decodeURIComponent(location.href)),
      pending: sessionStorage.getItem("guteneo.pending-document-invitation.v1") !== null,
    }));
    expect(returned).toEqual({ hashClean: true, noPrivateQuery: true, pending: true });
    await localIdentity(browser, app, "recipient");
    await expect(screen.getByRole("button", "Ouvrir mon document")).toBeVisible();
    const [claimResponse] = await Promise.all([
      browser.waitForResponse("**/api/personal/documents/claim"),
      screen.getByRole("button", "Ouvrir mon document").tap(),
    ]);
    expect(claimResponse.status).toBe(200);
    const claim = await claimResponse.json<{ id: string; status: string }>();
    expect(claim.id).toBe(prepared.id);
    expect(claim.status).toBe("pending");
    expect(await browser.evaluate(() => sessionStorage.getItem("guteneo.pending-document-invitation.v1") === null)).toBe(true);
    await expect(
      screen.getByText(
        "Votre demande d’accès attend la confirmation de l’atelier.",
      ),
    ).toBeVisible();
    const pendingImage = await browser.evaluate(
      async (id: string) =>
        (await fetch(`/api/personal/documents/${id}/pages/1`)).status,
      prepared.id,
    );
    expect(pendingImage).toBe(404);

    await localIdentity(browser, app, "atelier");
    await app.open(`/#/app/secure-distribution/${prepared.id}`);
    await expect(
      screen.getByRole("button", "Confirmer l’association"),
    ).toBeDisabled();
    await screen
      .getByRole(
        "checkbox",
        "J’ai vérifié que ce compte appartient au destinataire prévu.",
      )
      .check();
    await screen
      .getByLabel("Méthode de vérification")
      .selectOption({ value: "known_relationship" });
    await screen.getByRole("button", "Confirmer l’association").tap();
    await expect
      .poll(
        async () =>
          (await localApi<{ recipientBinding: string }>(browser, path)).body
            .recipientBinding,
      )
      .toBe("confirmed");

    await localIdentity(browser, app, "recipient");
    await app.open(`/#/app/my-documents/${prepared.id}`);
    await screen.getByText("Page 1").scrollIntoView();
    await expect(screen.getByRole("img", /^Page 1\./)).toBeVisible();
    await screen.getByRole("img", /^Page 1\./).scrollIntoView();
    await expect
      .poll(
        async () =>
          (
            await localApi<{ audit: { type: string; provenance: string }[] }>(
              browser,
              `/api/personal/documents/${prepared.id}`,
            )
          ).body.audit.some(
            (event) =>
              event.type === "page_displayed" && event.provenance === "browser",
          ),
        { interval: 500 },
      )
      .toBe(true);
    await app.screenshot("shared-document-reader");
    await screen.getByRole("button", "Télécharger le PDF original").tap();
    const downloaded = await browser.waitForDownload(() =>
      screen.getByRole("button", "Lancer le téléchargement").tap(),
    );
    const digest = (bytes: Uint8Array) =>
      createHash("sha256").update(bytes).digest("hex");
    expect(digest(await readFile(downloaded.absolutePath))).toBe(
      digest(source.bytes),
    );
    await expect(
      screen.getByText(
        "Téléchargement lancé. Guteneo ne peut pas confirmer l’enregistrement sur votre appareil.",
      ),
    ).toBeVisible();
    await screen.getByRole("button", "Conserver une copie").tap();
    const [depositedResponse] = await Promise.all([
      browser.waitForResponse(
        `**/api/personal/documents/${prepared.id}/deposit`,
      ),
      screen.getByRole("button", "Accepter et conserver").tap(),
    ]);
    expect(depositedResponse.status).toBe(200);
    const copy = await depositedResponse.json<{ id: string; status: string }>();
    expect(["active", "preparing"]).toContain(copy.status);
    await expect
      .poll(
        async () =>
          (
            await localApi<{ depositedDocumentId?: string }>(
              browser,
              `/api/personal/documents/${prepared.id}`,
            )
          ).body.depositedDocumentId ?? "",
        { timeout: 45_000, interval: 1_500 },
      )
      .toBe(copy.id);
    await expect(
      screen.getByRole("link", "Ouvrir ma copie personnelle"),
    ).toBeVisible();
    const repeatedCopy = await localApi<{ id: string }>(
      browser,
      `/api/personal/documents/${prepared.id}/deposit`,
      "POST",
      {},
    );
    expect(repeatedCopy.status).toBe(200);
    expect(repeatedCopy.body.id).toBe(copy.id);

    await localIdentity(browser, app, "atelier");
    await app.open(`/#/app/secure-distribution/${prepared.id}`);
    const sharedAudit = (await localApi<Publication>(browser, path)).body.audit;
    expect(
      sharedAudit.some(
        (event) =>
          event.type === "page_displayed" && event.provenance === "browser",
      ),
    ).toBe(true);
    expect(
      sharedAudit.some(
        (event) =>
          event.type === "original_transfer_started" &&
          event.provenance === "server",
      ),
    ).toBe(true);
    expect(
      sharedAudit.some((event) => event.type === "personal_copy_delivered"),
    ).toBe(true);
    await screen.getByRole("button", "Révoquer ce partage").tap();
    await screen.getByRole("button", "Révoquer l’accès").tap();
    await expect
      .poll(
        async () => (await localApi<Publication>(browser, path)).body.status,
      )
      .toBe("revoked");
    const auditAfterRevocation = (await localApi<Publication>(browser, path))
      .body.audit;
    expect(await readSecureCharge(prepared.id)).toEqual(committedCharge);

    await localIdentity(browser, app, "other-recipient");
    expect(
      (
        await localApi<{ error: { code: string } }>(
          browser,
          `/api/personal/documents/${copy.id}`,
        )
      ).status,
    ).toBe(404);
    await localIdentity(browser, app, "recipient");
    const deniedShared = await browser.evaluate(
      async (id: string) => ({
        page: (await fetch(`/api/personal/documents/${id}/pages/1`)).status,
      }),
      prepared.id,
    );
    expect(deniedShared.page).toBe(404);
    await app.open(`/#/app/my-documents/${copy.id}`);
    await expect(
      screen.getByText(
        "Vos consultations de cette copie personnelle ne sont pas communiquées à l’atelier expéditeur.",
      ),
    ).toBeVisible();
    await screen.getByText("Page 1").scrollIntoView();
    await expect(screen.getByRole("img", /^Page 1\./)).toBeVisible();
    await app.screenshot("personal-copy-after-shared-revocation");
    await screen.getByRole("button", "Exporter ma copie").tap();
    const exported = await browser.waitForDownload(() =>
      screen.getByRole("button", "Lancer le téléchargement").tap(),
    );
    expect(digest(await readFile(exported.absolutePath))).toBe(
      digest(source.bytes),
    );
    await localIdentity(browser, app, "atelier");
    expect((await localApi<Publication>(browser, path)).body.audit).toEqual(
      auditAfterRevocation,
    );
    expect(await readSecureCharge(prepared.id)).toEqual(committedCharge);

    await localIdentity(browser, app, "recipient", "weak");
    const weak = await localApi<{ error: { code: string } }>(
      browser,
      `/api/personal/documents/${copy.id}`,
    );
    expect(weak.status).toBe(403);
    expect(weak.body.error.code).toBe("STRONG_AUTHENTICATION_REQUIRED");

    // Re-enter through the owner's category instead of relying on a saved
    // reader URL. Cancelling must preserve the copy; only confirmation removes
    // access, and these private actions never extend the workshop's journal.
    await localIdentity(browser, app, "recipient");
    await screen.getByRole("link", "Copies conservées").tap();
    await expect(
      screen.getByRole("link", "Copies conservées"),
    ).toHaveAttribute("aria-current", "page");
    const retainedCopy = browser.locator(
      `a[href="#/app/my-documents/${copy.id}"]`,
    );
    await expect(retainedCopy).toBeVisible();
    await retainedCopy.tap();
    await expect(browser).toHaveURL(
      new RegExp(`#/app/my-documents/${copy.id}$`),
    );
    await screen.getByRole("button", "Supprimer ma copie").tap();
    await expect(
      screen.getByRole("button", "Confirmer la suppression"),
    ).toBeVisible();
    await screen.getByRole("button", "Ne rien changer").tap();
    await expect(
      screen.getByRole("button", "Confirmer la suppression"),
    ).toHaveCount(0);
    const keptCopy = await localApi<{ status: string; pages: { number: number }[] }>(
      browser,
      `/api/personal/documents/${copy.id}`,
    );
    expect(keptCopy.status).toBe(200);
    expect(keptCopy.body.status).toBe("active");
    expect(keptCopy.body.pages).toHaveLength(4);

    await screen.getByRole("button", "Supprimer ma copie").tap();
    const [deletedResponse, refreshedCopies] = await Promise.all([
      browser.waitForResponse(
        `**/api/personal/documents/${copy.id}/delete`,
      ),
      browser.waitForResponse(
        /\/api\/personal\/documents\?kind=personal(?:&|$)/u,
      ),
      screen.getByRole("button", "Confirmer la suppression").tap(),
    ]);
    expect(deletedResponse.status).toBe(200);
    expect(await deletedResponse.json()).toEqual({ deleted: true });
    expect(refreshedCopies.status).toBe(200);
    const remainingCopies = await refreshedCopies.json<{ items: { id: string }[] }>();
    expect(remainingCopies.items.some((item) => item.id === copy.id)).toBe(false);
    await expect(browser).toHaveURL(/#\/app\/my-documents\?kind=personal$/u);
    await expect(retainedCopy).toHaveCount(0);

    const inaccessibleCopy = await localApi<{ status: string; pages: { number: number }[] }>(
      browser,
      `/api/personal/documents/${copy.id}`,
    );
    // Known ownership metadata remains readable; document content does not.
    expect(inaccessibleCopy.status).toBe(200);
    expect(inaccessibleCopy.body.status).toBe("revoked");
    expect(inaccessibleCopy.body.pages).toEqual([]);
    const deniedCopy = await browser.evaluate(async (id: string) => {
      const session = await fetch("/api/personal/session");
      const current = (await session.json()) as { csrfToken: string };
      const [page, text, download] = await Promise.all([
        fetch(`/api/personal/documents/${id}/pages/1`),
        fetch(`/api/personal/documents/${id}/pages/1/text`),
        fetch(`/api/personal/documents/${id}/download`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": current.csrfToken,
            "Idempotency-Key": crypto.randomUUID(),
          },
          body: "{}",
        }),
      ]);
      return { page: page.status, text: text.status, download: download.status };
    }, copy.id);
    expect(deniedCopy).toEqual({ page: 404, text: 404, download: 404 });
    const [removedReader] = await Promise.all([
      browser.waitForResponse(`**/api/personal/documents/${copy.id}`),
      app.open(`/#/app/my-documents/${copy.id}`),
    ]);
    expect(removedReader.status).toBe(200);
    await expect(
      browser.locator('.secure-document-panel [role="status"]'),
    ).toHaveText("Accès révoqué");
    await expect(browser.locator(".secure-document-pages")).toHaveCount(0);
    await expect(screen.getByRole("button", "Exporter ma copie")).toHaveCount(0);
    await expect(screen.getByRole("button", "Supprimer ma copie")).toHaveCount(0);
    await app.screenshot("personal-copy-access-after-deletion");

    await localIdentity(browser, app, "atelier");
    const unchangedShare = (await localApi<Publication>(browser, path)).body;
    expect(unchangedShare.status).toBe("revoked");
    expect(unchangedShare.audit).toEqual(auditAfterRevocation);
    expect(await readSecureCharge(prepared.id)).toEqual(committedCharge);
  },
);
