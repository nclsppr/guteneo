import Papa from "papaparse";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import previewStamp from "./assets/guteneo-stamp-preview.jpg?inline";
import {
  workspacePermissions,
  type WorkspaceRole,
} from "../../../packages/contracts/src/roles";
import {
  createPreviewData,
  PreviewDataError,
  type PreviewDataCounts,
} from "./preview-data";
import { readPreviewStudio } from "./preview-studio";
import type {
  Channel,
  Dispatch,
  DispatchDetail,
  DocumentRecord,
  Session,
} from "./api";
import type { WelcomeCredit } from "./credit-balance";
import {
  PDF_VALIDATION_PRICE_MINOR,
  PDF_VALIDATION_TERMS_VERSION,
  type PdfValidationPricing,
} from "../../../packages/contracts/src/pdf-validation";
import type {
  UsageActivity,
  UsageActivityDay,
} from "../../../packages/contracts/src/usage-activity";
import {
  DISPATCH_GROUPS,
  isDispatchGroup,
  type DispatchOverview,
} from "../../../packages/contracts/src/dispatch-groups";
import {
  faxNumberProblem,
  normalizeFaxNumber,
} from "../../../packages/contracts/src/fax-number";
import {
  documentEmailDefaults,
  renderTransactionalEmail,
  transactionalEmailText,
} from "../../../packages/contracts/src/email-template";

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
  pendingContents: Map<string, Promise<Uint8Array>>;
  dispatches: DispatchDetail[];
  campaigns: Campaign[];
  enabled: Record<Channel, boolean>;
  keys: Map<string, { input: string; result: unknown }>;
};
const channels: Channel[] = ["email", "fax", "postal"];
const workspaceName = (organization: string) =>
  organization === "atelier"
    ? "Gutenberg workshop · Demo"
    : "Paper Studio · Demo";
const now = () => new Date().toISOString();
const copy = <T>(value: T): T => structuredClone(value);
const page = <T>(items: T[]) => ({ items, nextCursor: null });
const fail = (code: string, message: string, status = 400): never => {
  throw new PreviewError(code, message, status);
};

export const PREVIEW_ACCOUNTS = [
  "admin",
  "supervisor",
  "member",
  "viewer",
  "belvedere",
] as const;
export type PreviewAccount = (typeof PREVIEW_ACCOUNTS)[number];
export type PreviewSimulationConfiguration = {
  account: PreviewAccount;
  seed: string;
  counts: PreviewDataCounts | null;
};

function emptyWorkspace(): Workspace {
  return {
    documents: [],
    contents: new Map(),
    pendingContents: new Map(),
    dispatches: [],
    campaigns: [],
    enabled: { email: true, fax: true, postal: true },
    keys: new Map(),
  };
}

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
      fail("INVALID_EMAIL", "Enter a valid email address for this example.");
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
      fail("INVALID_ADDRESS", "Complete all five postal address fields.");
  }
  result.country = result.country.toUpperCase();
  if (!["FR", "LU", "DE"].includes(result.country))
    fail(
      "COUNTRY_NOT_ALLOWED",
      "Available countries: France, Luxembourg and Germany.",
    );
  return result;
}

