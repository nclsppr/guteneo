import {
  expect,
  localApi,
  loginWorkshop,
  test,
  uploadSyntheticPdf,
} from "./fixtures";

test(
  "the workshop sees retention prices and the non-refundable commitment before preparing a share",
  { timeout: 120_000 },
  async ({ app, screen, browser }) => {
    await loginWorkshop(app, screen);
    const source = await uploadSyntheticPdf(app, screen, browser);
    await app.open("/#/app/secure-distributions/new");
    await expect(
      screen.getByRole("heading", "Nouveau partage sécurisé"),
    ).toBeVisible();
    await screen.getByLabel("PDF vérifié").selectOption({ value: source.id });
    await screen
      .getByLabel("Nom du destinataire")
      .fill("Destinataire de simulation");
    await screen
      .getByLabel("Adresse e-mail du destinataire")
      .fill("recipient@example.test");
    await expect(screen.getByLabel("Durée de l’accès partagé")).toHaveValue(
      "30",
    );
    await expect(screen.getByText(/Conservation : 0,99/)).toBeVisible();
    await expect(
      screen.getByRole(
        "checkbox",
        /Autoriser le téléchargement du PDF original/,
      ),
    ).not.toBeChecked();
    await expect(
      screen.getByRole("checkbox", /Autoriser une copie personnelle conservée/),
    ).not.toBeChecked();
    await screen
      .getByLabel("Durée de l’accès partagé")
      .selectOption({ value: "365" });
    await expect(screen.getByText(/Conservation : 4,99/)).toBeVisible();
    await screen
      .getByRole("checkbox", /Autoriser une copie personnelle conservée/)
      .check();
    await expect(screen.getByText(/Conservation : 6,98/)).toBeVisible();
    await screen
      .getByLabel("Durée de la copie personnelle")
      .selectOption({ value: "1095" });
    await expect(screen.getByText(/Conservation : 9,98/)).toBeVisible();
    await expect(
      screen.getByText(
        "La période activée est due en totalité, même après révocation du document.",
        { exact: false },
      ),
    ).toBeVisible();
    const [preparedResponse] = await Promise.all([
      browser.waitForResponse("**/api/secure-distributions"),
      screen.getByRole("button", "Préparer et vérifier le partage").tap(),
    ]);
    expect(preparedResponse.status).toBe(201);
    const prepared = await preparedResponse.json<{ id: string }>();
    await expect(browser).toHaveURL(
      new RegExp(`#/app/secure-distribution/${prepared.id}`),
    );
    const publication = await localApi<{
      status: string;
      policy: {
        retentionDays: number;
        personalRetentionDays: number;
        allowOriginalDownload: boolean;
        allowVaultDeposit: boolean;
      };
      quote: {
        sharedMinor: number;
        personalMinor: number;
        totalMinor: number;
        nonRefundable: boolean;
      };
    }>(browser, `/api/secure-distributions/${prepared.id}`);
    expect(publication.status).toBe(200);
    expect(publication.body.policy).toMatchObject({
      retentionDays: 365,
      personalRetentionDays: 1095,
      allowOriginalDownload: false,
      allowVaultDeposit: true,
    });
    expect(publication.body.quote.sharedMinor).toBe(499);
    expect(publication.body.quote.personalMinor).toBe(499);
    expect(publication.body.quote.totalMinor).toBeGreaterThanOrEqual(998);
    expect(publication.body.quote.nonRefundable).toBe(true);
    await expect
      .poll(
        async () =>
          (
            await localApi<{ status: string; dispatchId: string | null }>(
              browser,
              `/api/secure-distributions/${prepared.id}`,
            )
          ).body,
        { timeout: 45_000, interval: 1_500 },
      )
      .toMatchObject({ status: "prepared", dispatchId: expect.any(String) });
    await browser.reload();
    await expect(
      screen.getByRole("button", /^Simuler l’envoi pour /u),
    ).toBeDisabled();
  },
);
