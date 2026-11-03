import { describe, expect, it } from "@effect/vitest";
import { ConfigProvider, Effect, Tracer } from "effect";
import { localTracingLayer, makeLocalTracer } from "../src/observability.js";

describe("local Effect diagnostics", () => {
  it.effect(
    "exports timing and outcome without request attributes, results or failure details",
    () =>
      Effect.gen(function* () {
        const lines: string[] = [];
        const tracer = makeLocalTracer((line) => lines.push(line));
        yield* Effect.succeed("private result").pipe(
          Effect.withSpan("MeetingFinder.search", {
            attributes: { email: "private@example.test" },
          }),
          Effect.provideService(Tracer.Tracer, tracer),
        );
        const output = JSON.parse(lines[0]!);
        expect(output).toMatchObject({
          type: "meeting-finder.span",
          operation: "MeetingFinder.search",
          outcome: "Success",
        });
        expect(output.durationMs).toBeGreaterThanOrEqual(0);
        expect(lines.join("")).not.toContain("private");
        yield* Effect.fail("secret failure").pipe(
          Effect.withSpan("meeting-finder.provider.gws"),
          Effect.provideService(Tracer.Tracer, tracer),
          Effect.result,
        );
        expect(JSON.parse(lines[1]!).outcome).toBe("Failure");
        expect(lines.join("")).not.toContain("secret");
      }),
  );

  it.effect("loads tracing through an injected ConfigProvider and reports invalid values", () =>
    Effect.gen(function* () {
      const lines: string[] = [];
      yield* Effect.void.pipe(
        Effect.withSpan("CLI.run"),
        Effect.provide(localTracingLayer((line) => lines.push(line))),
        Effect.provideService(
          ConfigProvider.ConfigProvider,
          ConfigProvider.fromUnknown({ MEETING_FINDER_TRACE: true }),
        ),
      );
      expect(lines).toHaveLength(1);
      const invalid = yield* Effect.void.pipe(
        Effect.provide(localTracingLayer(() => undefined)),
        Effect.provideService(
          ConfigProvider.ConfigProvider,
          ConfigProvider.fromUnknown({ MEETING_FINDER_TRACE: "invalid" }),
        ),
        Effect.result,
      );
      expect(invalid).toMatchObject({
        _tag: "Failure",
        failure: { code: "invalid_input", issues: [{ path: ["MEETING_FINDER_TRACE"] }] },
      });
    }),
  );
});