function validateCsv(csv: string) {
  if (new TextEncoder().encode(csv).length > 256 * 1024)
    fail("CSV_TOO_LARGE", "Maximum 256 KB per CSV example.");
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
    fail("INVALID_CSV_HEADERS", `Allowed columns: ${allowed.join(", ")}.`);
  if (parsed.data.length > 500)
    fail("CAMPAIGN_TOO_LARGE", "Maximum 500 rows per example.");
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
        fail("CSV_FORMULA", "CSV formulas are not allowed.");
      const channel = row.channel?.trim().toLowerCase() as Channel;
      if (!channels.includes(channel))
        fail("INVALID_CHANNEL", "Unknown delivery channel.");
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
        message: error instanceof Error ? error.message : "Invalid row.",
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
  pdf.setTitle(`${title} — Fictional document`);
  pdf.setAuthor("Guteneo — design preview");
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
    "Gutenberg workshop",
    "Demonstration document",
    "",
    "Dear recipient,",
    "",
    "This fictional letter demonstrates document preparation",
    "and tracking in Guteneo.",
    "",
    "Review this PDF, choose a channel and explore",
    "the approval steps. No real communication is sent.",
    "",
    "All displayed contact details and references are fictional.",
    "",
    "Kind regards,",
    "The Guteneo workshop",
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
  sheet.drawText("FICTIONAL EXAMPLE · DESIGN PREVIEW · NO REAL DISPATCH", {
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
    "Your correspondence",
    "Workshop invitation",
  ].entries()) {
    const bytes = await fixturePdf(title);
    const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
    const id = `preview_${slug}_document_${index + 1}`;
    documents.push({
      id,
      name: `${title} · example.pdf`,
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
    name: "Workshop news · example",
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
      subject: "Workshop news",
    },
    {
      channel: "postal",
      status: "submitted",
      recipient: {
        name: "Paper Company · fictional",
        line1: "12 Example Street",
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
      subject: "Your invitation",
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
          ? "<h1>Workshop news</h1><p>Hello Camille,</p><p>Your document is ready. This example invites you to explore Guteneo.</p><p>Best wishes,<br>The Gutenberg workshop</p>"
          : undefined,
      text:
        sample.channel === "email"
          ? "Hello Camille, your document is ready. This is a fictional example."
          : undefined,
      sender_address:
        sample.channel === "email"
          ? `${slug}@example.invalid`
          : "Fictional sender · simulation",
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
          detail: "Fictional example loaded in your browser.",
        },
        ...(sample.status === "prepared"
          ? []
          : [
              {
                id: `${dispatch.id}_outcome`,
                type: sample.status,
                created_at: created,
                detail: "Illustrative preview state: no provider contacted.",
              },
            ]),
      ],
      attempts:
        sample.status === "prepared"
          ? []
          : [
              {
                id: `${dispatch.id}_attempt`,
                provider: "Fictional browser scenario",
                status: sample.status,
                created_at: created,
              },
            ],
    };
  });
  return {
    documents,
    contents,
    pendingContents: new Map(),
    dispatches,
    campaigns: [campaign],
    enabled: { email: true, fax: true, postal: true },
    keys: new Map(),
  };
}

