import { z } from "zod";
import { boundedText, request } from "./transport";
import type { Fetcher } from "./types";

const id = z.string().regex(/^\d{1,30}$/);
const optionalFlag = z.boolean().optional();
const limit = z.number().int().nonnegative().nullable().optional();
const applicationSchema = z.object({
  id,
  active: z.boolean(),
  outbound: z
    .object({
      outbound_voice_profile_id: id.nullable().optional(),
      channel_limit: limit,
    })
    .optional(),
});
const numberSchema = z.object({
  id,
  connection_id: id,
  phone_number: z.string().regex(/^\+[1-9]\d{6,14}$/),
  country_iso_alpha2: z.string().regex(/^[A-Z]{2}$/),
  status: z.enum([
    "purchase-pending",
    "purchase-failed",
    "port-pending",
    "port-failed",
    "active",
    "deleted",
    "emergency-only",
    "ported-out",
    "port-out-pending",
    "requirement-info-pending",
    "requirement-info-under-review",
    "requirement-info-exception",
    "provision-pending",
  ]),
  t38_fax_gateway_enabled: optionalFlag,
  hd_voice_enabled: optionalFlag,
});
const paginationSchema = z.object({
  page_number: z.number().int().positive(),
  total_pages: z.number().int().nonnegative(),
});
const profileSchema = z.object({
  id,
  enabled: optionalFlag,
  whitelisted_destinations: z
    .array(z.string().regex(/^[A-Z]{2}$/))
    .max(300)
    .optional(),
  concurrent_call_limit: limit,
  max_destination_rate: z.number().nonnegative().finite().optional(),
  daily_spend_limit: z
    .string()
    .regex(/^\d{1,15}(?:\.\d{1,8})?$/)
    .optional(),
  daily_spend_limit_enabled: optionalFlag,
});

const PAGE_SIZE = 100;
const MAX_PAGES = 4;
type Stage = "configuration" | "application" | "numbers" | "outbound_profile";
type ErrorCode =
  | "configuration_invalid"
  | "request_failed"
  | "request_timeout"
  | "request_invalid_invocation"
  | "http_error"
  | "invalid_response"
  | "response_scope_mismatch"
  | "pagination_limit";
type InspectionError = {
  stage: Stage;
  code: ErrorCode;
  httpStatus?: number;
  invalidFields?: string[];
};
class InspectionFailure extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly httpStatus?: number,
    readonly invalidFields?: string[],
  ) {
    super(code);
  }
}

export type TelnyxReadiness = {
  provider: "telnyx";
  mode: "read_only";
  status: "ok" | "partial" | "error";
  application: {
    id: string;
    active: boolean;
    outboundVoiceProfileId: string | null;
    outboundChannelLimit: number | null | "unknown";
  } | null;
  numbers: {
    id: string;
    phoneNumber: string;
    status: string;
    country: string;
    features: {
      t38FaxGatewayEnabled: boolean | null;
      hdVoiceEnabled: boolean | null;
    };
  }[];
  numberPagination: { pagesRead: number; complete: boolean };
  outboundProfile: {
    id: string;
    enabled: boolean | null;
    whitelistedDestinations: string[] | null;
    /** Telnyx explicitly defines null as unlimited; absent is unknown. */
    concurrentCallLimit: number | null | "unknown";
    /** Provider configuration only: no quote, currency conversion or cost computation. */
    maxDestinationRate: number | null;
    dailySpendLimitUsd: string | null;
    dailySpendLimitEnabled: boolean | null;
  } | null;
  errors: InspectionError[];
  liveSendingVerified: false;
};

/** Fixed, read-only provider inspection. This does not authorize or perform a fax send.
 * It never returns provider payloads, arbitrary text, callback URLs, keys or raw errors.
 * The caller must keep this result private: attached phone numbers are account data.
 */
