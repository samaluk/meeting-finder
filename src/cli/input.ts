import { Effect, Schema, type FileSystem, type Stdio, type Stream } from "effect";
import { inputError, isFinderError, type FinderError } from "../errors.js";
import { initialRequest } from "../defaults.js";
import { ByteLimitExceeded } from "../bounded-stream.js";
import { InvalidJson, MAX_INPUT_BYTES, readJsonInput } from "../json-input.js";
import { flag, sourceFlags, overrides, numberFlag, type Parsed } from "./arguments.js";
const error = (detail: string, resolution = "Correct the command input") =>
  inputError(detail, resolution);
const withFlags = (request: unknown, parsed: Parsed): Effect.Effect<unknown, FinderError> =>
  Effect.gen(function* () {
    const object = yield* Schema.decodeUnknownEffect(Schema.Record(Schema.String, Schema.Unknown))(
      request,
    ).pipe(
      Effect.mapError(() =>
        error("Input must be a JSON object", "Provide a request matching schema"),
      ),
    );
    const sources = sourceFlags(parsed);
    const adjustments = overrides(parsed);
    const values: Record<string, unknown> = { ...object };
    for (const [field, additions] of [
      ["sources", sources],
      ["overrides", adjustments],
    ] as const) {
      if (additions.length === 0) continue;
      const existing = yield* Schema.decodeUnknownEffect(Schema.Array(Schema.Unknown))(
        object[field] ?? [],
      ).pipe(
        Effect.mapError(() =>
          error(`${field} must be an array`, "Provide a request matching schema"),
        ),
      );
      values[field] = [...existing, ...additions];
    }
    for (const [key, field] of [
      ["start-date", "startDate"],
      ["end-date", "endDate"],
      ["timezone", "timeZone"],
    ] as const) {
      const value = flag(parsed, key);
      if (value !== undefined) values[field] = value;
    }
    for (const [key, field] of [
      ["duration", "durationMinutes"],
      ["step", "stepMinutes"],
      ["buffer", "bufferMinutes"],
      ["min-attendance", "minAttendance"],
      ["max-results", "maxResults"],
    ] as const) {
      const value = numberFlag(parsed, key);
      if (value !== undefined) values[field] = value;
    }
    return values;
  });

export const readJson = (stream: Stream.Stream<Uint8Array, unknown>) =>
  readJsonInput(stream).pipe(
    Effect.mapError((cause) => {
      if (cause instanceof ByteLimitExceeded)
        return error("Input exceeds 128 KiB", "Use a smaller request");
      if (cause instanceof InvalidJson)
        return error("Input is not valid JSON", "Provide valid JSON");
      return isFinderError(cause)
        ? cause
        : error(`Unable to read input: ${String(cause)}`, "Check the input file or stream");
    }),
  );

export const readInput = (
  parsed: Parsed,
  fs: FileSystem.FileSystem,
  stdio: Stdio.Stdio,
  now: Date,
): Effect.Effect<unknown, FinderError> => {
  const file = flag(parsed, "config") ?? parsed.positional[0];
  if (file === undefined) {
    const initial = initialRequest({ demo: parsed.demo, now });
    if (!parsed.demo && sourceFlags(parsed).length > 0) {
      const { participants: _participants, ...defaults } = initial;
      return withFlags(defaults, parsed);
    }
    return withFlags(initial, parsed);
  }
  return readJson(
    file === "-" ? stdio.stdin : fs.stream(file, { bytesToRead: MAX_INPUT_BYTES + 1 }),
  ).pipe(Effect.flatMap((input) => withFlags(input, parsed)));
};
