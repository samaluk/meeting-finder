# ADR 0005: Concentrate source, calendar evidence, and browser lifecycle policy

Status: accepted

## Context

Three interfaces obscured the policy they owned. Directory adapters accepted local person/email sources and participant policy even though audience resolution handled them before calling a provider. Google mapping and search separately interpreted malformed intervals and coverage, and disagreed about retaining known busy intervals. Browser handlers repeated cancellation and token checks while separate loading and pending-body fields allowed inconsistent request states. A clipboard failure could settle the loading state of an unrelated search.

## Decision

Audience resolution classifies sources once. Local person/email expansion, identity normalization, precedence, provenance, and participant policy remain in `src/audience.ts`. `Directory.expand` accepts only an `ExternalSource` with `type` and `ref`: Chat spaces, Google Groups, or contact groups. Adapters switch exhaustively over these kinds. Listable directory kinds remain separate because Google Groups can be expanded but are not listed. Request schemas and discovery contracts do not change.

`src/domain/availability.ts` owns the pure calendar evidence policy shared by Google mapping and search. Busy intervals require parseable instants and a positive elapsed duration. Invalid entries are skipped while valid entries are retained; any malformed or missing evidence marks the calendar unknown. Coverage must be a positive interval containing the complete requested interval. The Google adapter still validates raw response shapes, validates each batch, intersects batch coverage, marks omitted calendars, and retains the existing batch and concurrency limits. Search independently validates every provider result, including demo and injected providers, through the same policy. The availability service contract is unchanged.

Known busy blocks remain available for conflict explanations even when another entry makes that calendar unknown. The existing `outside_hours` then `busy` then `unknown` precedence still applies. Unknown availability supplies no trusted free portions and cannot satisfy an attendance rule. A missing Google `busy` array is unknown rather than an empty, trusted calendar.

`web/app.ts` owns the browser update interface and hides request orchestration in `web/app/lifecycle.ts`. The model has one request phase: `Idle`, `Replacing` with the captured resolve/search draft, or `Running` with the active config/resolve/search kind. Loading is derived. Draft bodies remain unknown until commands validate them, so an invalid edit produces a fielded error without invalidating the browser model schema.

Foldkit commands use name-based `interrupt: true`. Replacements wait for the targeted interruption acknowledgement before starting; interruption and successor commands are never issued in one concurrent batch. Acknowledgements must match both the current tokens and the replacing kind, and are consumed once. Results must match the current tokens and running kind; request failures settle only running work. Startup configuration uses the same tokens and cannot overwrite later edits. Clipboard failures use their own message and only update the error field.

Fallow makes `web/app/` private to its public update module and applies the existing browser runtime restrictions there. Tests continue to use `MeetingFinder.resolve`, `MeetingFinder.search`, public Google layers with a fake `GwsProcess`, and the Foldkit update/command interfaces.

## Consequences

Provider interfaces describe the capabilities callers actually need and no longer carry unused participant policy. Calendar evidence has one interpretation without treating adapters as trusted. Browser cancellation, stale response rejection, and request completion have one owner while field edits stay in the public update module. These are responsibility boundaries, not a general source plugin system, request registry, or service for every helper.

Two corrections are user-visible: mixed malformed calendar data retains known conflicts, and missing busy data is unknown. Clipboard errors no longer hide an active search. Request, search result, CLI, and HTTP wire contracts remain compatible.
