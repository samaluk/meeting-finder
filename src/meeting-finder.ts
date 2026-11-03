import { Effect } from "effect";
import { resolveAudience } from "./audience.js";
import type { FinderError } from "./errors.js";
import type { ResolvedAudience } from "./domain/audience.js";
import type { SearchResult } from "./domain/search.js";
import { CalendarAvailability, Directory } from "./providers.js";
import { searchAudience } from "./search.js";
import { decodeAudienceRequest, normalizeSearchRequest } from "./request-decoding.js";

export const MeetingFinder = {
  resolve: Effect.fn("MeetingFinder.resolve")(
    (input: unknown): Effect.Effect<ResolvedAudience, FinderError, Directory> =>
      decodeAudienceRequest(input).pipe(Effect.flatMap(resolveAudience)),
  ),

  search: Effect.fn("MeetingFinder.search")(
    (input: unknown): Effect.Effect<SearchResult, FinderError, Directory | CalendarAvailability> =>
      normalizeSearchRequest(input).pipe(
        Effect.flatMap(resolveAudience),
        Effect.flatMap(searchAudience),
      ),
  ),
} as const;
