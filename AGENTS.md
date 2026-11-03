# Working agreement

Meeting Finder is designed from the domain language in [GLOSSARY.md](GLOSSARY.md) and the requirements in [SPEC.md](SPEC.md). Read those before changing a contract or behavior. Treat F01–F10 as the current baseline and P01–P04 as deferred work.

Keep domain and application rules independent of CLI, HTTP, Bun, browser, and `gws`. Add provider behavior through the `Directory` and `CalendarAvailability` services. Keep live and demo provider selection at the composition boundary in [src/layers.ts](src/layers.ts). Runtime resources belong at entry points and must be interruptible and scoped.

Import deep modules through their public files; see [src/README.md](src/README.md) before adding or importing implementation code. `mise run lint-boundaries` enforces these interfaces and dependency direction.

Use TypeScript 7.0.2, Effect 4.0.0, Bun 1.4.2, and Foldkit 0.167.0 as pinned. Use schemas and typed `FinderError` values at boundaries. Use `Clock` for application time. Do not add a second source of truth for request, audience, or search rules.

The first test seams are `MeetingFinder.resolve`, `MeetingFinder.search`, and one CLI process contract. Test provider process handling, HTTP, and browser behavior at their own boundaries. Prefer behavior and contract tests over tests that freeze private helpers.

Before handing off a change, run the checks relevant to it; for a baseline change use `mise run check`. Keep changes focused, document material design decisions, and do not claim a public release, deployment, or remote issue exists unless it does.
