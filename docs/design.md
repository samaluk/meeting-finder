# Design

Meeting Finder has one application contract and several adapters. The center is the `MeetingFinder` facade in [src/meeting-finder.ts](../src/meeting-finder.ts): `resolve(input)` expands sources into a `ResolvedAudience`; `search(input)` validates the search request, resolves the audience, and evaluates it through `searchAudience`. The facade does not know whether the services are live or simulated.

## Module ownership

The schema owners are under `src/domain/`: values, participant policy, requests, directory results, resolved audiences, and search results. `src/contracts.ts` reexports the public contract for compatibility; production modules import the specific owner they need. Directory result schemas are shared by provider services and the HTTP contract. `src/errors.ts` owns typed failures and field issues. `src/mode.ts` owns the live/demo vocabulary without depending on HTTP.

`src/request-decoding.ts` decodes and defaults unknown input at the facade. `RequestInputSchema` and `SearchInputSchema` distinguish resolution-compatible input from a request ready for search. Audience and search code consume typed values, and search carries a `NormalizedSearchRequest` rather than applying another set of defaults. `src/audience.ts` owns local person/email expansion, identity normalization, deduplication, source precedence, overrides, limits, and provenance. It classifies sources once and passes only external collection references to `Directory.expand`; required status and weight remain application policy.

`src/search.ts` orchestrates validation, the availability query, the evaluation clock, and candidate evaluation. The scheduling modules isolate the rules:

| Module                 | Responsibility                                                               |
| ---------------------- | ---------------------------------------------------------------------------- |
| `search/window.ts`     | Validate search rules and construct the inclusive local-date window          |
| `search/calendars.ts`  | Validate provider coverage and construct a trusted calendar snapshot         |
| `search/interval.ts`   | Compare and subtract half-open instant intervals                             |
| `search/attendance.ts` | Intersect working rules with availability and evaluate continuous attendance |
| `search/candidates.ts` | Score, rank, and select candidates without overlap                           |

Attendance, interval, and candidate functions are pure. They receive values and return values, without services, clocks, or transport dependencies. Effect remains responsible for typed failures, external operations, and interruption at the application boundary. The search loop yields periodically so a long evaluation remains cancellable.

`src/domain/availability.ts` owns the shared pure interpretation of busy intervals and coverage. Malformed entries make availability unknown while valid busy blocks remain available for conflict explanations. Missing busy arrays are unknown, and coverage must contain the entire positive requested interval. Google validates each batch and search independently validates every provider result through these same rules.

`src/providers.ts` defines the `Directory` and `CalendarAvailability` services. `Directory.expand` accepts only Chat spaces, Google Groups, and contact groups as `{ type, ref }`; listable directory kinds remain a separate contract. The Google implementation under `src/adapters/gws/` separates the shared JSON/pagination client, People and Contacts mapping, directory expansion, and free/busy mapping. `src/adapters/gws.ts` composes these implementations into layers. `src/adapters/gws-process.ts` owns bounded process I/O, retries, timeouts, and cleanup. `src/adapters/demo.ts` supplies the same services with simulated data.

Domain code depends on service interfaces. The composition boundary supplies their implementations:

```text
CLI / HTTP ------------> MeetingFinder facade
                              |
web -> generated HTTP client  v
                       audience + scheduling rules
                              |
                              v
                  Directory / CalendarAvailability
                              ^
                              |
                    demo or Google adapters

src/layers.ts composes provider implementations at the transport boundary.
```

This shared interface is an architectural boundary, not just a convenience. Keeping live and demo behavior behind the same services lets the domain be tested with deterministic data and lets every transport use the same rules. Per-transport meeting logic would make CLI, HTTP, and browser results drift and would make demo mode a separate product. The cost is that provider adapters must normalize imperfect external output into the service contracts.

