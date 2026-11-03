# ADR 0003: Organize modules around domain and boundary ownership

Status: accepted

## Context

The facade, provider services, and generated HTTP contract give Meeting Finder stable public seams. Within those seams, several modules accumulated responsibilities that change for different reasons: all schemas in one barrel, provider acquisition beside attendance arithmetic, Google directory and calendar mapping together, HTTP policy beside use-case handlers, and proposal formatting inside rendering.

Those dependencies made it harder to change one rule or adapter without loading or understanding unrelated code. The project needs low coupling and high cohesion while preserving its existing CLI, HTTP, browser, and facade behavior.

## Decision

Give each domain contract an owner under `src/domain/`. Keep `src/contracts.ts` as a compatibility reexport and have production modules import concrete owners. Reuse schemas for directory results, source summaries, participant policy, and mode rather than defining transport copies.

Decode unknown requests and apply search defaults at the facade boundary in `src/request-decoding.ts`. Audience resolution consumes typed requests. Search coordinates the availability service, response validation, Clock, and candidate grid; pure attendance, interval, scoring, ranking, and selection functions live under `src/search/`, private to `src/search.ts`. Keep Effect services for external capabilities rather than introducing a service for each helper.

Split Google mapping by provider responsibility behind the existing services. Share one bounded JSON/pagination client and the same group expansion paths. Keep subprocess lifetime, timeout, retry, and byte limits in the scoped process adapter. Continue selecting live and demo layers only in `src/layers.ts`.

Separate CLI argument policy, input adaptation, and output from command routing. Separate HTTP configuration, protocol safeguards, generated use-case handlers, and discovery from server composition. Load the HTTP runtime only for the CLI serve command.

Keep browser updates independent of rendering. Put request/snapshot serialization in `web/requests.ts`, pure domain formatting in `web/presentation.ts`, external work in Foldkit commands, and page sections under `web/view/`. Reuse the same example audience in CLI defaults and the browser.

Check dependency direction and runtime cycles with Fallow as specified in [ADR 0004](0004-fallow-architecture-enforcement.md). Retain behavior tests at `MeetingFinder.resolve`, `MeetingFinder.search`, and the existing adapter boundaries.

## Consequences

A scheduling rule can change without touching Google parsing, and a protocol or presentation change does not require importing server runtime into domain or browser state. Public contracts keep one schema source while tests and consumers can retain the compatibility barrel. Scoped resources, cancellation, typed failures, precedence, and continuous attendance semantics stay at their existing boundaries.

There are more files and explicit imports. A module is justified by a cohesive responsibility, not a line-count limit; related policy remains together. The architecture rules enforce the current dependency directions and need deliberate updates when a real architectural boundary changes. They supplement behavior tests and do not prove all architectural properties.
