import { Context, Effect } from "effect";
import type { FinderError } from "./errors.js";

import type {
  DirectoryKind,
  DirectoryResult,
  ExternalSource,
  SourceSummary,
} from "./domain/directory.js";
export type { DirectoryResult, SourceSummary } from "./domain/directory.js";
export class Directory extends Context.Service<
  Directory,
  {
    readonly list: (
      kind: DirectoryKind,
    ) => Effect.Effect<ReadonlyArray<SourceSummary>, FinderError>;
    readonly primary: Effect.Effect<string, FinderError>;
    readonly expand: (
      source: ExternalSource,
      groupAliases: Readonly<Record<string, string>>,
    ) => Effect.Effect<DirectoryResult, FinderError>;
  }
>()("meeting-finder/Directory") {}

export interface BusyInterval {
  readonly start: string;
  readonly end: string;
}

export interface CalendarAvailabilityResult {
  readonly timeMin: string;
  readonly timeMax: string;
  readonly calendars: Readonly<
    Record<string, { readonly busy: ReadonlyArray<BusyInterval>; readonly error?: string }>
  >;
}

export class CalendarAvailability extends Context.Service<
  CalendarAvailability,
  {
    readonly query: (
      calendarIds: ReadonlyArray<string>,
      timeMin: string,
      timeMax: string,
    ) => Effect.Effect<CalendarAvailabilityResult, FinderError>;
  }
>()("meeting-finder/CalendarAvailability") {}
