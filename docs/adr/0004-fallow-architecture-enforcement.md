# ADR 0004: Enforce architecture with Fallow

Status: accepted

## Context

Module ownership needs an executable constraint. The original architecture tests built a custom graph with text matching and Bun's transpiler. Dependency-cruiser offered a maintained graph analyzer, but its TypeScript backend did not support the pinned TypeScript 7 compiler and required a separate SWC backend. The user proposed Fallow's architecture analysis before that migration was finished.

## Decision

Use Fallow 3.38.1 as an exact project dev dependency. Bun installs the platform binary from the lockfile; no global install, downloaded CLI at check time, TypeScript downgrade, or Rust toolchain is required. Remove the custom graph tests and the dependency-cruiser/SWC dependencies.

Declare explicit zones and allowed dependencies in `.fallowrc.json`. Public module files compose private implementation folders. `src/search/` is private to `src/search.ts`; CLI, HTTP, Google mapping, and browser views follow the same convention. `src/domain/` contains deliberately shared schema/value interfaces. `http-options.ts` and `cli-output.ts` are separate public interfaces with concrete callers. Every analyzed source file must belong to a zone, including unreachable files.

Fallow traces named and default reexports to their origin. Private factories therefore stay private instead of being exposed through a barrel. Google mapping tests acquire the publicly composed provider layers with an injected fake `GwsProcess`, exercising the same interface used by composition.

Run `fallow architecture --fail-on-issues` and a focused `fallow dead-code --unresolved-imports --fail-on-issues` in `lint:boundaries`. The architecture command covers boundaries, coverage, runtime cycles, reexport cycles, and the declarative policy pack. The second command covers resolution because unresolved imports are outside the architecture command's selection. Enable parse-failure gating. Include this task in mise, hk, package checks, and the existing CI pipeline.

Zones govern project files, including the restriction that production imports concrete schema owners instead of the compatibility contract barrel. `.fallow-policy.json` separately restricts selected runtime packages, runtime Effect imports in pure scheduling rules, and direct application `Date.now` calls. These are data-only policies over Fallow's parser output. They do not execute another custom scanner. Keep dead-code cleanup, duplication, and complexity analysis available for investigation without adding their broader findings to this gate.

## Consequences

Changing a module boundary requires updating a reviewable zone or policy. Type-only private imports fail just like value imports. Intentional forbidden imports, reexports, cycles, unclassified files, unresolved paths, and parse errors must fail before accepting a tooling change; restoring the source must make the gate pass again.

Fallow parses TypeScript with Oxc independently of the compiler. It skips type-only edges during cycle analysis; boundary checks still include those edges. Import policies match declared specifiers and do not prove all possible side effects. A dynamically computed import cannot always be resolved statically. Tools enforce declared dependency constraints and supply review evidence; domain language, cohesive responsibilities, small useful interfaces, Effect lifecycle, and behavior still need design judgment and contract tests.

Sources: [Fallow boundaries](https://fallow.tools/docs/configuration/boundaries/), [architecture command](https://fallow.tools/docs/cli/architecture/), [limitations](https://fallow.tools/docs/analysis/limitations/), and the [deep-module skill](https://github.com/mattpocock/skills/tree/main/skills/in-progress/setup-ts-deep-modules).
