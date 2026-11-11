import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import worker from "../../apps/api/src/index";
import {
  authFailureRedirect,
  createSession,
  handleAuthRoute,
  memberships,
  requireBrowserOrigin,
  requireSameOrigin,
  safeReturnPath,
} from "../../apps/api/src/auth";
import {
  experienceCors,
  experienceOrigin,
  experienceReturnPath,
  handleExperienceReturn,
  isExperienceOrigin,
  isExperienceReturn,
} from "../../apps/api/src/experience-origin";
import type { Env } from "../../apps/api/src/env";
import { migratedD1 } from "../helpers/migrated-d1";

const application = "http://localhost:8787";
const experience = "http://localhost:8850";
const hosted = {
  ENVIRONMENT: "production",
  APP_ORIGIN: "https://guteneo.com",
  EXPERIENCE_ORIGIN: "https://gare.guteneo.com",
};

describe("experience origin configuration", () => {
  it("is off unless one exact origin is configured", () => {
    expect(experienceOrigin({ ...hosted, EXPERIENCE_ORIGIN: undefined })).toBe(
      null,
    );
    expect(experienceOrigin({ ...hosted, EXPERIENCE_ORIGIN: "" })).toBe(null);
    expect(experienceOrigin(hosted)).toBe("https://gare.guteneo.com");
    expect(isExperienceOrigin("https://gare.guteneo.com", hosted)).toBe(true);
    expect(isExperienceOrigin(null, hosted)).toBe(false);
    expect(
      isExperienceOrigin("https://gare.guteneo.com", {
        ...hosted,
        EXPERIENCE_ORIGIN: undefined,
      }),
    ).toBe(false);
  });

  it("refuses anything that is not a serialized same-site subdomain origin", () => {
    for (const value of [
      "https://gare.guteneo.com/",
      "https://gare.guteneo.com/path",
      "https://gare.guteneo.com?x=1",
      "https://user@gare.guteneo.com",
      "https://GARE.guteneo.com",
      "http://gare.guteneo.com",
      "https://gare.guteneo.com:8443",
      "https://guteneo.com",
      "https://guteneo.com.attacker.invalid",
      "https://attacker-guteneo.com",
      "https://gare.example.com",
      "https://belvedere.guteneo.com",
      "*",
      "null",
      "not a url",
    ])
      expect(
        experienceOrigin({ ...hosted, EXPERIENCE_ORIGIN: value }),
        value,
      ).toBe(null);
  });

  it("allows only another port of the same loopback host locally", () => {
    const local = {
      ENVIRONMENT: "local",
      APP_ORIGIN: application,
      EXPERIENCE_ORIGIN: experience,
    };
    expect(experienceOrigin(local)).toBe(experience);
    for (const value of [
      application,
      "http://127.0.0.1:8850",
      "https://localhost:8850",
      "http://gare.guteneo.com",
    ])
      expect(
        experienceOrigin({ ...local, EXPERIENCE_ORIGIN: value }),
        value,
      ).toBe(null);
    // A hosted environment never accepts a loopback origin.
    expect(experienceOrigin({ ...hosted, EXPERIENCE_ORIGIN: experience })).toBe(
      null,
    );
  });

  it("is never inherited by the isolated platform host", () => {
    expect(
      experienceOrigin({
        ...hosted,
        APP_ORIGIN: "https://belvedere.guteneo.com",
      }),
    ).toBe(null);
  });
});

