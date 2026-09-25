import Papa from "papaparse";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import previewStamp from "./assets/guteneo-stamp-preview.jpg?inline";
import type {
  Channel,
  Dispatch,
  DispatchDetail,
  DocumentRecord,
  Session,
} from "./api";
import type { WelcomeCredit } from "./credit-balance";
import {
  DISPATCH_GROUPS,
  isDispatchGroup,
  type DispatchOverview,
} from "../../../packages/contracts/src/dispatch-groups";
import {
  faxNumberProblem,
  normalizeFaxNumber,
} from "../../../packages/contracts/src/fax-number";

// This isolated design model has no transport or storage. It is never the
// authenticated API, the domain simulator, or evidence of provider delivery.
export class PreviewError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
type RequestOptions = {
  method?: string;
  body?: unknown;
  key?: string;
  signal?: AbortSignal;
};
type Campaign = {
  id: string;
  name: string;
  status: string;
  created_at: string;
  updated_at: string;
};
type Workspace = {
  documents: DocumentRecord[];
  contents: Map<string, Uint8Array>;
  dispatches: DispatchDetail[];
  campaigns: Campaign[];
  enabled: Record<Channel, boolean>;
  keys: Map<string, { input: string; result: unknown }>;
};
const channels: Channel[] = ["email", "fax", "postal"];
const now = () => new Date().toISOString();
const copy = <T>(value: T): T => structuredClone(value);
const page = <T>(items: T[]) => ({ items, nextCursor: null });
const fail = (code: string, message: string, status = 400): never => {
  throw new PreviewError(code, message, status);
};

function previewCredit(state: Workspace): WelcomeCredit {
  const spentMinor = state.dispatches.reduce(
    (total, { dispatch }) =>
      total +
      (["submitted", "delivered"].includes(dispatch.status)
        ? dispatch.estimated_minor
        : 0),
    0,
  );
  const reservedMinor = state.dispatches.reduce(
    (total, { dispatch }) =>
      total +
      (["queued", "submitting", "submission_unknown"].includes(dispatch.status)
        ? dispatch.ceiling_minor
        : 0),
    0,
  );
  return {
    kind: "simulation",
    currency: "EUR",
    grantedMinor: 5000,
    reservedMinor,
    spentMinor,
    availableMinor: Math.max(0, 5000 - reservedMinor - spentMinor),
    grantedAt: null,
    status: "simulation",
    renewal: "none",
    topUpAvailable: false,
  };
}

function recipient(channel: Channel, input: Record<string, unknown>) {
  const text = (key: string) => String(input[key] ?? "").trim();
  if (channel === "email") {
    const email = text("email").toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      fail(
        "INVALID_EMAIL",
        "Indiquez une adresse e-mail valide pour cet exemple.",
      );
    return { email };
  }
  if (channel === "fax") {
    const phone = normalizeFaxNumber(text("phone"));
    const problem = faxNumberProblem(phone);
    if (problem) fail("INVALID_PHONE", problem);
    return { phone };
  }
  const result: Record<string, string> = {};
  for (const key of ["name", "line1", "postalCode", "city", "country"]) {
    result[key] = text(key);
    if (!result[key] || result[key].length > 160)
      fail(
        "INVALID_ADDRESS",
        "Complétez les cinq champs de l’adresse postale.",
      );
  }
  result.country = result.country.toUpperCase();
  if (!["FR", "LU", "DE"].includes(result.country))
    fail(
      "COUNTRY_NOT_ALLOWED",
      "Pays disponibles : France, Luxembourg et Allemagne.",
    );
  return result;
}

