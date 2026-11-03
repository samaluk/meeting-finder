import { Effect } from "effect";
import {
  isFinderError,
  providerResponse,
  providerUnavailable,
  type FinderError,
} from "../../errors.js";
import { gwsFailure } from "../gws-diagnostics.js";
import type { GwsProcess, GwsProcessResult } from "../gws-process.js";
const MAX_PAGES = 100;
export const error = (
  detail: string,
  resolution = "Check gws authentication and provider access",
): FinderError => providerUnavailable(detail, resolution);
export const invalid = (detail: string): FinderError =>
  providerResponse(detail, "Check the gws response and provider API version");
export const object = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);
export const text = (x: unknown): x is string => typeof x === "string" && x.length > 0;
export const asText = (o: Record<string, unknown>, k: string) => {
  const value = o[k];
  return text(value) ? value : undefined;
};
export const provider = (detail: string): Effect.Effect<never, FinderError> =>
  Effect.fail(invalid(detail));
export const command = (
  parts: ReadonlyArray<string>,
  params?: Record<string, unknown>,
  body?: Record<string, unknown>,
) => [
  ...parts,
  ...(params ? ["--params", JSON.stringify(params)] : []),
  ...(body ? ["--json", JSON.stringify(body)] : []),
];
const json = (result: GwsProcessResult): unknown => {
  if (result.exitCode !== 0) throw gwsFailure(result.stderr, result.exitCode);
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw invalid("gws returned malformed JSON");
  }
};
export const runJson = (p: GwsProcess, args: ReadonlyArray<string>) =>
  Effect.suspend(() => p.run(args)).pipe(
    Effect.flatMap((r) =>
      Effect.try({
        try: () => json(r),
        catch: (e) => (isFinderError(e) ? e : invalid("gws response could not be decoded")),
      }),
    ),
    Effect.withSpan("meeting-finder.provider.gws", {
      attributes: { operation: args.slice(0, 3).join(" ") },
    }),
  );
export const pages = (
  p: GwsProcess,
  args: (token?: string) => ReadonlyArray<string>,
  extract: (x: unknown) => {
    readonly members: ReadonlyArray<{ id: string; name?: string }>;
    readonly omitted?: ReadonlyArray<{ id?: string; reason: string }>;
  },
) => {
  const loop = (
    token: string | undefined,
    seenTokens: ReadonlySet<string>,
    all: ReadonlyArray<{ id: string; name?: string }>,
    omitted: ReadonlyArray<{ id?: string; reason: string }>,
    n: number,
  ): Effect.Effect<
    {
      readonly members: ReadonlyArray<{ id: string; name?: string }>;
      readonly omitted: ReadonlyArray<{ id?: string; reason: string }>;
    },
    FinderError
  > => {
    if (n >= MAX_PAGES)
      return Effect.fail(error("gws pagination exceeded 100 pages; source is incomplete"));
    if (token !== undefined && seenTokens.has(token))
      return Effect.fail(error("gws pagination repeated a page token; source is incomplete"));
    const requestedTokens = token === undefined ? seenTokens : new Set([...seenTokens, token]);
    return runJson(p, args(token)).pipe(
      Effect.flatMap((v) => {
        return Effect.try({
          try: () => extract(v),
          catch: (e) => (isFinderError(e) ? e : invalid("gws paginated response is malformed")),
        }).pipe(
          Effect.flatMap((got) => {
            const rawNext = object(v) ? v.nextPageToken : undefined;
            if (rawNext !== undefined && rawNext !== null && !text(rawNext))
              return Effect.fail(invalid("gws pagination token is malformed"));
            const next = text(rawNext) ? rawNext : undefined;
            if (next && requestedTokens.has(next))
              return Effect.fail(
                error("gws pagination repeated a page token; source is incomplete"),
              );
            return next
              ? loop(
                  next,
                  requestedTokens,
                  [...all, ...got.members],
                  [...omitted, ...(got.omitted ?? [])],
                  n + 1,
                )
              : Effect.succeed({
                  members: [...all, ...got.members],
                  omitted: [...omitted, ...(got.omitted ?? [])],
                });
          }),
        );
      }),
    );
  };
  return loop(undefined, new Set(), [], [], 0);
};