export async function inspectTelnyxReadiness(
  config: { apiKey: string; connectionId: string },
  fetcher: Fetcher = fetch,
): Promise<TelnyxReadiness> {
  const result: TelnyxReadiness = {
    provider: "telnyx",
    mode: "read_only",
    status: "error",
    application: null,
    numbers: [],
    numberPagination: { pagesRead: 0, complete: false },
    outboundProfile: null,
    errors: [],
    liveSendingVerified: false,
  };
  const failed = (stage: Stage, error: unknown) => {
    const safe = error instanceof InspectionFailure ? error : null;
    result.errors.push({
      stage,
      code: safe?.code ?? "request_failed",
      ...(safe?.httpStatus === undefined
        ? {}
        : { httpStatus: safe.httpStatus }),
      ...(safe?.invalidFields ? { invalidFields: safe.invalidFields } : {}),
    });
  };
  if (
    !id.safeParse(config.connectionId).success ||
    typeof config.apiKey !== "string" ||
    !/^[\x21-\x7e]{1,4096}$/.test(config.apiKey)
  ) {
    failed("configuration", new InspectionFailure("configuration_invalid"));
    return result;
  }

  async function get(path: string): Promise<Record<string, unknown>> {
    // Only locally constructed paths reach this helper; no provider-supplied links.
    let response: Response;
    try {
      response = await request(fetcher, `https://api.telnyx.com/v2${path}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(8_000),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      const code = /illegal invocation|incorrect.*this/i.test(message)
        ? "request_invalid_invocation"
        : error instanceof Error &&
            ["TimeoutError", "AbortError"].includes(error.name)
          ? "request_timeout"
          : "request_failed";
      throw new InspectionFailure(code);
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new InspectionFailure("http_error", response.status);
    }
    try {
      const value: unknown = JSON.parse(
        await boundedText(response, 512 * 1024),
      );
      if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error();
      return value as Record<string, unknown>;
    } catch {
      throw new InspectionFailure("invalid_response");
    }
  }

  try {
    const response = await get(`/fax_applications/${config.connectionId}`);
    const parsed = applicationSchema.safeParse(response.data);
    if (!parsed.success) throw new InspectionFailure("invalid_response");
    const app = parsed.data;
    if (app.id !== config.connectionId)
      throw new InspectionFailure("response_scope_mismatch");
    result.application = {
      id: app.id,
      active: app.active,
      outboundVoiceProfileId: app.outbound?.outbound_voice_profile_id ?? null,
      outboundChannelLimit:
        app.outbound?.channel_limit === undefined
          ? "unknown"
          : app.outbound.channel_limit,
    };
  } catch (error) {
    failed("application", error);
    return result;
  }

  try {
    for (let page = 1; page <= MAX_PAGES; page++) {
      const query = new URLSearchParams({
        "filter[connection_id]": config.connectionId,
        "page[number]": String(page),
        "page[size]": String(PAGE_SIZE),
      });
      const response = await get(`/phone_numbers?${query}`);
      result.numberPagination.pagesRead++;
      const meta = paginationSchema.safeParse(response.meta);
      if (
        !Array.isArray(response.data) ||
        response.data.length > PAGE_SIZE ||
        !meta.success ||
        meta.data.page_number !== page ||
        (meta.data.total_pages < page &&
          !(
            page === 1 &&
            meta.data.total_pages === 0 &&
            response.data.length === 0
          ))
      )
        throw new InspectionFailure("invalid_response");
      for (const value of response.data) {
        if (!value || typeof value !== "object" || Array.isArray(value))
          throw new InspectionFailure("invalid_response");
        // Enforce the requested connection again even if Telnyx ignores its filter.
        if (
          (value as Record<string, unknown>).connection_id !==
          config.connectionId
        ) {
          if (
            !result.errors.some(
              (e) =>
                e.stage === "numbers" && e.code === "response_scope_mismatch",
            )
          )
            failed("numbers", new InspectionFailure("response_scope_mismatch"));
          continue;
        }
        const parsed = numberSchema.safeParse(value);
        if (!parsed.success) throw new InspectionFailure("invalid_response");
        const number = parsed.data;
        if (result.numbers.some((existing) => existing.id === number.id))
          throw new InspectionFailure("invalid_response");
        result.numbers.push({
          id: number.id,
          phoneNumber: number.phone_number,
          status: number.status,
          country: number.country_iso_alpha2,
          features: {
            t38FaxGatewayEnabled: number.t38_fax_gateway_enabled ?? null,
            hdVoiceEnabled: number.hd_voice_enabled ?? null,
          },
        });
      }
      if (page >= meta.data.total_pages) {
        result.numberPagination.complete = !result.errors.some(
          (e) => e.stage === "numbers",
        );
        break;
      }
      if (page === MAX_PAGES)
        failed("numbers", new InspectionFailure("pagination_limit"));
    }
  } catch (error) {
    failed("numbers", error);
  }

  const profileId = result.application.outboundVoiceProfileId;
  if (profileId) {
    try {
      const response = await get(`/outbound_voice_profiles/${profileId}`);
      const parsed = profileSchema.safeParse(response.data);
      if (!parsed.success) {
        const fields = Object.keys(profileSchema.shape);
        const invalidFields = [
          ...new Set(
            parsed.error.issues
              .map((issue) => String(issue.path[0]))
              .filter((field) => fields.includes(field)),
          ),
        ];
        throw new InspectionFailure(
          "invalid_response",
          undefined,
          invalidFields,
        );
      }
      const profile = parsed.data;
      if (profile.id !== profileId)
        throw new InspectionFailure("response_scope_mismatch");
      result.outboundProfile = {
        id: profile.id,
        enabled: profile.enabled ?? null,
        whitelistedDestinations: profile.whitelisted_destinations ?? null,
        concurrentCallLimit:
          profile.concurrent_call_limit === undefined
            ? "unknown"
            : profile.concurrent_call_limit,
        maxDestinationRate: profile.max_destination_rate ?? null,
        dailySpendLimitUsd: profile.daily_spend_limit ?? null,
        dailySpendLimitEnabled: profile.daily_spend_limit_enabled ?? null,
      };
    } catch (error) {
      failed("outbound_profile", error);
    }
  }
  result.status = result.errors.length ? "partial" : "ok";
  return result;
}
