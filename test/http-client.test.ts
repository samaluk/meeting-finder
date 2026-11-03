import { BunHttpServer } from "@effect/platform-bun";
import { it, expect } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { HttpClient, HttpClientRequest, HttpRouter } from "effect/http";
import { HttpApiClient } from "effect/http-api";
import { MeetingFinderApi } from "../src/api.js";
import { HttpApp } from "../src/http.js";

// The running Bun server and the in-memory handler use this same route pipeline.
const server = HttpRouter.serve(HttpApp({ mode: "live" }), {
  disableLogger: true,
  disableListenLog: true,
}).pipe(Layer.provideMerge(BunHttpServer.layerTest));

const request = {
  startDate: "2030-01-07",
  endDate: "2030-01-07",
  timeZone: "UTC",
  durationMinutes: 60,
  participants: [{ id: "p1@example.test", required: true }],
};

it.effect("uses the executable API contract through a scoped Bun server and generated client", () =>
  Effect.gen(function* () {
    const client = yield* HttpApiClient.make(MeetingFinderApi);
    // Explicit demo mode must select demo providers even on a live-configured server.
    const audience = yield* client.meeting.resolve({ payload: { mode: "demo", request } });
    expect(audience.mode).toBe("demo");
    expect(audience.participants[0]?.id).toBe("p1@example.test");
    const result = yield* client.meeting.search({ payload: { mode: "demo", request } });
    expect(result.mode).toBe("demo");
    expect(result.candidates.length).toBeGreaterThan(0);
    const sources = yield* client.sources.list({ query: { mode: "demo", kind: "chat_space" } });
    expect(sources.sources.length).toBeGreaterThan(0);
    const invalid = yield* client.meeting
      .search({
        payload: { mode: "demo", request: { ...request, minAttendance: 2 } },
      })
      .pipe(Effect.result);
    expect(invalid).toMatchObject({
      _tag: "Failure",
      failure: { status: 400, category: "input", code: "invalid_search" },
    });
  }).pipe(Effect.provide(server)),
);

it.effect("normalizes legacy bodies and retains nested validation paths on the real server", () =>
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;
    const legacy = yield* client.execute(
      HttpClientRequest.post("/api/resolve?mode=demo").pipe(
        HttpClientRequest.bodyJsonUnsafe(request),
      ),
    );
    expect(legacy.status).toBe(200);
    expect(yield* legacy.json).toMatchObject({ mode: "demo", total: 1 });
    const invalid = yield* client.execute(
      HttpClientRequest.post("/api/v1/search").pipe(
        HttpClientRequest.bodyJsonUnsafe({
          mode: "demo",
          request: {
            ...request,
            participants: [
              { id: "p1@example.test", attendanceRule: { type: "percentage", percent: 0 } },
            ],
          },
        }),
      ),
    );
    expect(invalid.status).toBe(400);
    expect(invalid.headers["content-type"]).toContain("application/problem+json");
    expect(yield* invalid.json).toMatchObject({
      issues: expect.arrayContaining([
        expect.objectContaining({
          path: ["request", "participants", 0, "attendanceRule", "percent"],
        }),
      ]),
    });
  }).pipe(Effect.provide(server)),
);