The [Fallow zones](../.fallowrc.json) check dependency direction, including type imports: domain contracts stay within the domain, application rules depend on contracts and provider interfaces, and provider adapters do not import use cases or transport composition. Public files compose matching private folders; callers and tests cannot import private implementations, including through named reexports. Coverage requires every analyzed file to have a zone. Production imports the concrete schema owners rather than the compatibility-barrel zone. The [policy pack](../.fallow-policy.json) adds runtime-package and application-clock restrictions. `mise run lint-boundaries` also rejects unresolved imports, parse failures, and runtime cycles. Fallow excludes type-only edges from cycle detection. See [module interfaces](../src/README.md) and [ADR 0004](adr/0004-fallow-architecture-enforcement.md) for the conventions and limits. Behavior remains tested through the facade and adapter contracts.

## Typed boundaries and one transport contract

The public failure model is the concrete `FinderError` union: input validation, search validation, provider unavailability, and invalid provider responses. Every failure carries a stable code, category, human detail, a suggested resolution, and zero or more `issues` with field paths. Schema failures are converted at the boundary so nested fields such as `overrides[0].attendanceRule` remain useful to CLI, HTTP, and web callers.

`src/api.ts` is the single HTTP contract. Its Effect `HttpApi` declaration defines request envelopes, response schemas, problem responses, paths, and status/content-type annotations. `src/http/routes.ts` implements its use cases, while the browser uses the generated `HttpApiClient` and HTTP discovery derives OpenAPI from the same value. `src/http.ts` composes the application and scoped server. The local protocol layer handles bounded JSON input, host/origin policy, aliases, and compatibility envelopes around the generated route pipeline; it does not duplicate meeting handlers or domain rules.

## Domain decisions

Resolution and search are separate operations. Resolution may consult a directory but never ranks meeting intervals. Search requires meeting fields and at least one required participant. Source order, explicit participant fields, participant defaults, and ordered overrides have explicit precedence. A default fills an absent policy field; it never overwrites an explicit participant or source value. The CLI's required-before-optional parsing is an input adapter rule.

Participant identities use locale-independent case normalization. Explicit blocking calendars are trimmed and deduplicated; email calendar IDs normalize case, while opaque provider resource IDs retain it. `primary` is resolved lazily through `Directory`. Group alias keys and targets are trimmed, with blank or colliding keys rejected. Search consumes a `ResolvedSearchAudience` carrying its fully defaulted request. It samples `Clock` after availability returns, using that instant for both past-interval filtering and `searchedAt`.

Search evaluates a local-date and local-time grid, while comparing Temporal instants for elapsed-minute duration and half-open busy overlap. Local times at daylight-saving boundaries use Temporal's compatible disambiguation, so elapsed duration remains correct when offsets change. Each participant is classified with the precedence `outside_hours`, then `busy`, then `unknown`; rule satisfaction determines validity independently of this whole-meeting state. The score is the full weight of participants satisfying their attendance rules over total audience weight. Start/end rules require anchored elapsed minutes; percentage rules require one continuous block. Working intervals are clipped to the meeting and calendar blocks expanded by buffer are subtracted. Any unknown calendar removes all trusted free portions. Thresholds compare exact nanoseconds; displayed minutes do not decide validity. Valid candidates are ranked by available weight, count, and earliest start, then selected without overlap. If no valid candidate exists, blocked alternatives explain required conflicts and are never presented as valid proposals.

## Foldkit web model

The web layer follows Foldkit's model/message/update/view shape. The model contains the editable request or participant snapshot, one request phase, the latest result, and invalidation tokens. The phase is idle, replacing a resolve/search with its captured draft, or running config/resolve/search; loading is derived from it. Messages represent source resolution, participant policy edits, search, copy, import, and download actions. `update` applies local edits and invalidates a result whenever a search rule changes; a response is accepted only for the request generation that produced it. `view` renders the model and dispatches messages; it does not call providers directly.

`web/model.ts` owns schemas and initial state, `web/app.ts` owns pure updates with private request transitions under `web/app/lifecycle.ts`, `web/requests.ts` serializes requests and snapshots, and `web/commands.ts` owns external effects. `web/presentation.ts` formats domain values without depending on the model or rendering. `web/view.ts` composes rule, audience, and result sections under `web/view/`. Updates do not import the view; proposal copying and rendering share presentation functions. The model retains one search result, including evaluated and valid counts, the evaluation timestamp, and calendar errors; presentation derives from that result instead of maintaining duplicate candidate lists.

