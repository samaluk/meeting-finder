# Module interfaces

A deep module exposes substantial behavior through a small interface. This repo uses a public file with a matching private implementation folder:

```text
src/
  search.ts              public interface: searchAudience
  search/                private implementation, at any nesting depth
    attendance.ts
    candidates.ts
    calendars.ts
    interval.ts
    window.ts
```

Copy this shape for a new module when implementation hiding is useful. Put the callable interface in `<name>.ts` and implementation in `<name>/`; declare the public and private zones in [the Fallow configuration](../.fallowrc.json). Existing roots are `src/cli`, `src/http`, `src/search`, `src/adapters/gws`, `web/app`, and `web/view`. This adapts the [setup-ts-deep-modules skill](https://github.com/mattpocock/skills/tree/main/skills/in-progress/setup-ts-deep-modules) to the existing source layout.

**Public interfaces.** Code outside a module imports its public file, never its implementation folder. The folder is private at every depth. A module may expose another small file when callers need a separate interface: `http-options.ts` provides lightweight HTTP configuration without loading the server, and `cli-output.ts` owns terminal output shared by command dispatch and the runtime entry point. `src/domain/` intentionally exposes focused value/schema files for requests, participant policy, audiences, and results, plus pure calendar evidence rules shared across provider and search boundaries.

**Internal freedom.** A public file may compose its private implementation. Implementation files collaborate inside that module and import shared contracts as allowed by their zone. Other modules use the public interface. Prefer a few deliberate exports over barrel files that reexport an entire subtree. Fallow follows named and default reexports to their declaring module, so reexporting a private factory does not make it public. Provider tests obtain `Directory` and `CalendarAvailability` through the public Google layers with a fake process. `contracts.ts` remains a compatibility barrel for consumers and tests; production code imports the concrete schema owner.

**Tests through the interface.** Tests under `test/` use the same public files as callers, and may share their own fixtures. They may not import private implementation, including through type-only imports. Production code may not import test code. Scheduling behavior remains tested through `MeetingFinder.resolve` and `MeetingFinder.search`. Browser lifecycle tests use the public `web/app.ts` update interface and commands rather than importing `web/app/`.

**Dependency direction.** Domain contracts stay independent of application and transport code. Application rules depend on provider interfaces; composition supplies their implementations. Browser values and updates do not import server composition or rendering. Pure attendance and ranking functions can import shared types but cannot load the Effect runtime. Production cannot import tests. Every analyzed file must belong to a zone, so a new unclassified file fails the gate, even if no entry point imports it. Zone patterns use first-match order; put specific zones before broader ones.

Run `mise run lint-boundaries` or `bun run lint:boundaries`. Both `mise run check` and `bun run check` include this gate. Fallow 3.38.1 is an exact project dev dependency, installed through the Bun lockfile. Its Oxc parser handles TypeScript syntax without invoking the TypeScript compiler; TypeScript and Effect diagnostics retain their own checks. The [policy pack](../.fallow-policy.json) bans selected runtime packages in core/browser zones, runtime Effect imports in pure rules, and direct `Date.now` calls in application/search code. The `contracts` zone blocks production imports of the compatibility barrel.

The gate runs `fallow architecture --fail-on-issues` for boundaries, policies, and cycles, followed by a focused unresolved-import check. Parse failures also fail the run. Runtime cycles, including lazy imports, are errors. Fallow excludes type-only edges from cycle detection, while boundary rules still check type-only imports. Boundary checks govern project files; package restrictions come from the explicit policy pack. These checks enforce declared dependencies, not conceptual cohesion or every possible side effect.

Inspect the architecture before editing:

```sh
bunx --no-install --bun fallow list --boundaries
bunx --no-install --bun fallow guard src/search.ts src/search/attendance.ts
bunx --no-install --bun fallow trace --path src/meeting-finder.ts src/search/attendance.ts
```

For a review, `fallow health` and `fallow dupes` provide additional evidence about complexity and repeated code. They are advisory tools to investigate; they do not run as part of the architecture gate or automatically justify another module.