describe("experience cross-origin grant", () => {
  const call = (
    path: string,
    init: { method?: string; headers?: Record<string, string> } = {},
    origin: string | null = hosted.EXPERIENCE_ORIGIN,
  ) =>
    experienceCors(
      new Request(`https://guteneo.com${path}`, {
        method: init.method ?? "GET",
        headers: { ...(origin ? { Origin: origin } : {}), ...init.headers },
      }),
      hosted,
    );

  it("grants only the configured origin, with credentials and no wildcard", () => {
    const granted = call("/api/dispatches")!.apply(
      Response.json({ items: [] }, { headers: { Vary: "Accept" } }),
    );
    expect(granted.headers.get("Access-Control-Allow-Origin")).toBe(
      hosted.EXPERIENCE_ORIGIN,
    );
    expect(granted.headers.get("Access-Control-Allow-Credentials")).toBe(
      "true",
    );
    expect(granted.headers.get("Vary")).toBe("Accept, Origin");
    expect(call("/api/dispatches", {}, "https://attacker.invalid")).toBe(null);
    expect(call("/api/dispatches", {}, "https://guteneo.com")).toBe(null);
    expect(call("/api/dispatches", {}, null)).toBe(null);
  });

  it("stays on the JSON API and never covers sign-in, assistants or callbacks", () => {
    for (const path of [
      "/auth/login",
      "/auth/callback",
      "/auth/invitation",
      "/mcp",
      "/webhooks/stripe",
      "/media/token",
      "/share/token",
      "/.well-known/oauth-protected-resource",
      "/api/document-uploads/upload_1/content",
      "/",
    ])
      expect(call(path), path).toBe(null);
    // A different host served by the same Worker gets no grant.
    expect(
      experienceCors(
        new Request("https://belvedere.guteneo.com/api/session", {
          headers: { Origin: hosted.EXPERIENCE_ORIGIN },
        }),
        hosted,
      ),
    ).toBe(null);
  });

  it("answers a preflight without an assistant header or a wildcard", () => {
    const preflight = call("/api/dispatches/disp_1/approve", {
      method: "OPTIONS",
      headers: {
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type,x-csrf-token",
      },
    })!.preflight!;
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("Access-Control-Allow-Origin")).toBe(
      hosted.EXPERIENCE_ORIGIN,
    );
    const allowed = preflight.headers.get("Access-Control-Allow-Headers")!;
    expect(allowed).toContain("X-CSRF-Token");
    expect(allowed).toContain("Idempotency-Key");
    expect(allowed.toLowerCase()).not.toContain("authorization");
    expect(preflight.headers.get("Access-Control-Allow-Methods")).not.toContain(
      "*",
    );
    // An ordinary OPTIONS request is not a preflight.
    expect(call("/api/dispatches", { method: "OPTIONS" })!.preflight).toBe(
      undefined,
    );
  });
});

describe("experience sign-in bridge", () => {
  it("returns only to a path inside the configured origin", () => {
    const bridge = (path: string) =>
      handleExperienceReturn(
        new Request(
          `https://guteneo.com/auth/experience?path=${encodeURIComponent(path)}`,
        ),
        hosted,
      )!.headers.get("Location");
    expect(bridge("/departures")).toBe("https://gare.guteneo.com/departures");
    expect(bridge("/departures/disp_1?tab=journey")).toBe(
      "https://gare.guteneo.com/departures/disp_1?tab=journey",
    );
    for (const hostile of [
      "//attacker.invalid",
      "https://attacker.invalid",
      "/\\attacker.invalid",
      "/a b",
      "/a#b",
      "relative",
      "/".padEnd(600, "a"),
    ])
      expect(bridge(hostile), hostile).toBe("https://gare.guteneo.com/");
    expect(experienceReturnPath(null)).toBe("/");
  });

  it("does not exist while the experience is not configured", () => {
    expect(
      handleExperienceReturn(
        new Request("https://guteneo.com/auth/experience?path=/departures"),
        { ...hosted, EXPERIENCE_ORIGIN: undefined },
      ),
    ).toBe(null);
    expect(
      handleExperienceReturn(
        new Request("https://guteneo.com/auth/experience", { method: "POST" }),
        hosted,
      ),
    ).toBe(null);
  });

  it("is an ordinary same-origin return path for the existing sign-in", () => {
    const returnTo = `/auth/experience?path=${encodeURIComponent("/departures")}`;
    expect(safeReturnPath(returnTo)).toBe(returnTo);
    expect(isExperienceReturn(returnTo)).toBe(true);
    expect(isExperienceReturn("/auth/experience-other")).toBe(false);
    expect(isExperienceReturn("/#/app")).toBe(false);
  });

  it("explains a failed sign-in in the experience only when it started there", () => {
    const started = (returnTo: string) =>
      new Request(
        `https://guteneo.com/auth/login?returnTo=${encodeURIComponent(returnTo)}&locale=de`,
      );
    expect(
      authFailureRedirect(
        started("/auth/experience?path=%2Fdepartures"),
        hosted,
        "LOGIN_RATE_LIMITED",
      ),
    ).toBe("https://gare.guteneo.com/?auth=LOGIN_RATE_LIMITED&lang=de");
    expect(
      authFailureRedirect(started("/#/app"), hosted, "LOGIN_RATE_LIMITED"),
    ).toBe("https://guteneo.com/?auth=LOGIN_RATE_LIMITED&lang=de#/app");
    // Unconfigured: the same request keeps the application recovery.
    expect(
      authFailureRedirect(
        started("/auth/experience?path=%2Fdepartures"),
        { ...hosted, EXPERIENCE_ORIGIN: undefined },
        "LOGIN_RATE_LIMITED",
      ),
    ).toBe("https://guteneo.com/?auth=LOGIN_RATE_LIMITED&lang=de#/app");
  });
});