Network commands are name-interruptible Effect commands. A replacement captures its draft when clicked and starts only after its targeted interruption acknowledgement. The acknowledgement must match the current revision, operation, and replacing kind; duplicate acknowledgements cannot launch work twice. Results settle only the matching running request. Configuration carries the same tokens so late startup data cannot overwrite edits. Invalid drafts remain representable in the model and are decoded by commands into fielded failures. Clipboard failures have a separate message and cannot finish a network request. No mutable global abort registry is needed.

Prepared participants do not start a search. Resolving a source replaces the editable audience snapshot. Downloaded JSON is a participant snapshot and does not preserve source provenance. Browser storage is deliberately absent.

## Transports and safety

The CLI emits one JSON document by default and structured errors with exit code 1. `src/cli.ts` dispatches commands; `src/cli/arguments.ts` and `input.ts` own private flag policy and bounded input adaptation. `src/cli-output.ts` provides terminal output to both dispatch and the runtime entry point. The HTTP server runtime is loaded only by the serve command. CLI schema/capability discovery does not import the HTTP API implementation.

HTTP uses JSON requests and `application/problem+json` errors, binds to `127.0.0.1`, and validates Host and Origin. `src/http-options.ts` owns shared configuration; the private modules under `src/http/` separate generated handlers, protocol policy, problem mapping, and static/discovery responses. Both transports expose discovery documents. The agent skill is a read-only contract for the same facade. The provider adapter bounds input/output, paginates completely, batches free/busy queries, and scopes child processes so cancellation releases them.

`src/bounded-stream.ts` enforces byte limits before retaining chunks and concatenates once. `src/json-input.ts` supplies shared CLI/HTTP JSON framing; malformed JSON remains distinct from an I/O failure. Stream failures and interruption propagate. HTTP's pre-route body read is explicitly interruptible because the underlying response-finalization region is protected from interruption. Prepared configuration is schema-decoded once when composing the application. Server readiness is reported only after application initialization and binding succeed, using the actual bound address, including an ephemeral port selected by the operating system.

## Provider operations and observability

Provider configuration is an Effect service loaded at the composition boundary, with a test layer for deterministic limits. `MEETING_FINDER_GWS_TIMEOUT_MS` accepts 100–300000 milliseconds and defaults to 60000. `MEETING_FINDER_PROVIDER_CONCURRENCY` accepts 1–20 and defaults to 2. `MEETING_FINDER_PROVIDER_RETRIES` accepts 0–5 and defaults to 2. `MEETING_FINDER_PROVIDER_RETRY_BASE_MS` accepts 1–30000 milliseconds and defaults to 100. Invalid environment values become fielded `InputValidationError` values rather than untyped exceptions.

Retryable process outcomes are limited to transient signals such as 429, 5xx, resource exhaustion, deadlines, and timeouts. Authentication, permission, malformed-response, and other non-transient failures are not retried. Backoff is exponential, jittered, and bounded by the configured retry count. People, groups, and other provider fan-out operations use the configured concurrency; free/busy requests are split into provider-sized batches with at most two calendar batches active at once. A timed-out or interrupted child process is cleaned up by its scoped resource.

Tracing is opt in. When `MEETING_FINDER_TRACE=true`, the process boundary installs a local tracer that writes static application span records to stderr. It exports operation name, trace ID, span ID, duration, and outcome only. URLs, input values, provider arguments, result contents, and error details are intentionally excluded. The default tracer remains unchanged when the setting is absent or false.

See [ADR 0005](adr/0005-source-calendar-and-request-lifecycle-ownership.md) for source expansion, calendar evidence, and browser lifecycle ownership.

## Public distribution

The static landing page in `site/` composes the public facade with synthetic providers and a fixed Clock. It has its own build and no imports of the local server or Google adapters. Fallow enforces these boundaries; the public example does not implement a second scoring engine. Vercel publishes only `dist/site` and forbids script network connections. See [ADR 0006](adr/0006-public-site-and-provider-privacy.md).

The process boundary owns failure classification so raw provider stderr does not cross into application errors. Native gws authentication remains external to the application. Local HTTP responses disable caching and framing; these controls complement Host/Origin validation rather than introducing a new authentication flow.
