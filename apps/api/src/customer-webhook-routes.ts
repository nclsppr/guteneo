import { Hono } from "hono";
import {
  DomainError,
  type DomainService,
} from "../../../packages/domain/src/index";
import {
  customerWebhookCreate,
  customerWebhookUpdate,
  customerWebhookRevision,
  customerWebhookRotation,
} from "../../../packages/contracts/src/customer-webhooks";
import type { Env } from "./env";
import type { LifecycleActor } from "./lifecycle-authority";
import { CustomerWebhookService } from "./customer-webhooks";
import { secureJson } from "./secure-distribution-routes";

export function createCustomerWebhookRoutes(
  domain: (env: Env) => DomainService,
) {
  const app = new Hono<{
    Bindings: Env;
    Variables: { actor: LifecycleActor };
  }>();
  app.use("/api/customer-webhooks*", async (c, next) => {
    c.header("Cache-Control", "private, no-store");
    c.header("Referrer-Policy", "no-referrer");
    await next();
  });
  const service = (env: Env) => new CustomerWebhookService(env, domain(env));
  app.get("/api/customer-webhooks", async (c) =>
    c.json(await service(c.env).list(c.get("actor"))),
  );
  app.post("/api/customer-webhooks", async (c) => {
    const key = c.req.header("Idempotency-Key");
    if (!key)
      throw new DomainError(
        "IDEMPOTENCY_REQUIRED",
        "Idempotency-Key header required.",
      );
    return c.json(
      await service(c.env).create(
        c.get("actor"),
        await secureJson(c.req.raw, customerWebhookCreate, 8192),
        key,
      ),
      201,
    );
  });
  app.patch("/api/customer-webhooks/:id", async (c) =>
    c.json(
      await service(c.env).update(
        c.get("actor"),
        c.req.param("id"),
        await secureJson(c.req.raw, customerWebhookUpdate, 8192),
      ),
    ),
  );
  app.post("/api/customer-webhooks/:id/revoke", async (c) =>
    c.json(
      await service(c.env).revoke(
        c.get("actor"),
        c.req.param("id"),
        await secureJson(c.req.raw, customerWebhookRevision, 1024),
      ),
    ),
  );
  app.post("/api/customer-webhooks/:id/rotate-secret", async (c) =>
    c.json(
      await service(c.env).rotateSecret(
        c.get("actor"),
        c.req.param("id"),
        await secureJson(c.req.raw, customerWebhookRotation, 1024),
      ),
    ),
  );
  app.get("/api/customer-webhooks/:id/deliveries", async (c) =>
    c.json(
      await service(c.env).deliveries(
        c.get("actor"),
        c.req.param("id"),
        c.req.query("cursor"),
        Number(c.req.query("limit") ?? 30),
      ),
    ),
  );
  return app;
}