function validateCsv(csv: string) {
  if (new TextEncoder().encode(csv).length > 256 * 1024)
    fail("CSV_TOO_LARGE", "Maximum 256 Ko par exemple CSV.");
  const parsed = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
  });
  const allowed = [
    "channel",
    "email",
    "phone",
    "name",
    "line1",
    "postalCode",
    "city",
    "country",
  ];
  if (
    !parsed.meta.fields?.includes("channel") ||
    parsed.meta.fields.some((field) => !allowed.includes(field))
  )
    fail("INVALID_CSV_HEADERS", `Colonnes autorisées : ${allowed.join(", ")}.`);
  if (parsed.data.length > 500)
    fail("CAMPAIGN_TOO_LARGE", "Maximum 500 lignes par exemple.");
  const errors = parsed.errors.map((error) => ({
    line: (error.row ?? 0) + 2,
    message: error.message,
  }));
  const rows: {
    line: number;
    channel: Channel;
    recipient: Record<string, string>;
  }[] = [];
  const duplicates: { line: number; duplicateOf: number }[] = [];
  const seen = new Map<string, number>();
  parsed.data.forEach((row, index) => {
    const line = index + 2;
    try {
      if (
        Object.values(row).some(
          (value) =>
            /^[\s]*[=+@-]/.test(value) && !/^\+\d[\d ()-]*$/.test(value),
        )
      )
        fail("CSV_FORMULA", "Formule CSV interdite.");
      const channel = row.channel?.trim().toLowerCase() as Channel;
      if (!channels.includes(channel))
        fail("INVALID_CHANNEL", "Canal inconnu.");
      const target = recipient(channel, row);
      const key = JSON.stringify({ channel, target });
      const previous = seen.get(key);
      if (previous !== undefined)
        duplicates.push({ line, duplicateOf: previous });
      else seen.set(key, line);
      rows.push({ line, channel, recipient: target });
    } catch (error) {
      errors.push({
        line,
        message: error instanceof Error ? error.message : "Ligne invalide.",
      });
    }
  });
  return {
    rows,
    errors,
    duplicates,
    valid: errors.length === 0 && duplicates.length === 0,
  };
}

