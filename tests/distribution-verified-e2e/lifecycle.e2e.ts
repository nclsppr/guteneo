import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  expect, localApi, readSecureCharge, resetRecipientWorkspaceFixture,
  test, uploadSyntheticPdf,
} from "../distribution-e2e/fixtures";
import { normalIdentity } from "./fixtures";

type Publication = {
  id: string; dispatchId: string | null; status: string; recipientBinding: string;
  approved: boolean; quote: { sharedMinor: number; personalMinor: number };
  audit: { type: string; provenance: string }[];
};

test.beforeEach(async ({ localOnly }) => {
  void localOnly;
  await resetRecipientWorkspaceFixture();
});

test("verified accounts with no strong proof complete sharing, automatic verified-address access and an independent personal copy", { timeout: 180000 }, async ({ app, screen, browser }) => {
  await app.open("/#/app");
  await normalIdentity(browser, app, "atelier");
  const source = await uploadSyntheticPdf(app, screen, browser, 2);
  await app.open("/#/app/secure-distributions/new");
  await screen.getByLabel("PDF vérifié").selectOption({ value: source.id });
  await screen.getByLabel("Nom du destinataire").fill("Destinataire synthétique");
  await screen.getByLabel("Adresse e-mail du destinataire").fill("recipient@example.test");
  // The independent copy remains exportable even without a shared-original right.
  await screen.getByRole("checkbox", /Autoriser une copie personnelle conservée/u).check();
  const [preparation] = await Promise.all([
    browser.waitForResponse("**/api/secure-distributions"),
    screen.getByRole("button", "Préparer et vérifier le partage").tap(),
  ]);
  expect(preparation.status).toBe(201);
  const prepared = await preparation.json<{ id: string }>();
  const path = `/api/secure-distributions/${prepared.id}`;
  await expect.poll(async () => (await localApi<Publication>(browser, path)).body.status, { timeout: 45000, interval: 1500 }).toBe("prepared");
  expect(await readSecureCharge(prepared.id)).toEqual([]);
  await browser.reload();
  await expect(screen.getByRole("button", "Approuver ce partage")).toBeDisabled();
  await screen.getByRole("checkbox", "J’ai vérifié le document, le destinataire, les droits et le prix.").check();
  await screen.getByRole("checkbox", "Je confirme que ce destinataire a demandé cet e-mail et son document. Cet envoi ne constitue pas une prospection.").check();
  await screen.getByRole("button", "Approuver ce partage").tap();
  await screen.getByRole("button", "Activer le partage").tap();
  await screen.getByRole("button", "Confirmer l’activation").tap();
  await expect.poll(async () => (await localApi<Publication>(browser, path)).body.status).toBe("active");
  const publication = (await localApi<Publication>(browser, path)).body;
  const charge = await readSecureCharge(prepared.id);
  expect(charge).toEqual([{ amount_minor: publication.quote.sharedMinor + publication.quote.personalMinor, evidence: "simulation" }]);

  // Only this browser handles the opaque invitation. It never reaches a test
  // assertion/report or a Node-side argument; the real UI scrubs its fragment.
  const invitationStored = await browser.evaluate(async (dispatchId: string) => {
    const response = await fetch(`/api/dispatches/${encodeURIComponent(dispatchId)}`);
    const message = (await response.json()) as { dispatch: { text: string } };
    const token = message.dispatch.text.match(/[?&]invitation=([a-f0-9]{64})/u)?.[1];
    if (!token) throw new Error("The local invitation is missing.");
    location.hash = `/app/my-documents?invitation=${token}`;
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline && location.hash.includes("invitation="))
      await new Promise((resolve) => setTimeout(resolve, 20));
    const pending = JSON.parse(sessionStorage.getItem("guteneo.pending-document-invitation.v1") ?? "null") as { token?: string } | null;
    return pending?.token === token && !location.hash.includes(token);
  }, publication.dispatchId!);
  expect(invitationStored).toBe(true);
  await normalIdentity(browser, app, "recipient");
  await expect(screen.getByRole("button", "Ouvrir mon document")).toBeVisible();
  const [claimResponse] = await Promise.all([
    browser.waitForResponse("**/api/personal/documents/claim"),
    screen.getByRole("button", "Ouvrir mon document").tap(),
  ]);
  expect(claimResponse.status).toBe(200);
  const claim = await claimResponse.json<{ id: string; status: string }>();
  expect(claim.id).toBe(prepared.id);
  expect(claim.status).toBe("active");
  await expect(screen.getByText("Votre demande d’accès attend la confirmation de l’atelier.")).toHaveCount(0);
  await app.open(`/#/app/my-documents/${prepared.id}`);
  await browser.locator(".secure-document-pages > figure:first-child").scrollIntoView();
  await expect(screen.getByRole("img", /^Page 1\./u)).toBeVisible();
  await expect(screen.getByRole("button", "Télécharger le PDF original")).toHaveCount(0);
  const original = await localApi(browser, `/api/personal/documents/${prepared.id}/download`, "POST", {});
  expect(original.status).toBe(403);
  await screen.getByRole("button", "Conserver une copie").tap();
  const [deposited] = await Promise.all([
    browser.waitForResponse(`**/api/personal/documents/${prepared.id}/deposit`),
    screen.getByRole("button", "Accepter et conserver").tap(),
  ]);
  expect(deposited.status).toBe(200);
  const copy = await deposited.json<{ id: string }>();
  await expect.poll(async () => (await localApi<{ depositedDocumentId?: string }>(browser, `/api/personal/documents/${prepared.id}`)).body.depositedDocumentId ?? "", { timeout: 45000, interval: 1500 }).toBe(copy.id);
  const repeated = await localApi<{ id: string }>(browser, `/api/personal/documents/${prepared.id}/deposit`, "POST", {});
  expect(repeated.status).toBe(200);
  expect(repeated.body.id).toBe(copy.id);
  await screen.getByRole("link", "Ouvrir ma copie personnelle").tap();
  await expect(screen.getByText("Vos consultations de cette copie personnelle ne sont pas communiquées à l’atelier expéditeur.")).toBeVisible();
  await screen.getByRole("button", "Exporter ma copie").tap();
  const downloaded = await browser.waitForDownload(() => screen.getByRole("button", "Lancer le téléchargement").tap());
  const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
  expect(digest(await readFile(downloaded.absolutePath))).toBe(digest(source.bytes));
  await app.screenshot("verified-account-personal-copy-without-strong-proof");

  await normalIdentity(browser, app, "other-recipient");
  expect((await localApi(browser, `/api/personal/documents/${copy.id}`)).status).toBe(404);
  await normalIdentity(browser, app, "atelier");
  await app.open(`/#/app/secure-distribution/${prepared.id}`);
  await screen.getByRole("button", "Révoquer ce partage").tap();
  await screen.getByRole("button", "Révoquer l’accès").tap();
  await expect.poll(async () => (await localApi<Publication>(browser, path)).body.status).toBe("revoked");
  expect(await readSecureCharge(prepared.id)).toEqual(charge);
  await normalIdentity(browser, app, "recipient");
  expect((await localApi(browser, `/api/personal/documents/${prepared.id}/pages/1`)).status).toBe(404);
  await app.open(`/#/app/my-documents/${copy.id}`);
  await browser.locator(".secure-document-pages > figure:first-child").scrollIntoView();
  await expect(screen.getByRole("img", /^Page 1\./u)).toBeVisible();
  expect(await browser.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
