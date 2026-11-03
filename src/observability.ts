import { Config, Effect, Layer, Tracer } from "effect";
import { inputError, issue } from "./errors.js";

/** Local diagnostics deliberately omit arguments, attributes, results and failure details. */
export const makeLocalTracer = (write: (line: string) => void): Tracer.Tracer =>
  Tracer.make({
    span(options) {
      const span = new Tracer.NativeSpan(options);
      const end = span.end.bind(span);
      span.end = (endTime, exit) => {
        end(endTime, exit);
        // Only static application operation names are exported, never HTTP URLs.
        if (!/^(?:meeting-finder\.|MeetingFinder\.|CLI\.)[A-Za-z0-9_.-]+$/u.test(span.name)) return;
        write(
          JSON.stringify({
            type: "meeting-finder.span",
            operation: span.name,
            traceId: span.traceId,
            spanId: span.spanId,
            durationMs: Number(endTime - span.startTime) / 1_000_000,
            outcome: exit._tag,
          }) + "\n",
        );
      };
      return span;
    },
  });

/** Opt-in stderr diagnostics, constructed at the process boundary. */
export const localTracingLayer = (write: (line: string) => void) =>
  Layer.effect(
    Tracer.Tracer,
    Config.Boolean("MEETING_FINDER_TRACE").pipe(
      Config.withDefault(false),
      Effect.mapError(() =>
        inputError("Invalid tracing configuration", "Set MEETING_FINDER_TRACE to true or false", [
          issue(["MEETING_FINDER_TRACE"], "Expected a boolean"),
        ]),
      ),
      Effect.map((enabled) => (enabled ? makeLocalTracer(write) : Tracer.nativeTracer)),
    ),
  );