async function fixturePdf(title: string) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${title} — Document fictif`);
  pdf.setAuthor("Guteneo — aperçu de design");
  pdf.setCreationDate(new Date("2026-09-16T08:00:00Z"));
  pdf.setModificationDate(new Date("2026-09-16T08:00:00Z"));
  const sheet = pdf.addPage([595.28, 841.89]);
  const serif = await pdf.embedFont(StandardFonts.TimesRoman);
  const sans = await pdf.embedFont(StandardFonts.Helvetica);
  const ink = rgb(0.12, 0.13, 0.12);
  const blue = rgb(0.14, 0.31, 0.86);
  const stamp = await pdf.embedJpg(previewStamp);
  sheet.drawImage(stamp, { x: 56, y: 728, width: 72, height: 72 });
  sheet.drawLine({
    start: { x: 56, y: 710 },
    end: { x: 539, y: 710 },
    thickness: 0.7,
    color: blue,
  });
  sheet.drawText(title, { x: 56, y: 665, size: 30, font: serif, color: ink });
  const lines = [
    "Atelier Gutenberg",
    "Document de démonstration",
    "",
    "Madame, Monsieur,",
    "",
    "Ce courrier fictif vous permet de découvrir la préparation",
    "et le suivi d’un document dans Guteneo.",
    "",
    "Vous pouvez examiner ce PDF, choisir un canal et parcourir",
    "les étapes de validation. Aucun envoi réel n’est effectué.",
    "",
    "Toutes les coordonnées et références présentées sont fictives.",
    "",
    "Bien cordialement,",
    "L’atelier Guteneo",
  ];
  lines.forEach((line, index) =>
    sheet.drawText(line, {
      x: 56,
      y: 604 - index * 22,
      size: 12,
      font: sans,
      color: ink,
    }),
  );
  sheet.drawLine({
    start: { x: 56, y: 100 },
    end: { x: 539, y: 100 },
    thickness: 0.5,
    color: blue,
  });
  sheet.drawText("EXEMPLE FICTIF · APERÇU DE DESIGN · AUCUN ENVOI", {
    x: 56,
    y: 78,
    size: 9,
    font: sans,
    color: blue,
  });
  return new Uint8Array(await pdf.save());
}

async function createWorkspace(slug: string): Promise<Workspace> {
  const documents: DocumentRecord[] = [];
  const contents = new Map<string, Uint8Array>();
  for (const [index, title] of [
    "Votre courrier",
    "Invitation à l’atelier",
  ].entries()) {
    const bytes = await fixturePdf(title);
    const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
    const id = `preview_${slug}_document_${index + 1}`;
    documents.push({
      id,
      name: `${title} · exemple.pdf`,
      sha256: Array.from(new Uint8Array(digest), (b) =>
        b.toString(16).padStart(2, "0"),
      ).join(""),
      size: bytes.length,
      pages: 1,
      status: "ready",
      source: "render",
      created_at: now(),
    });
    contents.set(id, bytes);
  }
  const campaign: Campaign = {
    id: `preview_${slug}_campaign`,
    name: "Les nouvelles de l’atelier · exemple",
    status: "prepared",
    created_at: now(),
    updated_at: now(),
  };
  const samples: {
    channel: Channel;
    status: string;
    recipient: Record<string, string>;
    subject?: string;
  }[] = [
    {
      channel: "email",
      status: "prepared",
      recipient: { email: "camille@example.invalid" },
      subject: "Une nouvelle de l’atelier",
    },
    {
      channel: "postal",
      status: "submitted",
      recipient: {
        name: "Maison Papier · fictive",
        line1: "12 rue de l’Exemple",
        postalCode: "75002",
        city: "Paris",
        country: "FR",
      },
    },
    {
      channel: "fax",
      status: "delivered",
      recipient: { phone: "+33100000000" },
    },
    {
      channel: "email",
      status: "delivered",
      recipient: { email: "studio@example.invalid" },
      subject: "Votre invitation",
    },
    {
      channel: "fax",
      status: "submission_unknown",
      recipient: { phone: "+33100000001" },
    },
  ];
  const dispatches = samples.map((sample, index): DispatchDetail => {
    const created = new Date(
      Date.now() - (index + 1) * 3_600_000,
    ).toISOString();
    const dispatch: Dispatch = {
      id: `preview_${slug}_dispatch_${index + 1}`,
      channel: sample.channel,
      recipient_json: sample.recipient,
      document_id: documents[index % 2].id,
      subject: sample.subject,
      html:
        sample.channel === "email"
          ? "<h1>Les nouvelles de l’atelier</h1><p>Bonjour Camille,</p><p>Votre document est prêt. Cet exemple vous invite à parcourir Guteneo.</p><p>À bientôt,<br>L’atelier Gutenberg</p>"
          : undefined,
      text:
        sample.channel === "email"
          ? "Bonjour Camille, votre document est prêt. Ceci est un exemple fictif."
          : undefined,
      sender_address:
        sample.channel === "email"
          ? `${slug}@example.invalid`
          : "Expéditeur fictif · simulation",
      status: sample.status,
      mode: "simulation",
      estimated_minor:
        sample.channel === "email" ? 1 : sample.channel === "fax" ? 12 : 145,
      ceiling_minor: 500,
      currency: "EUR",
      fingerprint: `preview-fixture-${slug}-${index + 1}`,
      created_at: created,
      updated_at: created,
      campaign_id: index < 2 ? campaign.id : undefined,
    };
    return {
      dispatch,
      approval: null,
      events: [
        {
          id: `${dispatch.id}_prepared`,
          type: "prepared",
          created_at: created,
          detail: "Exemple fictif chargé dans votre navigateur.",
        },
        ...(sample.status === "prepared"
          ? []
          : [
              {
                id: `${dispatch.id}_outcome`,
                type: sample.status,
                created_at: created,
                detail:
                  "État illustratif de l’aperçu : aucun fournisseur contacté.",
              },
            ]),
      ],
      attempts:
        sample.status === "prepared"
          ? []
          : [
              {
                id: `${dispatch.id}_attempt`,
                provider: "Scénario fictif du navigateur",
                status: sample.status,
                created_at: created,
              },
            ],
    };
  });
  return {
    documents,
    contents,
    dispatches,
    campaigns: [campaign],
    enabled: { email: true, fax: true, postal: true },
    keys: new Map(),
  };
}

export function createPreviewApi() {
  let organization: "atelier" | "studio" | null = "atelier";
  const workspaces = new Map<string, Promise<Workspace>>();
  const workspace = () => {
    if (!organization)
      fail(
        "UNAUTHENTICATED",
        "Ouvrez un atelier de démonstration pour continuer.",
        401,
      );
    const slug = organization!;
    if (!workspaces.has(slug)) workspaces.set(slug, createWorkspace(slug));
    return workspaces.get(slug)!;
  };
  async function request(
    path: string,
    init: RequestOptions = {},
  ): Promise<unknown> {
    init.signal?.throwIfAborted();
    const method = init.method ?? "GET";
    const route = path.split("?")[0];
    const body = (init.body ?? {}) as Record<string, unknown>;
    if (route === "/dev/login" && method === "POST") {
      organization = body.organization === "studio" ? "studio" : "atelier";
      return { ok: true, simulation: true };
    }
    if (route === "/logout" && method === "POST") {
      organization = null;
      workspaces.clear();
      return { ok: true };
    }
    if (!organization)
      fail(
        "UNAUTHENTICATED",
        "Ouvrez un atelier de démonstration pour continuer.",
        401,
      );
    if (route === "/session" && method === "GET") {
      return {
        organization: {
          id: `preview_${organization}`,
          name:
            organization === "atelier"
              ? "Atelier Gutenberg · Démo"
              : "Studio Papier · Démo",
        },
        user: {
          id: `preview_user_${organization}`,
          name: "Camille · Démonstration",
          role: "admin",
        },
        csrfToken: "browser-preview-no-server-session",
        simulation: true,
      } satisfies Session;
    }
    if (
      ["/documents", "/documents/render"].includes(route) &&
      method === "POST"
    )
      fail(
        "PREVIEW_DOCUMENTS_UNAVAILABLE",
        "L’aperçu utilise deux PDF fictifs prêts à explorer. L’import et le rendu HTML sont réservés à l’application complète ; aucun fichier n’a été téléversé.",
      );
    const state = await workspace();
    init.signal?.throwIfAborted();
    const input = JSON.stringify({ route, method, body });
    const cached = init.key && state.keys.get(init.key);
    if (cached) {
      if (cached.input !== input)
        fail(
          "IDEMPOTENCY_CONFLICT",
          "Cet exemple a déjà été préparé avec un autre contenu.",
          409,
        );
      return copy(cached.result);
    }
    const remember = (result: unknown) => {
      if (init.key) state.keys.set(init.key, { input, result: copy(result) });
      return copy(result);
    };
    if (method === "GET") {
      if (route === "/billing")
        return { welcomeCredit: previewCredit(state), topUpAvailable: false };
      if (route === "/documents") return copy(page(state.documents));
      if (route === "/dispatches") {
        const group = new URLSearchParams(path.split("?")[1]).get("group");
        if (group !== null && !isDispatchGroup(group))
          fail("INVALID_GROUP", "Filtre d’envois inconnu.");
        const members: readonly string[] | undefined =
          group === null
            ? undefined
            : DISPATCH_GROUPS[group as keyof typeof DISPATCH_GROUPS];
        return copy(
          page(
            state.dispatches
              .map((detail) => detail.dispatch)
              .filter(
                (dispatch) => !members || members.includes(dispatch.status),
              ),
          ),
        );
      }
      if (route === "/overview") {
        const dispatches: DispatchOverview["dispatches"] = {
          total: state.dispatches.length,
          approval: 0,
          in_progress: 0,
          attention: 0,
          done: 0,
        };
        for (const { dispatch } of state.dispatches)
          for (const [group, members] of Object.entries(DISPATCH_GROUPS))
            if ((members as readonly string[]).includes(dispatch.status))
              dispatches[group as keyof typeof DISPATCH_GROUPS] += 1;
        return {
          documents: state.documents.length,
          dispatches,
        } satisfies DispatchOverview;
      }
      if (route === "/campaigns") return copy(page(state.campaigns));
      if (route === "/senders")
        return page(
          channels.map((channel) => ({
            id: `preview_${organization}_${channel}`,
            name: "Atelier · exemple fictif",
            channel,
            address:
              channel === "email"
                ? `${organization}@example.invalid`
                : "Coordonnées fictives · aucun envoi",
            status: "verified",
            mode: "simulation",
          })),
        );
      if (route === "/connections") return page([]);
      if (route === "/capabilities")
        return {
          aperçu: "Modèle interactif dans ce navigateur",
          données: "Fictives ; réinitialisées en rechargeant la page",
          envois_réels: false,
          API_hébergée: false,
          connexion_assistant: "Non disponible dans cet aperçu",
          import_documents: "Non disponible dans cet aperçu",
        };
      if (route === "/admin")
        return {
          mode: "Aperçu de design · scénarios fictifs",
          envois_réels: false,
          stockage: "Mémoire de cet onglet uniquement",
          controls: channels.map((channel) => ({
            channel,
            enabled: Number(state.enabled[channel]),
          })),
          deadLetters: [],
        };
      if (route === "/usage")
        return {
          ...page(
            channels.map((channel) => {
              const consumed = state.dispatches.filter(
                (detail) =>
                  detail.dispatch.channel === channel &&
                  ["delivered", "submitted"].includes(detail.dispatch.status),
              );
              const reserved = state.dispatches.filter(
                (detail) =>
                  detail.dispatch.channel === channel &&
                  detail.dispatch.status === "submission_unknown",
              );
              return {
                channel,
                period: new Date().toISOString().slice(0, 7),
                mode: "simulation",
                limit_count: 100,
                limit_minor: 50000,
                reserved_count: reserved.length,
                reserved_minor: reserved.reduce(
                  (total, detail) => total + detail.dispatch.estimated_minor,
                  0,
                ),
                confirmed_count: consumed.length,
                confirmed_minor: consumed.reduce(
                  (total, detail) => total + detail.dispatch.estimated_minor,
                  0,
                ),
                currency: "EUR",
              };
            }),
          ),
          welcomeCredit: previewCredit(state),
        };
      const detail = route.match(/^\/dispatches\/([^/]+)$/);
      if (detail)
        return copy(
          state.dispatches.find(
            (entry) => entry.dispatch.id === decodeURIComponent(detail[1]),
          ) ??
            fail(
              "NOT_FOUND",
              "Cet envoi ne se trouve pas dans cet atelier fictif.",
              404,
            ),
        );
      const campaign = route.match(/^\/campaigns\/([^/]+)$/);
      if (campaign) {
        const item =
          state.campaigns.find(
            (entry) => entry.id === decodeURIComponent(campaign[1]),
          ) ??
          fail(
            "NOT_FOUND",
            "Campagne introuvable dans cet atelier fictif.",
            404,
          );
        return copy({
          campaign: item,
          dispatches: state.dispatches
            .filter((entry) => entry.dispatch.campaign_id === item.id)
            .map((entry) => entry.dispatch),
        });
      }
    }
    if (route === "/recipients/validate" && method === "POST")
      return validateCsv(String(body.csv ?? ""));
    if (route === "/campaigns" && method === "POST") {
      const name = String(body.name ?? "").trim();
      if (!name || name.length > 120)
        fail(
          "INVALID_NAME",
          "Indiquez un nom de campagne de 1 à 120 caractères.",
        );
      if (state.campaigns.length >= 20)
        fail(
          "PREVIEW_LIMIT",
          "L’aperçu est limité à 20 campagnes. Rechargez pour recommencer.",
        );
      const campaign = {
        id: `preview_campaign_${crypto.randomUUID()}`,
        name,
        status: "prepared",
        created_at: now(),
        updated_at: now(),
      };
      state.campaigns.unshift(campaign);
      return remember(campaign);
    }
    if (route === "/dispatches" && method === "POST") {
      const channel = body.channel as Channel;
      if (!channels.includes(channel))
        fail("INVALID_CHANNEL", "Choisissez un canal disponible.");
      if (!state.enabled[channel])
        fail(
          "CHANNEL_PAUSED",
          "Ce canal est en pause dans votre aperçu. Réactivez-le dans Administration.",
          409,
        );
      if (state.dispatches.length >= 550)
        fail(
          "PREVIEW_LIMIT",
          "L’aperçu est complet. Rechargez la page pour réinitialiser ses exemples.",
        );
      const target = recipient(
        channel,
        (body.recipient ?? {}) as Record<string, unknown>,
      );
      const documentId = body.documentId ? String(body.documentId) : undefined;
      if (
        documentId &&
        !state.documents.some((entry) => entry.id === documentId)
      )
        fail(
          "DOCUMENT_NOT_FOUND",
          "Choisissez un document de cet atelier fictif.",
          404,
        );
      if (channel !== "email" && !documentId)
        fail("DOCUMENT_REQUIRED", "Choisissez l’un des PDF fictifs.");
      if (channel === "email" && (!body.subject || !body.html || !body.text))
        fail(
          "EMAIL_REQUIRED",
          "Complétez l’objet, le contenu HTML et la version texte.",
        );
      if (
        [body.html, body.text].some(
          (value) => typeof value === "string" && value.length > 128 * 1024,
        )
      )
        fail("CONTENT_TOO_LARGE", "Le contenu dépasse la limite de l’aperçu.");
      const campaignId = body.campaignId ? String(body.campaignId) : undefined;
      if (
        campaignId &&
        !state.campaigns.some((entry) => entry.id === campaignId)
      )
        fail(
          "CAMPAIGN_NOT_FOUND",
          "Choisissez une campagne de cet atelier fictif.",
          404,
        );
      const estimate = channel === "email" ? 1 : channel === "fax" ? 12 : 145;
      const ceiling = Number(body.ceilingMinor);
      if (!Number.isSafeInteger(ceiling) || ceiling < estimate)
        fail(
          "COST_CEILING",
          "Le plafond fictif doit couvrir l’estimation de cet exemple.",
        );
      const dispatch: Dispatch = {
        id: `preview_dispatch_${crypto.randomUUID()}`,
        channel,
        recipient_json: target,
        document_id: documentId,
        campaign_id: campaignId,
        subject: channel === "email" ? String(body.subject) : undefined,
        html: channel === "email" ? String(body.html) : undefined,
        text: channel === "email" ? String(body.text) : undefined,
        sender_address:
          channel === "email"
            ? `${organization}@example.invalid`
            : "Expéditeur fictif · simulation",
        status: "prepared",
        mode: "simulation",
        estimated_minor: estimate,
        ceiling_minor: ceiling,
        currency: "EUR",
        fingerprint: `preview-${crypto.randomUUID()}`,
        created_at: now(),
        updated_at: now(),
      };
      state.dispatches.unshift({
        dispatch,
        approval: null,
        events: [
          {
            id: crypto.randomUUID(),
            type: "prepared",
            created_at: now(),
            detail: "Préparation fictive dans cet onglet. Aucun envoi réel.",
          },
        ],
        attempts: [],
      });
      return remember(dispatch);
    }
    const action = route.match(
      /^\/dispatches\/([^/]+)\/(approve|confirm|cancel)$/,
    );
    if (action && method === "POST") {
      const detail =
        state.dispatches.find(
          (entry) => entry.dispatch.id === decodeURIComponent(action[1]),
        ) ??
        fail("NOT_FOUND", "Envoi introuvable dans cet atelier fictif.", 404);
      const dispatch = detail.dispatch;
      if (dispatch.status !== "prepared")
        fail(
          "INVALID_STATE",
          "Cet exemple n’est plus modifiable. Un résultat incertain ne peut pas être relancé automatiquement.",
          409,
        );
      if (action[2] === "approve") {
        if (body.fingerprint !== dispatch.fingerprint)
          fail(
            "FINGERPRINT_MISMATCH",
            "Le contenu de cet exemple a changé. Actualisez-le avant de valider.",
            409,
          );
        detail.approval = {
          fingerprint: dispatch.fingerprint,
          expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
        };
        detail.events.push({
          id: crypto.randomUUID(),
          type: "approved",
          created_at: now(),
          detail: "Validation du scénario fictif dans le navigateur.",
        });
      } else if (action[2] === "confirm") {
        if (
          !detail.approval ||
          detail.approval.fingerprint !== dispatch.fingerprint ||
          Date.parse(detail.approval.expires_at) <= Date.now()
        )
          fail(
            "APPROVAL_REQUIRED",
            "Examinez puis validez cet exemple avant de lancer sa simulation.",
            409,
          );
        if (!state.enabled[dispatch.channel])
          fail("CHANNEL_PAUSED", "Ce canal est en pause dans l’aperçu.", 409);
        if (dispatch.ceiling_minor > previewCredit(state).availableMinor)
          fail(
            "CREDIT_EXHAUSTED",
            "Le crédit disponible de cet exemple ne couvre pas le plafond de cet envoi.",
            409,
          );
        dispatch.status =
          dispatch.channel === "postal" ? "submitted" : "delivered";
        detail.attempts.push({
          id: crypto.randomUUID(),
          provider: "Scénario fictif du navigateur",
          status: dispatch.status,
          created_at: now(),
        });
        detail.events.push(
          {
            id: crypto.randomUUID(),
            type: "queued",
            created_at: now(),
            detail: "Étape illustrée : mise en attente fictive.",
          },
          {
            id: crypto.randomUUID(),
            type: dispatch.status,
            created_at: now(),
            detail:
              "Résultat illustratif immédiat. Aucun fournisseur contacté, aucun envoi réel.",
          },
        );
      } else {
        dispatch.status = "cancelled";
        detail.approval = null;
        detail.events.push({
          id: crypto.randomUUID(),
          type: "cancelled",
          created_at: now(),
          detail: "Exemple annulé dans cet onglet.",
        });
      }
      dispatch.updated_at = now();
      return remember(dispatch);
    }
    const control = route.match(/^\/admin\/channels\/(email|fax|postal)$/);
    if (control && method === "POST") {
      state.enabled[control[1] as Channel] = body.enabled === true;
      return { ok: true, simulation: true };
    }
    fail(
      "PREVIEW_UNAVAILABLE",
      "Cette opération nécessite l’application complète. L’aperçu public conserve uniquement des scénarios fictifs dans votre navigateur.",
      501,
    );
  }
  async function documentContent(id: string) {
    const state = await workspace();
    const bytes =
      state.contents.get(id) ??
      fail(
        "DOCUMENT_NOT_FOUND",
        "Ce PDF ne se trouve pas dans cet atelier fictif.",
        404,
      );
    return new Uint8Array(bytes);
  }
  return { request, documentContent };
}

export const publicPreview = createPreviewApi();
