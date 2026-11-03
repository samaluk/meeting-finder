import { Effect, Layer } from "effect";
import { describe, expect, it } from "vitest";
import { DemoCalendarAvailabilityLive, DemoDirectoryLive } from "../src/adapters/demo.js";
import { makeHandler } from "../src/http.js";
import { CalendarAvailability } from "../src/providers.js";
import { providerUnavailable } from "../src/errors.js";

const demoLayer = Layer.mergeAll(DemoDirectoryLive, DemoCalendarAvailabilityLive);
const handlerFor = () => makeHandler({ mode: "demo", layer: demoLayer });

const call = async (path: string, init: RequestInit = {}) => {
  const app = handlerFor();
  try {
    return await app.handler(new Request(`http://127.0.0.1${path}`, init));
  } finally {
    await app.dispose();
  }
};

const request = {
  startDate: "2030-01-07",
  endDate: "2030-01-07",
  timeZone: "America/Santiago",
  durationMinutes: 60,
  sources: [{ type: "chat_space", ref: "spaces/example", required: true }],
};

describe("HTTP public contract", () => {
  it.each(["/api/v1/config", "/missing"])(
    "protects %s against caching and framing",
    async (path) => {
      const response = await call(path);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("referrer-policy")).toBe("no-referrer");
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      expect(response.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    },
  );

  it("distinguishes a failed body stream from invalid JSON", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(new Error("transport read failed"));
      },
    });
    const response = await call("/api/v1/resolve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ detail: "Unable to read request body" });
  });

  it("cancels an unfinished body stream when its request is aborted", async () => {
    let started!: () => void;
    const reading = new Promise<void>((resolve) => {
      started = resolve;
    });
    let cancelled!: () => void;
    const cancellation = new Promise<void>((resolve) => {
      cancelled = resolve;
    });
    const body = new ReadableStream<Uint8Array>(
      {
        pull() {
          started();
        },
        cancel() {
          cancelled();
        },
      },
      { highWaterMark: 0 },
    );
    const controller = new AbortController();
    const app = handlerFor();
    const pending = app
      .handler(
        new Request("http://127.0.0.1/api/v1/resolve", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body,
          signal: controller.signal,
        }),
      )
      .catch(() => undefined);
    try {
      await reading;
      controller.abort();
      await Promise.race([
        cancellation,
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error("body stream was not cancelled")), 1_000);
        }),
      ]);
      const response = await pending;
      expect(response?.status).not.toBe(400);
    } finally {
      controller.abort();
      await app.dispose();
    }
  });

  it.each([
    "http://finder.example.ts.net",
    "https://finder.example.ts.net/path",
    "https://user:password@finder.example.ts.net",
    "https://finder.example.ts.net?x=1",
    "https://finder.example.ts.net#fragment",
    "invalid",
  ])("rejects invalid programmatic proxy configuration %s", async (proxyOrigin) => {
    const app = makeHandler({ mode: "demo", proxyOrigin });
    try {
      await expect(
        app.handler(new Request("http://127.0.0.1/api/v1/config")),
      ).rejects.toMatchObject({
        code: "invalid_input",
        issues: [{ path: ["proxyOrigin"] }],
      });
    } finally {
      await app.dispose();
    }
  });

  it("preserves prepared configuration in demo mode", async () => {
    const config = { participants: [{ id: "prepared@example.test", required: true }] };
    const app = makeHandler({ mode: "demo", config });
    try {
      const response = await app.handler(new Request("http://127.0.0.1/api/v1/config"));
      expect(await response.json()).toEqual({ mode: "demo", request: config });
    } finally {
      await app.dispose();
    }
  });

  it("rejects an explicit null mode instead of defaulting it", async () => {
    const response = await call("/api/v1/resolve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: null, request }),
    });
    expect(response.status).toBe(400);
    expect(response.headers.get("content-type")).toContain("application/problem+json");
  });

  it("rejects malformed prepared configuration before serving it", async () => {
    const app = makeHandler({ mode: "demo", config: { participants: [{ id: 42 }] } });
    try {
      await expect(
        app.handler(new Request("http://127.0.0.1/api/v1/config")),
      ).rejects.toMatchObject({
        code: "invalid_input",
        issues: expect.arrayContaining([
          expect.objectContaining({ path: ["participants", 0, "id"] }),
        ]),
      });
    } finally {
      await app.dispose();
    }
  });

  it("resolves and searches the same demo request", async () => {
    const resolve = await call("/api/v1/resolve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "demo", request }),
    });
    const search = await call("/api/v1/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "demo", request }),
    });
    expect(resolve.status).toBe(200);
    expect(search.status).toBe(200);
    expect((await resolve.json()).mode).toBe("demo");
    expect((await search.json()).mode).toBe("demo");
  });

  it("selects demo providers from the request handler configuration", async () => {
    const app = makeHandler({ mode: "demo" });
    const response = await app.handler(
      new Request("http://127.0.0.1/api/v1/resolve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "demo", request }),
      }),
    );
    expect(response.status).toBe(200);
    await app.dispose();
  });

  it("returns structured validation and protocol errors", async () => {
    const invalid = await call("/api/v1/resolve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(invalid.status).toBe(400);
    expect(invalid.headers.get("content-type")).toContain("application/problem+json");
    const media = await call("/api/v1/resolve", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "{}",
    });
    expect(media.status).toBe(415);
    const method = await call("/api/v1/resolve", { method: "GET" });
    expect(method.status).toBe(405);
    expect(method.headers.get("allow")).toBe("POST");
    expect((await call("/schema.json", { method: "POST" })).status).toBe(405);
    expect((await call("/api/missing")).status).toBe(404);
  });

  it("rejects untrusted host and origin", async () => {
    const host = await call("/api/v1/config", { headers: { host: "192.0.2.1" } });
    expect(host.status).toBe(403);
    const origin = await call("/api/v1/config", { headers: { origin: "http://127.0.0.1:9999" } });
    expect(origin.status).toBe(403);
  });

  it("accepts only the explicitly configured HTTPS proxy origin", async () => {
    const proxyOrigin = "https://finder.example.ts.net:8443";
    const app = makeHandler({ mode: "demo", proxyOrigin });
    const send = (host: string, origin?: string) =>
      app.handler(
        new Request(`${proxyOrigin}/api/v1/resolve`, {
          method: "POST",
          headers: {
            host,
            "content-type": "application/json",
            ...(origin === undefined ? {} : { origin }),
          },
          body: JSON.stringify({ mode: "demo", request }),
        }),
      );
    try {
      expect((await send("finder.example.ts.net:8443", proxyOrigin)).status).toBe(200);
      expect((await send("127.0.0.1:4310", proxyOrigin)).status).toBe(200);
      expect(
        (await send("finder.example.ts.net:8443", "https://other.example.ts.net:8443")).status,
      ).toBe(403);
      expect(
        (await send("finder.example.ts.net:8443", "http://finder.example.ts.net:8443")).status,
      ).toBe(403);
      expect((await send("other.example.ts.net:8443", proxyOrigin)).status).toBe(403);
      expect(
        (await call("/api/v1/config", { headers: { host: "finder.example.ts.net:8443" } })).status,
      ).toBe(403);
    } finally {
      await app.dispose();
    }
  });

  it("enforces the 128 KiB body limit without trusting content length", async () => {
    const body = JSON.stringify({
      mode: "demo",
      request: { ...request, participants: [{ id: "a@example.test", name: "x".repeat(140_000) }] },
    });
    const response = await call("/api/v1/resolve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    expect(response.status).toBe(413);
  });

  it("publishes schemas and markdown discovery", async () => {
    const schema = await call("/schema.json");
    const openapi = await call("/openapi.json");
    const docs = await call("/docs", { headers: { accept: "text/markdown" } });
    expect(schema.status).toBe(200);
    expect((await schema.json()).$schema).toBeTruthy();
    expect((await openapi.json()).openapi).toBe("3.1.0");
    expect(docs.headers.get("content-type")).toContain("text/markdown");
    const homepage = await call("/");
    expect(homepage.status).toBe(200);
    const html = await homepage.text();
    const asset = html.match(/src="(\/assets\/[^"]+\.js)"/)?.[1];
    expect(asset).toBeTruthy();
    const script = await call(asset!);
    expect(script.status).toBe(200);
    expect(script.headers.get("content-type")).toContain("javascript");
    expect((await call("/assets/../index.html")).status).toBe(404);
  });

  it("describes the request envelope and strict search schema in OpenAPI", async () => {
    const response = await call("/openapi.json");
    const document = await response.json();
    expect(
      document.paths["/api/v1/search"].post.requestBody.content["application/json"].schema,
    ).toEqual({
      $ref: "#/components/schemas/SearchEnvelope",
    });
    expect(document.components.schemas.SearchEnvelope.required).toEqual(
      expect.arrayContaining(["mode", "request"]),
    );
    expect(document.components.schemas.SearchEnvelope.properties.request.required).toEqual(
      expect.arrayContaining(["startDate", "endDate", "timeZone", "durationMinutes"]),
    );
    expect(document.components.schemas.SearchResponse.properties.mode.enum).toEqual([
      "live",
      "demo",
    ]);
  });

  it("rejects a search envelope without required meeting fields", async () => {
    const response = await call("/api/v1/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        mode: "demo",
        request: { participants: [{ id: "p1@example.test" }] },
      }),
    });
    expect(response.status).toBe(400);
    expect(response.headers.get("content-type")).toContain("application/problem+json");
  });

  it("maps provider failures to a 502 problem response", async () => {
    const failingCalendar: CalendarAvailability["Service"] = {
      query: () =>
        Effect.fail(providerUnavailable("calendar service unavailable", "Retry the request")),
    };
    const app = makeHandler({
      mode: "demo",
      layer: Layer.merge(DemoDirectoryLive, Layer.succeed(CalendarAvailability, failingCalendar)),
    });
    try {
      const response = await app.handler(
        new Request("http://127.0.0.1/api/v1/search", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ mode: "demo", request }),
        }),
      );
      expect(response.status).toBe(502);
      expect(response.headers.get("content-type")).toContain("application/problem+json");
      expect((await response.json()).detail).toBe("calendar service unavailable");
    } finally {
      await app.dispose();
    }
  });

  it("interrupts availability work when the request is aborted", async () => {
    let started = false;
    let releaseStarted!: () => void;
    const startedPromise = new Promise<void>((resolve) => {
      releaseStarted = resolve;
    });
    let released = false;
    let release!: () => void;
    const releasedPromise = new Promise<void>((resolve) => {
      release = resolve;
    });
    const blockingCalendar: CalendarAvailability["Service"] = {
      query: () =>
        Effect.gen(function* () {
          yield* Effect.sync(() => {
            started = true;
            releaseStarted();
          });
          return yield* Effect.never;
        }).pipe(
          Effect.ensuring(
            Effect.sync(() => {
              released = true;
              release();
            }),
          ),
        ),
    };
    const app = makeHandler({
      mode: "demo",
      layer: Layer.merge(DemoDirectoryLive, Layer.succeed(CalendarAvailability, blockingCalendar)),
    });
    const controller = new AbortController();
    const pending = app
      .handler(
        new Request("http://127.0.0.1/api/v1/search", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ mode: "demo", request }),
          signal: controller.signal,
        }),
      )
      .catch(() => undefined);
    try {
      await Promise.race([
        startedPromise,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("availability query did not start")), 1_000),
        ),
      ]);
      expect(started).toBe(true);
      controller.abort();
      await Promise.race([
        releasedPromise,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("availability query was not interrupted")), 1_000),
        ),
      ]);
      expect(released).toBe(true);
    } finally {
      controller.abort();
      await pending;
      await app.dispose();
    }
  });
});

it("exposes attendance policies and free intervals through the shared HTTP contract", async () => {
  const response = await call("/api/v1/search", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      mode: "demo",
      request: {
        ...request,
        sources: undefined,
        participants: [
          {
            id: "partial@example.test",
            required: true,
            attendanceRule: { type: "end", minutes: 15 },
          },
        ],
      },
    }),
  });
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.audience.participants[0].attendanceRule).toEqual({ type: "end", minutes: 15 });
  expect(body.candidates[0].participants[0]).toMatchObject({
    ruleSatisfied: true,
    attendanceRule: { type: "end", minutes: 15 },
  });
  expect(body.candidates[0].participants[0].attendanceInterval).toBeDefined();
});
