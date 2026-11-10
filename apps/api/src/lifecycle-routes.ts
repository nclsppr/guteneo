import { Hono } from "hono";
import { DomainError, type DomainService } from "../../../packages/domain/src/index";
import type { Env } from "./env";
import type { LifecycleActor } from "./lifecycle-authority";
import { SavedRecipientService } from "./saved-recipients";
import { DispatchScheduleService, scheduleCapabilities } from "./dispatch-schedules";

export function createLifecycleRoutes(domain: (env: Env) => DomainService) {
  const app = new Hono<{ Bindings: Env; Variables: { actor: LifecycleActor } }>();
  const recipients = (env: Env) => new SavedRecipientService(domain(env));
  const schedules = (env: Env) => new DispatchScheduleService(env, domain(env));
  const key = (value?: string) => {
    if (!value) throw new DomainError("IDEMPOTENCY_REQUIRED", "Idempotency-Key header required.");
    return value;
  };
  app.get("/api/attention", async (c) => c.json(await domain(c.env).attentionQueue(c.get("actor"), c.req.query("cursor"), Number(c.req.query("limit") ?? 30))));
  app.get("/api/recipients", async (c) => c.json(await recipients(c.env).list(c.get("actor"), c.req.query("cursor"), Number(c.req.query("limit") ?? 30))));
  app.post("/api/recipients", async (c) => c.json(await recipients(c.env).create(c.get("actor"), await c.req.json(), key(c.req.header("Idempotency-Key"))), 201));
  app.get("/api/recipients/:id", async (c) => c.json(await recipients(c.env).get(c.get("actor"), c.req.param("id"))));
  app.patch("/api/recipients/:id", async (c) => c.json(await recipients(c.env).update(c.get("actor"), c.req.param("id"), await c.req.json())));
  app.delete("/api/recipients/:id", async (c) => c.json(await recipients(c.env).remove(c.get("actor"), c.req.param("id"), await c.req.json())));
  app.get("/api/dispatch-schedules/capabilities", (c) => c.json(scheduleCapabilities(c.env)));
  app.get("/api/dispatch-schedules", async (c) => c.json(await schedules(c.env).list(c.get("actor"), c.req.query("cursor"), Number(c.req.query("limit") ?? 30))));
  app.post("/api/dispatch-schedules", async (c) => c.json(await schedules(c.env).create(c.get("actor"), await c.req.json(), key(c.req.header("Idempotency-Key"))), 201));
  app.get("/api/dispatch-schedules/:id", async (c) => c.json(await schedules(c.env).get(c.get("actor"), c.req.param("id"))));
  app.post("/api/dispatch-schedules/:id/approve", async (c) => c.json(await schedules(c.env).approve(c.get("actor"), c.req.param("id"), await c.req.json())));
  app.post("/api/dispatch-schedules/:id/cancel", async (c) => c.json(await schedules(c.env).cancel(c.get("actor"), c.req.param("id"), await c.req.json())));
  return app;
}
