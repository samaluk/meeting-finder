import { Effect, Schema } from "effect";
import {
  RequestInputSchema,
  SearchInputSchema,
  type RequestInput,
  type NormalizedSearchRequest,
} from "./domain/request.js";
import { inputError, issuesFromSchemaError, type FinderError } from "./errors.js";
const failDecode = (error: unknown) =>
  inputError(
    String(error),
    "Provide a request matching RequestInputSchema",
    issuesFromSchemaError(error),
  );

const validateRequest = (request: RequestInput): Effect.Effect<RequestInput, FinderError> => {
  const sources = request.sources ?? [];
  const participants = request.participants ?? [];
  if (sources.length === 0 && participants.length === 0) {
    return Effect.fail(
      inputError("At least one source or participant is required", "Add an audience member"),
    );
  }
  return Effect.succeed(request);
};

export const decodeAudienceRequest = (input: unknown) =>
  Schema.decodeUnknownEffect(RequestInputSchema, { errors: "all" })(input).pipe(
    Effect.mapError(failDecode),
    Effect.flatMap(validateRequest),
  );
/** Decode and default the request once at the application boundary. */
export const normalizeSearchRequest = (
  input: unknown,
): Effect.Effect<NormalizedSearchRequest, FinderError> =>
  Schema.decodeUnknownEffect(SearchInputSchema, { errors: "all" })(input).pipe(
    Effect.mapError((error) =>
      inputError(
        "Invalid search request",
        "Provide dates, timezone, and duration within limits",
        issuesFromSchemaError(error),
      ),
    ),
    Effect.tap(validateRequest),
    Effect.map((request) => {
      const normalized = {
        ...request,
        stepMinutes: request.stepMinutes ?? 15,
        bufferMinutes: request.bufferMinutes ?? 0,
        minAttendance: request.minAttendance ?? 1,
        maxResults: request.maxResults ?? 12,
      } satisfies NormalizedSearchRequest;
      return normalized;
    }),
  );
