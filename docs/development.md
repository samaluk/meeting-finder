# Development cycle

The project follows the design-first cycle associated with Matt Pocock's skills work (reference checked at commit `49dd158d1076134a641b33efb035946536778336`). The useful unit is a small, reviewable vertical slice with explicit domain language, not a framework-first task list.

Start with a trigger and a concrete example. Name the domain concepts using [GLOSSARY.md](../GLOSSARY.md), write or adjust the relevant requirement in [SPEC.md](../SPEC.md), and identify the boundary that proves the behavior. Compare the desired interface with the schema owners in `src/domain/`, `src/meeting-finder.ts`, and the provider seams before writing implementation. `src/contracts.ts` remains the public compatibility barrel. Build the smallest slice through domain, application, and transport. Add tests at the approved interface, then run both standards review and specification review. Commit or open a PR only when that action is requested.

The current approved first seams are `MeetingFinder.resolve`, `MeetingFinder.search`, and one CLI process contract covering JSON output and exit codes. Provider process handling, HTTP protocol behavior, and browser behavior get their own boundary tests when those slices change. Private search helpers do not need direct tests when the facade proves the rule.

## Repository loop

Use mise as the single project bootstrap and task entry point:

```sh
mise install
mise run install
mise run check
```

The committed tools are Bun 1.4.2, hk 2.5.0, and jactionlint 2.0.2. TypeScript, Effect, Foldkit, Oxfmt, Oxlint, Fallow 3.38.1, and Vitest are locked in `package.json`/`bun.lock`. Bun 1.4.2 does not provide a formatter, so formatting is Oxfmt and linting is Oxlint. hk orchestrates focused checks; jactionlint applies only to workflow files. `mise run setup-hooks` installs the local hook.

Run focused checks while iterating:

```sh
bun --bun vitest run test/search.test.ts
bun --bun vitest run test/cli.test.ts
mise run lint-boundaries
bun run typecheck
bun run effect:diagnostics
bun run build
```

Effect diagnostics are a real gate and must not be suppressed. Keep time injectable through `Clock` and provider services simulated in tests. Live Google calls belong behind `GwsProcess`; `gws` authentication is an external prerequisite and no credentials belong in tests or this repository.

Use the ownership map in [design.md](design.md) and the [module-interface guide](../src/README.md) when placing new behavior. Keep pure scheduling rules separate from provider acquisition, import concrete schema owners in production, and leave provider selection in `src/layers.ts`. Fallow checks private interfaces, dependency direction, coverage, runtime cycles, and targeted import policies in both the hk and package check pipelines. Its separate unresolved-import check catches misspelled module paths. Type-only imports remain subject to boundaries, but are excluded from cycle detection.

Before changing a module, inspect its rules with `bunx --no-install --bun fallow guard <file>`. After changing an architecture rule, prove both acceptance and rejection: run the clean check, introduce a temporary forbidden import, verify a nonzero exit with the intended finding, remove the probe, and rerun. Do not suppress a finding merely to make the gate pass. Use `fallow health` or `fallow dupes` for additional review evidence when useful; their broader findings are outside the architecture gate.

## Scope discipline

When a contract changes, update discovery output, HTTP/CLI behavior, tests, and the relevant docs together. Preserve the distinction between a participant snapshot and source configuration. Do not silently relax required status, dates, duration, calendars, or working rules when no candidate exists. Record DST/grid and public-contract choices in the design docs before changing the contract.

Pitchfork is intentionally deferred: it may supervise a local HTTP process later if development lifecycle pain justifies it, but it is not needed for core tests or a production daemon. The local `serve` command already owns the scoped HTTP lifecycle. Usage is also deferred because it would add a second CLI contract source to an Effect/TypeScript CLI; the decision is about keeping one CLI contract, not about requiring or avoiding a Rust compiler. `jactionlint` is included because workflows already exist; it has no role in domain validation.