export function createPreviewApi(options: { advancedLocal?: boolean } = {}) {
  const advancedLocal = options.advancedLocal === true;
  let settings: PreviewSimulationConfiguration = {
    account: "admin",
    seed: "guteneo-local",
    counts: null,
  };
  let scenarioRevision = 0;
  let visitRevision = 0;
  let organization: "atelier" | "studio" | null = "atelier";
  const workspaces = new Map<string, Promise<Workspace>>();
  const generators = new Map<string, ReturnType<typeof createPreviewData>>();
  const role = (): WorkspaceRole =>
    settings.account === "belvedere" ? "viewer" : settings.account;
  const workspaceId = (slug: string) =>
    `preview_${slug}${advancedLocal && scenarioRevision > 0 ? `_scenario_${scenarioRevision}` : ""}`;
  const permissions = () =>
    workspacePermissions(role(), { canApprove: true, canReport: true });
  const generator = () => {
    if (!settings.counts || !organization) return null;
    const key = `${organization}:${scenarioRevision}`;
    if (!generators.has(key))
      generators.set(
        key,
        createPreviewData({
          seed: settings.seed,
          workspace: `preview_${organization}`,
          counts: settings.counts,
          role: role(),
          supervisorCanApprove: true,
          supervisorCanReport: true,
        }),
      );
    return generators.get(key)!;
  };
  const workspace = () => {
    if (!organization)
      fail(
        "UNAUTHENTICATED",
        "Open a demonstration workspace to continue.",
        401,
      );
    const slug = organization!;
    const key = `${slug}:${scenarioRevision}`;
    if (!workspaces.has(key))
      workspaces.set(
        key,
        settings.counts
          ? Promise.resolve(emptyWorkspace())
          : createWorkspace(slug),
      );
    return workspaces.get(key)!;
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
      visitRevision += 1;
      return { ok: true, simulation: true };
    }
    if (route === "/logout" && method === "POST") {
      organization = null;
      workspaces.clear();
      generators.clear();
      scenarioRevision += 1;
      visitRevision += 1;
      return { ok: true };
    }
    if (!organization)
      fail(
        "UNAUTHENTICATED",
        "Open a demonstration workspace to continue.",
        401,
      );
    if (route === "/account/workspace" && method === "POST" && advancedLocal) {
      const target = (["atelier", "studio"] as const).find(
        (slug) => workspaceId(slug) === body.organizationId,
      );
      if (!target)
        fail(
          "NOT_FOUND",
          "Workspace not found in this fictional scenario.",
          404,
        );
      organization = target!;
      visitRevision += 1;
      return request("/session", { signal: init.signal });
    }
    if (route === "/session" && method === "GET") {
      return {
        organization: {
          id: workspaceId(organization!),
          name: workspaceName(organization!),
        },
        user: {
          id: `preview_user_${organization}${settings.account === "admin" ? "" : `_${settings.account}`}`,
          name:
            settings.account === "admin"
              ? "Camille · Demonstration"
              : `${settings.account} · Fictional account`,
          email: `${settings.account}@example.invalid`,
          role: role(),
          supervisorCanApprove: role() === "supervisor",
          supervisorCanReport: role() === "supervisor",
        },
        csrfToken: "browser-preview-no-server-session",
        simulation: true,
        permissions: permissions(),
        ...(advancedLocal && settings.account === "belvedere"
          ? { canAccessBelvedere: true }
          : {}),
      } satisfies Session;
    }
    const rights = permissions();
    if (
      (route.startsWith("/billing") && !rights.manageBilling) ||
      (route.startsWith("/admin") && !rights.manageOrganization) ||
      (route.startsWith("/usage") && !rights.viewReports)
    )
      fail(
        "FORBIDDEN",
        "This fictional account does not have the required workspace permission.",
        403,
      );
    if (method !== "GET") {
      const ownAccount = route === "/account" || route.startsWith("/account/");
      const approval = /^\/dispatches\/[^/]+\/(approve|confirm)$/.test(route);
      if (
        (!ownAccount && !rights.prepareDispatches) ||
        (approval && !rights.approveDispatches)
      )
        fail(
          "FORBIDDEN",
          "This fictional account cannot perform that workspace action.",
          403,
        );
      if (settings.counts && route !== "/recipients/validate")
        fail(
          "PREVIEW_VOLUME_READ_ONLY",
          "Generated volume scenarios contain read-only fictional metadata. Choose the default scenario to explore preparation and simulation.",
          409,
        );
    }
    if (
      ["/documents", "/documents/render"].includes(route) &&
      method === "POST"
    )
      fail(
        "PREVIEW_DOCUMENTS_UNAVAILABLE",
        "The preview provides two fictional PDFs to explore. Import and HTML rendering require the full application; no file was uploaded.",
      );
    const visit = visitRevision;
    const currentOrganization = organization;
    const state = await workspace();
    init.signal?.throwIfAborted();
    if (visit !== visitRevision || currentOrganization !== organization)
      fail(
        "PREVIEW_SCENARIO_CHANGED",
        "The fictional scenario changed. Refresh this view.",
        409,
      );
    const generated = generator();
    const input = JSON.stringify({ route, method, body });
    const cached = init.key && state.keys.get(init.key);
    if (cached) {
      if (cached.input !== input)
        fail(
          "IDEMPOTENCY_CONFLICT",
          "This example was already prepared with different content.",
          409,
        );
      return copy(cached.result);
    }
    const remember = (result: unknown) => {
      if (init.key) state.keys.set(init.key, { input, result: copy(result) });
      return copy(result);
    };
    if (method === "GET") {
      const studio = readPreviewStudio(path, generated, fail);
      if (studio !== undefined) return copy(studio);
      if (route === "/account/workspaces")
        return {
          items: (["atelier", "studio"] as const).map((slug) => ({
            id: workspaceId(slug),
            name: workspaceName(slug),
            role: role(),
            current: slug === organization,
          })),
        };
      if (route === "/account/sessions" || route === "/account/contacts")
        return { items: [], hasMore: false };
      if (route === "/account/expert-approval")
        return {
          canManage: rights.manageExpertDelegation,
          day: now().slice(0, 10),
          connections: [],
        };
      if (route === "/admin/members")
        return page(
          (["admin", "supervisor", "member", "viewer"] as const).map(
            (membership) => ({
              id: `preview_user_${organization}_${membership}`,
              name: `${membership} · Fictional account`,
              email: `${membership}@example.invalid`,
              role: membership,
              supervisorCanApprove: membership === "supervisor",
              supervisorCanReport: membership === "supervisor",
              joinedAt: "2026-10-30T12:00:00.000Z",
              sessions: 0,
              connections: 0,
            }),
          ),
        );
      if (
        route === "/admin/invitations" ||
        route === "/billing/invoices" ||
        route === "/billing/payments"
      )
        return page([]);
      if (route === "/plan")
        fail(
          "MONTHLY_PLAN_RETIRED",
          "Monthly subscriptions are discontinued.",
          410,
        );
      if (route === "/pdf-validation/pricing")
        return {
          enabled: false,
          priceMinor: PDF_VALIDATION_PRICE_MINOR,
          currency: "EUR",
          taxBasis: "excluding_tax",
          termsVersion: PDF_VALIDATION_TERMS_VERSION,
          purchaseAllowed: false,
          paymentSource: "account_credits",
          evidence: "simulation",
          creditAvailableMinor: previewCredit(state).availableMinor,
        } satisfies PdfValidationPricing;
      if (route === "/billing")
        return { welcomeCredit: previewCredit(state), topUpAvailable: false };
      if (route === "/documents") {
        const query = new URLSearchParams(path.split("?")[1]);
        if (query.has("recordNumber")) {
          const ordinal = Number(query.get("recordNumber"));
          if (
            !/^[1-9]\d{0,9}$/.test(query.get("recordNumber") ?? "") ||
            !Number.isSafeInteger(ordinal) ||
            ordinal > 1_000_000_000 ||
            query.has("cursor")
          )
            fail(
              "INVALID_INPUT",
              "Choose one fictional document number between 1 and 1000000000.",
            );
          const record = generated
            ? generated.at("documents", ordinal - 1)
            : state.documents[ordinal - 1];
          const entry =
            record &&
            (state.documents.find((cached) => cached.id === record.id) ??
              record);
          return copy({
            items: entry ? [entry] : [],
            nextCursor: null,
            total: entry ? 1 : 0,
          });
        }
        if (!generated) return copy(page(state.documents));
        const result = generated.page("documents", {
          cursor: query.get("cursor"),
          ...(query.has("limit") ? { limit: Number(query.get("limit")) } : {}),
        });
        result.items = result.items.map(
          (entry) =>
            state.documents.find((cached) => cached.id === entry.id) ?? entry,
        );
        return copy(result);
      }
      const document = route.match(/^\/documents\/([^/]+)$/);
      if (document) {
        const id = decodeURIComponent(document[1]);
        return copy(
          state.documents.find((entry) => entry.id === id) ??
            generated?.get("documents", id) ??
            fail(
              "DOCUMENT_NOT_FOUND",
              "Document not found in this fictional workspace.",
              404,
            ),
        );
      }
      if (route === "/dispatches") {
        const group = new URLSearchParams(path.split("?")[1]).get("group");
        if (group !== null && !isDispatchGroup(group))
          fail("INVALID_GROUP", "Unknown dispatch filter.");
        if (generated) {
          const query = new URLSearchParams(path.split("?")[1]);
          return copy(
            generated.page("dispatches", {
              cursor: query.get("cursor"),
              ...(query.has("limit")
                ? { limit: Number(query.get("limit")) }
                : {}),
              ...(group && isDispatchGroup(group) ? { group } : {}),
            }),
          );
        }
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
        if (generated) return copy(generated.overview());
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
            name: "Workshop · fictional example",
            channel,
            address:
              channel === "email"
                ? `${organization}@example.invalid`
                : "Fictional contact details · no dispatch",
            status: "verified",
            mode: "simulation",
          })),
        );
      if (route === "/connections") return page([]);
      if (route === "/capabilities")
        return {
          preview: "Interactive model in this browser",
          data: "Fictional; reset on page reload",
          real_dispatches: false,
          hosted_api: false,
          assistant_connection: "Unavailable in this preview",
          document_import: "Unavailable in this preview",
        };
      if (route === "/admin")
        return {
          mode: "Design preview · fictional scenarios",
          real_dispatches: false,
          storage: "Memory in this tab only",
          controls: channels.map((channel) => ({
            channel,
            enabled: Number(state.enabled[channel]),
          })),
          deadLetters: [],
        };
      if (route === "/usage/activity") {
        const asOf = now();
        const requestedYear = new URLSearchParams(path.split("?")[1]).get(
          "year",
        );
        if (
          requestedYear !== null &&
          (!/^[1-9]\d{3}$/.test(requestedYear) || Number(requestedYear) > 9998)
        )
          fail("INVALID_INPUT", "Choose a usage year between 1000 and 9998.");
        const currentYear = Number(asOf.slice(0, 4));
        const year = Number(requestedYear ?? currentYear);
        const recorded = state.dispatches.filter(
          ({ dispatch }) =>
            ["submitted", "delivered"].includes(dispatch.status) &&
            dispatch.updated_at <= asOf,
        );
        const grouped = new Map<string, UsageActivityDay>();
        for (const { dispatch } of recorded) {
          if (Number(dispatch.updated_at.slice(0, 4)) !== year) continue;
          const date = dispatch.updated_at.slice(0, 10);
          const day = grouped.get(date) ?? {
            date,
            amountMinor: 0,
            dispatchCount: 0,
            chargeCount: 0,
          };
          day.amountMinor += dispatch.estimated_minor;
          day.dispatchCount += 1;
          day.chargeCount += 1;
          grouped.set(date, day);
        }
        const days = [...grouped.values()].sort((a, b) =>
          a.date.localeCompare(b.date),
        );
        return {
          year,
          currentYear,
          availableYears: [
            ...new Set([
              currentYear,
              ...recorded.map(({ dispatch }) =>
                Number(dispatch.updated_at.slice(0, 4)),
              ),
            ]),
          ].sort((a, b) => b - a),
          asOf,
          timeZone: "UTC",
          currency: "EUR",
          evidence: "simulation",
          days,
          totals: days.reduce(
            (total, day) => ({
              amountMinor: total.amountMinor + day.amountMinor,
              dispatchCount: total.dispatchCount + day.dispatchCount,
              chargeCount: total.chargeCount + day.chargeCount,
              activeDays: total.activeDays + 1,
            }),
            { amountMinor: 0, dispatchCount: 0, chargeCount: 0, activeDays: 0 },
          ),
        } satisfies UsageActivity;
      }
      if (route === "/usage")
        return {
          period: new Date().toISOString().slice(0, 7),
          currentPeriod: new Date().toISOString().slice(0, 7),
          availablePeriods: [new Date().toISOString().slice(0, 7)],
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
          generated?.dispatchDetail(decodeURIComponent(detail[1])) ??
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
        fail("INVALID_NAME", "Enter a campaign name from 1 to 120 characters.");
      if (state.campaigns.length >= 20)
        fail(
          "PREVIEW_LIMIT",
          "The preview is limited to 20 campaigns. Reload to restart.",
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
        fail("INVALID_CHANNEL", "Choose an available channel.");
      if (!state.enabled[channel])
        fail(
          "CHANNEL_PAUSED",
          "This channel is paused in your preview. Enable it in Administration.",
          409,
        );
      if (state.dispatches.length >= 550)
        fail(
          "PREVIEW_LIMIT",
          "The preview is full. Reload the page to reset its examples.",
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
          "Choose a document from this fictional workspace.",
          404,
        );
      if (channel !== "email" && !documentId)
        fail("DOCUMENT_REQUIRED", "Choose one of the fictional PDFs.");
      if (
        [body.html, body.text].some(
          (value) => typeof value === "string" && value.length > 128 * 1024,
        )
      )
        fail("CONTENT_TOO_LARGE", "Content exceeds the preview limit.");
      let emailSubject: string | undefined;
      let emailHtml: string | undefined;
      let emailText: string | undefined;
      if (channel === "email") {
        // Match the draft contract without a server or the production sanitizer.
        // This fictional account has no saved language, so email defaults use French.
        const name = workspaceName(organization!);
        const defaults = documentId
          ? documentEmailDefaults(name, "attachment", "fr")
          : undefined;
        emailSubject =
          (typeof body.subject === "string" && body.subject.trim()) ||
          defaults?.subject;
        const customHtml = typeof body.html === "string" ? body.html : "";
        // Custom HTML remains a visual example; this model does not run the
        // production HTML-to-text sanitizer, so its text alternative is required.
        emailText =
          (typeof body.text === "string" && body.text.trim()) ||
          (customHtml.trim() ? undefined : defaults?.text);
        if (!emailSubject || !emailText)
          return fail("EMAIL_REQUIRED", "Complete the subject and message.");
        emailHtml = customHtml.trim()
          ? customHtml
          : documentId
            ? renderTransactionalEmail({
                text: emailText,
                workspaceName: name,
                locale: "fr",
              })
            : `<p>${emailText.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("\n", "<br>")}</p>`;
        if (documentId && !customHtml.trim())
          emailText = transactionalEmailText({
            text: emailText,
            workspaceName: name,
            locale: "fr",
          });
      }
      const campaignId = body.campaignId ? String(body.campaignId) : undefined;
      if (
        campaignId &&
        !state.campaigns.some((entry) => entry.id === campaignId)
      )
        fail(
          "CAMPAIGN_NOT_FOUND",
          "Choose a campaign from this fictional workspace.",
          404,
        );
      const estimate = channel === "email" ? 1 : channel === "fax" ? 12 : 145;
      const ceiling = Number(body.ceilingMinor);
      if (!Number.isSafeInteger(ceiling) || ceiling < estimate)
        fail(
          "COST_CEILING",
          "The fictional cap must cover this example’s estimate.",
        );
      const dispatch: Dispatch = {
        id: `preview_dispatch_${crypto.randomUUID()}`,
        channel,
        recipient_json: target,
        document_id: documentId,
        campaign_id: campaignId,
        subject: emailSubject,
        html: emailHtml,
        text: emailText,
        sender_address:
          channel === "email"
            ? `${organization}@example.invalid`
            : "Fictional sender · simulation",
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
            detail: "Fictional preparation in this tab. No real dispatch.",
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
        fail(
          "NOT_FOUND",
          "Dispatch not found in this fictional workspace.",
          404,
        );
      const dispatch = detail.dispatch;
      if (dispatch.status !== "prepared")
        fail(
          "INVALID_STATE",
          "This example can no longer be changed. An uncertain outcome cannot be retried automatically.",
          409,
        );
      if (action[2] === "approve") {
        if (body.fingerprint !== dispatch.fingerprint)
          fail(
            "FINGERPRINT_MISMATCH",
            "This example’s content changed. Refresh before approving.",
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
          detail: "Approval of the fictional browser scenario.",
        });
      } else if (action[2] === "confirm") {
        if (
          !detail.approval ||
          detail.approval.fingerprint !== dispatch.fingerprint ||
          Date.parse(detail.approval.expires_at) <= Date.now()
        )
          fail(
            "APPROVAL_REQUIRED",
            "Review and approve this example before starting its simulation.",
            409,
          );
        if (!state.enabled[dispatch.channel])
          fail("CHANNEL_PAUSED", "This channel is paused in the preview.", 409);
        if (dispatch.ceiling_minor > previewCredit(state).availableMinor)
          fail(
            "CREDIT_EXHAUSTED",
            "This example’s available credit does not cover the dispatch cap.",
            409,
          );
        dispatch.status =
          dispatch.channel === "postal" ? "submitted" : "delivered";
        detail.attempts.push({
          id: crypto.randomUUID(),
          provider: "Fictional browser scenario",
          status: dispatch.status,
          created_at: now(),
        });
        detail.events.push(
          {
            id: crypto.randomUUID(),
            type: "queued",
            created_at: now(),
            detail: "Illustrated step: fictional queue placement.",
          },
          {
            id: crypto.randomUUID(),
            type: dispatch.status,
            created_at: now(),
            detail:
              "Immediate illustrative result. No provider contacted, no real dispatch.",
          },
        );
      } else {
        dispatch.status = "cancelled";
        detail.approval = null;
        detail.events.push({
          id: crypto.randomUUID(),
          type: "cancelled",
          created_at: now(),
          detail: "Example cancelled in this tab.",
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
      "This operation requires the full application. Public preview retains only fictional scenarios in your browser.",
      501,
    );
  }
  async function documentContent(id: string) {
    const visit = visitRevision;
    const currentOrganization = organization;
    const state = await workspace();
    if (visit !== visitRevision || currentOrganization !== organization)
      fail(
        "PREVIEW_SCENARIO_CHANGED",
        "The fictional scenario changed. Open this PDF again.",
        409,
      );
    const generated = generator();
    const metadata = generated?.get("documents", id);
    if (!state.contents.has(id) && metadata) {
      if (metadata.status !== "ready")
        fail(
          "DOCUMENT_NOT_READY",
          "This fictional PDF is not available while its illustrative status is blocked.",
          409,
        );
      let pending = state.pendingContents.get(id);
      if (!pending) {
        if (state.pendingContents.size >= 16)
          fail(
            "PREVIEW_PDF_LIMIT",
            "At most sixteen fictional PDFs can be prepared at once. Try again after the current previews finish.",
            429,
          );
        pending = (async () => {
          const bytes = await fixturePdf(metadata.name.replace(/\.pdf$/, ""));
          const digest = await crypto.subtle.digest(
            "SHA-256",
            new Uint8Array(bytes),
          );
          if (visit !== visitRevision || currentOrganization !== organization)
            fail(
              "PREVIEW_SCENARIO_CHANGED",
              "The fictional scenario changed. Open this PDF again.",
              409,
            );
          const exact = {
            ...metadata,
            size: bytes.length,
            pages: 1,
            sha256: Array.from(new Uint8Array(digest), (byte) =>
              byte.toString(16).padStart(2, "0"),
            ).join(""),
          };
          state.contents.set(id, bytes);
          const previous = state.documents.findIndex(
            (entry) => entry.id === id,
          );
          if (previous >= 0) state.documents.splice(previous, 1);
          state.documents.push(exact);
          while (state.documents.length > 16) {
            const removed = state.documents.shift();
            if (removed) state.contents.delete(removed.id);
          }
          return bytes;
        })();
        state.pendingContents.set(id, pending);
      }
      try {
        const bytes = await pending;
        if (visit !== visitRevision || currentOrganization !== organization)
          fail(
            "PREVIEW_SCENARIO_CHANGED",
            "The fictional scenario changed. Open this PDF again.",
            409,
          );
        return new Uint8Array(bytes);
      } finally {
        if (state.pendingContents.get(id) === pending)
          state.pendingContents.delete(id);
      }
    }
    const bytes =
      state.contents.get(id) ??
      fail(
        "DOCUMENT_NOT_FOUND",
        "This PDF is not in this fictional workspace.",
        404,
      );
    return new Uint8Array(bytes);
  }
  async function safeRequest(path: string, init: RequestOptions = {}) {
    try {
      return await request(path, init);
    } catch (error) {
      if (error instanceof PreviewDataError)
        throw new PreviewError(error.code, error.message);
      throw error;
    }
  }
  function configuration(): PreviewSimulationConfiguration {
    return copy(settings);
  }
  async function configure(
    next: PreviewSimulationConfiguration,
  ): Promise<Session> {
    if (!advancedLocal)
      fail(
        "PREVIEW_LOCAL_ONLY",
        "Scenario controls are available only in the local browser simulation.",
        403,
      );
    if (
      !next ||
      typeof next !== "object" ||
      !(PREVIEW_ACCOUNTS as readonly string[]).includes(next.account) ||
      typeof next.seed !== "string" ||
      !next.seed.trim() ||
      next.seed.length > 128 ||
      (next.counts !== null &&
        (typeof next.counts !== "object" || Array.isArray(next.counts)))
    )
      fail(
        "INVALID_PREVIEW_DATA",
        "Choose a valid fictional account and seed.",
      );
    if (next.counts !== null) {
      try {
        createPreviewData({
          seed: next.seed,
          workspace: "preview_validation",
          counts: next.counts,
        });
      } catch (error) {
        if (error instanceof PreviewDataError)
          throw new PreviewError(error.code, error.message);
        throw error;
      }
    }
    settings = copy(next);
    scenarioRevision += 1;
    visitRevision += 1;
    organization ??= "atelier";
    workspaces.clear();
    generators.clear();
    return safeRequest("/session") as Promise<Session>;
  }
  return {
    request: safeRequest,
    documentContent,
    configure,
    configuration,
    advancedLocal,
  };
}

export const publicPreview = createPreviewApi({
  advancedLocal:
    import.meta.env.DEV &&
    import.meta.env.VITE_PUBLIC_PREVIEW === "true" &&
    typeof location !== "undefined" &&
    ["127.0.0.1", "localhost", "[::1]"].includes(location.hostname),
});
