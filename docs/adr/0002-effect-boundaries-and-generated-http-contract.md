# ADR 0002: Use Effect boundaries for validation, transport, cancellation, and providers

Status: accepted

## Context

Meeting Finder has several callers of the same use cases: a CLI, a local HTTP API, a Foldkit browser, and an agent-facing contract. It also has live provider processes and deterministic demo services. The first implementation had several places where input decoding, HTTP response shapes, request cancellation, and provider limits could drift apart.

The project needs domain language to remain independent of transport and runtime details while still giving each boundary useful schemas, typed failures, and interruption behavior.

## Decision

Use Effect schemas as the public boundary vocabulary. Decode and normalize a request once at the facade boundary, then pass the normalized request through audience resolution and search. Keep reusable value schemas for identities, dates, local times, and timezones next to the domain contracts.

Represent failures with the concrete tagged `FinderError` union. Preserve nested schema issue paths, and map provider failures into provider-specific categories without leaking untyped exceptions across service or transport boundaries.

Declare the HTTP surface once with Effect `HttpApi`. Derive server handlers, the typed `HttpApiClient`, and OpenAPI/discovery output from that declaration. Keep protocol safeguards such as bounded request bodies, host/origin checks, and compatibility aliases in a surrounding adapter.

Model browser work as Foldkit commands and pure updates. Interrupt replacement operations before starting their successors, and attach revision and operation tokens to responses. Accept a response only when those tokens still identify the current request, so cancellation and stale-response protection do not depend on a global mutable abort registry.

Load provider timeout, concurrency, and retry settings through an Effect configuration service at the composition boundary. Use bounded exponential jittered retries only for transient process outcomes. Keep provider fan-out bounded, cap free/busy calendar batches at two concurrent requests, and scope every child process so timeout and interruption release it.

Expose local tracing only when explicitly enabled. Emit static operation spans to stderr with identifiers, duration, and outcome, while excluding request data, provider details, result contents, and error text.

## Consequences

Domain tests can exercise normalized requests and typed errors without a browser, HTTP server, Bun process, or Google credentials. The generated HTTP client and OpenAPI document stay aligned with the server and browser contract. CLI and web callers can render the same field paths. Interrupted provider work has a defined cleanup boundary, and operational limits are testable without mutating the host environment.

The composition layer carries more setup responsibility, and adapters must translate external failures into the shared error vocabulary. Effect and Foldkit APIs remain implementation dependencies at the application boundaries, while the search rules stay independent of those transport concerns.

## Alternatives

Separate schemas for CLI, HTTP, and browser would create multiple contract sources and allow behavior drift. A manually maintained HTTP router and OpenAPI document would duplicate endpoint definitions. A global browser abort registry would make cancellation mutable and cross-operation. Reading environment variables during provider module import would make configuration hard to test and would couple library loading to process state. These alternatives were rejected.
