import { expect, it, vi } from "vitest";
import { inspectTelnyxReadiness } from "../../packages/providers/telnyx-readiness";
import type { Fetcher } from "../../packages/providers/types";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const config = {
  apiKey: "fixture-key",
  connectionId: "1000000000000000001",
  canonicalWebhookUrl: "https://guteneo.com/webhooks/telnyx",
};
const profileId = "1000000000000000002";
const application = {
  data: {
    id: config.connectionId,
    active: true,
    outbound: { outbound_voice_profile_id: profileId },
  },
};
const json = (value: unknown) => new Response(JSON.stringify(value));

it("overlaps profile and phone inspection after validating the application, while keeping pages ordered", async () => {
  const app = deferred<Response>();
  const pages = [deferred<Response>(), deferred<Response>()];
  const profile = deferred<Response>();
  const fetcher = vi.fn<Fetcher>(async (input) => {
    const url = new URL(String(input));
    if (url.pathname.includes("fax_applications")) return app.promise;
    if (url.pathname.includes("outbound_voice_profiles"))
      return profile.promise;
    if (url.pathname === "/v2/phone_numbers") {
      expect(url.searchParams.get("filter[connection_id]")).toBe(
        config.connectionId,
      );
      return pages[Number(url.searchParams.get("page[number]")) - 1].promise;
    }
    throw new Error("Unexpected route");
  });
  const result = inspectTelnyxReadiness(config, fetcher);
  expect(fetcher).toHaveBeenCalledOnce();
  app.resolve(json(application));
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
  expect(
    fetcher.mock.calls.map(([input]) => new URL(String(input)).pathname),
  ).toEqual([
    `/v2/fax_applications/${config.connectionId}`,
    "/v2/phone_numbers",
    `/v2/outbound_voice_profiles/${profileId}`,
  ]);
  const completed = vi.fn();
  void result.then(completed);
  profile.resolve(json({ data: { id: profileId } }));
  await Promise.resolve();
  expect(completed).not.toHaveBeenCalled();
  expect(fetcher).toHaveBeenCalledTimes(3);
  pages[0].resolve(
    json({ data: [], meta: { page_number: 1, total_pages: 2 } }),
  );
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(4));
  expect(
    new URL(String(fetcher.mock.calls[3][0])).searchParams.get("page[number]"),
  ).toBe("2");
  pages[1].resolve(
    json({ data: [], meta: { page_number: 2, total_pages: 2 } }),
  );
  await expect(result).resolves.toMatchObject({
    status: "ok",
    numberPagination: { pagesRead: 2, complete: true },
    outboundProfile: { id: profileId },
    liveSendingVerified: false,
  });
});

it("preserves both independent failures in stable stage order when profile failure arrives first", async () => {
  const numbers = deferred<Response>();
  const profile = deferred<Response>();
  const fetcher = vi.fn<Fetcher>(async (input) => {
    const url = new URL(String(input));
    if (url.pathname.includes("fax_applications")) return json(application);
    if (url.pathname.includes("outbound_voice_profiles"))
      return profile.promise;
    return numbers.promise;
  });
  const result = inspectTelnyxReadiness(config, fetcher);
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
  profile.resolve(new Response("fixture-denied", { status: 403 }));
  await Promise.resolve();
  numbers.resolve(new Response("fixture-error", { status: 503 }));
  await expect(result).resolves.toMatchObject({
    status: "partial",
    errors: [
      { stage: "numbers", code: "http_error", httpStatus: 503 },
      { stage: "outbound_profile", code: "http_error", httpStatus: 403 },
    ],
    outboundProfile: null,
    numberPagination: { pagesRead: 0, complete: false },
  });
});