describe("experience requests through the real session gates", () => {
  let fixture: Awaited<ReturnType<typeof migratedD1>>;
  let env: Env;
  let cookie: string;
  let csrf: string;
  const send = (path: string, init: RequestInit = {}, current: Env = env) =>
    worker.fetch(
      new Request(`${application}${path}`, init),
      current,
      {} as ExecutionContext,
    );

  beforeAll(async () => {
    fixture = await migratedD1("experience-origin");
    for (const sql of readFileSync(
      new URL("../../scripts/seed.sql", import.meta.url),
      "utf8",
    )
      .replace(/^--.*$/gm, "")
      .split(";")
      .filter((statement) => statement.trim()))
      await fixture.db.prepare(sql).run();
    env = {
      DB: fixture.db,
      MODE: "simulation",
      ENVIRONMENT: "local",
      APP_ORIGIN: application,
      EXPERIENCE_ORIGIN: experience,
    } as Env;
    const login = await createSession(
      env,
      (await memberships(env, "user_atelier"))[0],
      false,
      true,
      true,
      {
        verifiedEmail: "camille@example.invalid",
        authenticatedAt: Math.floor(Date.now() / 1000),
      },
    );
    cookie = login.cookie.split(";")[0];
    csrf = login.session.csrfToken;
  });
  afterAll(async () => {
    await fixture?.mf.dispose();
  });

  it("reads the session cross-origin and exposes the grant on errors too", async () => {
    const session = await send("/api/session", {
      headers: { Cookie: cookie, Origin: experience },
    });
    expect(session.status).toBe(200);
    expect(session.headers.get("Access-Control-Allow-Origin")).toBe(experience);
    expect(session.headers.get("Access-Control-Allow-Credentials")).toBe(
      "true",
    );
    expect(await session.json()).toMatchObject({
      organization: { id: "org_atelier" },
    });
    const anonymous = await send("/api/session", {
      headers: { Origin: experience },
    });
    expect(anonymous.status).toBe(401);
    expect(anonymous.headers.get("Access-Control-Allow-Origin")).toBe(
      experience,
    );
  });

  it("gives another origin no grant and no write", async () => {
    const read = await send("/api/session", {
      headers: { Cookie: cookie, Origin: "https://attacker.invalid" },
    });
    expect(read.headers.get("Access-Control-Allow-Origin")).toBe(null);
    const write = await send("/api/recipients", {
      method: "POST",
      headers: {
        Cookie: cookie,
        Origin: "https://attacker.invalid",
        "X-CSRF-Token": csrf,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });
    expect(write.status).toBe(403);
    expect(await write.json()).toMatchObject({
      error: { code: "ORIGIN_REJECTED" },
    });
  });

  it("does not turn a trusted origin into a session or accept a forged cookie", async () => {
    for (const invalidCookie of [
      "",
      "guteneo_session=forged",
      `guteneo_session=${"a".repeat(43)}`,
    ]) {
      const response = await send("/api/recipients", {
        method: "POST",
        headers: {
          Origin: experience,
          Cookie: invalidCookie,
          "Content-Type": "application/json",
          "X-CSRF-Token": csrf,
        },
        body: "{}",
      });
      expect(response.status).toBe(401);
      expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
        experience,
      );
    }
  });

  it("rechecks session expiry for the configured experience", async () => {
    const expired = await createSession(
      env,
      (await memberships(env, "user_atelier"))[0],
      false,
      true,
      true,
    );
    await env.DB.prepare(
      "UPDATE browser_sessions SET expires_at=? WHERE token_hash=?",
    )
      .bind("2000-01-01T00:00:00.000Z", expired.session.tokenHash)
      .run();
    const response = await send("/api/session", {
      headers: { Cookie: expired.cookie.split(";")[0], Origin: experience },
    });
    expect(response.status).toBe(401);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      experience,
    );
  });

  it("still requires the CSRF token for an experience write", async () => {
    const headers = {
      Cookie: cookie,
      Origin: experience,
      "Content-Type": "application/json",
    };
    const missing = await send("/api/logout", { method: "POST", headers });
    expect(missing.status).toBe(403);
    expect(await missing.json()).toMatchObject({
      error: { code: "CSRF_REJECTED" },
    });
    const forged = await send("/api/logout", {
      method: "POST",
      headers: { ...headers, "X-CSRF-Token": "forged" },
    });
    expect(forged.status).toBe(403);
    expect(await forged.json()).toMatchObject({
      error: { code: "CSRF_REJECTED" },
    });
    // The same request is refused outright once the experience is unconfigured.
    const unconfigured = await send(
      "/api/logout",
      { method: "POST", headers: { ...headers, "X-CSRF-Token": csrf } },
      { ...env, EXPERIENCE_ORIGIN: undefined } as Env,
    );
    expect(unconfigured.status).toBe(403);
    expect(await unconfigured.json()).toMatchObject({
      error: { code: "ORIGIN_REJECTED" },
    });
    expect(unconfigured.headers.get("Access-Control-Allow-Origin")).toBe(null);
  });

  it("answers the preflight before any route, then accepts the write", async () => {
    const preflight = await send("/api/logout", {
      method: "OPTIONS",
      headers: {
        Origin: experience,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type,x-csrf-token",
      },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("Access-Control-Allow-Origin")).toBe(
      experience,
    );
    const signedOut = await send("/api/logout", {
      method: "POST",
      headers: {
        Cookie: cookie,
        Origin: experience,
        "X-CSRF-Token": csrf,
        "Content-Type": "application/json",
      },
    });
    expect(signedOut.status).toBe(200);
    expect(await signedOut.json()).toEqual({ signedOut: true });
  });

  it("keeps the strict application-only origin for the invitation handoff", () => {
    const fromExperience = new Request(`${application}/auth/invitation`, {
      method: "POST",
      headers: { Origin: experience },
    });
    expect(() => requireBrowserOrigin(fromExperience, env)).not.toThrow();
    expect(() => requireSameOrigin(fromExperience, env)).toThrow();
  });

  it("serves the return bridge through the existing auth routes", async () => {
    const response = await handleAuthRoute(
      new Request(`${application}/auth/experience?path=%2Farrivals`),
      env,
    );
    expect(response?.status).toBe(302);
    expect(response?.headers.get("Location")).toBe(`${experience}/arrivals`);
  });
});
