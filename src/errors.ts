import { Schema, SchemaIssue } from "effect";

export const FinderIssueSchema = Schema.Struct({
  path: Schema.Array(Schema.Union([Schema.String, Schema.Int])),
  message: Schema.String,
});
export type FinderIssue = Schema.Schema.Type<typeof FinderIssueSchema>;

const common = {
  detail: Schema.String,
  resolution: Schema.String,
  issues: Schema.Array(FinderIssueSchema),
};

/** An input could not be decoded or violates an audience-level rule. */
export class InputValidationError extends Schema.TaggedError<InputValidationError>()(
  "InputValidationError",
  { ...common, code: Schema.Literal("invalid_input"), category: Schema.Literal("input") },
) {}

/** A decoded request is valid JSON but cannot produce a meaningful search. */
export class SearchValidationError extends Schema.TaggedError<SearchValidationError>()(
  "SearchValidationError",
  { ...common, code: Schema.Literal("invalid_search"), category: Schema.Literal("input") },
) {}

/** A provider was unavailable or could not be reached. */
export class ProviderUnavailableError extends Schema.TaggedError<ProviderUnavailableError>()(
  "ProviderUnavailableError",
  { ...common, code: Schema.Literal("provider_unavailable"), category: Schema.Literal("provider") },
) {}

/** A provider replied, but its response violated the availability contract. */
export class ProviderResponseError extends Schema.TaggedError<ProviderResponseError>()(
  "ProviderResponseError",
  {
    ...common,
    code: Schema.Literal("provider_response_invalid"),
    category: Schema.Literal("provider"),
  },
) {}

export type FinderError =
  | InputValidationError
  | SearchValidationError
  | ProviderUnavailableError
  | ProviderResponseError;

export const FinderErrorSchema = Schema.Union([
  InputValidationError,
  SearchValidationError,
  ProviderUnavailableError,
  ProviderResponseError,
]);

export const isFinderError = (value: unknown): value is FinderError =>
  value instanceof InputValidationError ||
  value instanceof SearchValidationError ||
  value instanceof ProviderUnavailableError ||
  value instanceof ProviderResponseError;

export const issue = (path: ReadonlyArray<string | number>, message: string): FinderIssue => ({
  path: [...path],
  message,
});

const formatSchemaIssue = SchemaIssue.makeFormatterStandardSchemaV1();

/** Flatten the typed Effect issue tree, retaining nested paths and useful messages. */
export const issuesFromSchemaError = (error: unknown): ReadonlyArray<FinderIssue> => {
  if (!Schema.isSchemaError(error)) return [issue([], String(error))];
  return formatSchemaIssue(error.issue).issues.map((entry) => ({
    message: entry.message,
    path: (entry.path ?? []).map((part) => {
      const key = typeof part === "object" ? part.key : part;
      return typeof key === "symbol" ? String(key) : key;
    }),
  }));
};

export const inputError = (
  detail: string,
  resolution: string,
  issues: ReadonlyArray<FinderIssue> = [],
): InputValidationError =>
  new InputValidationError({
    code: "invalid_input",
    category: "input",
    detail,
    resolution,
    issues,
  });

export const searchError = (
  detail: string,
  resolution: string,
  issues: ReadonlyArray<FinderIssue> = [],
): SearchValidationError =>
  new SearchValidationError({
    code: "invalid_search",
    category: "input",
    detail,
    resolution,
    issues,
  });

export const providerUnavailable = (
  detail: string,
  resolution: string,
  issues: ReadonlyArray<FinderIssue> = [],
): ProviderUnavailableError =>
  new ProviderUnavailableError({
    code: "provider_unavailable",
    category: "provider",
    detail,
    resolution,
    issues,
  });

export const providerResponse = (
  detail: string,
  resolution: string,
  issues: ReadonlyArray<FinderIssue> = [],
): ProviderResponseError =>
  new ProviderResponseError({
    code: "provider_response_invalid",
    category: "provider",
    detail,
    resolution,
    issues,
  });
