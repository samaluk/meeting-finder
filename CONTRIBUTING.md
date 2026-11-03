# Contributing

Contributions start with the product language and constraints. Read [SPEC.md](SPEC.md), [GLOSSARY.md](GLOSSARY.md), and [docs/development.md](docs/development.md), then describe the user-visible rule or contract being changed. A source change should identify which F requirement it serves and whether it affects an open design decision.

The normal loop is:

1. Define the domain behavior and examples.
2. Update the specification or interface when the public contract changes.
3. Compare the intended interface with existing contracts and adapters.
4. Build one vertical slice through the domain, application, and relevant transport.
5. Test an approved boundary, usually the MeetingFinder facade or a process/HTTP contract.
6. Run standards and specification review, then commit or open a PR only when requested.

Use `mise install` and `mise run install` for setup. Use `mise run check` before a handoff. It runs frozen dependency installation, Oxfmt, Oxlint, strict TypeScript, Effect diagnostics, Vitest, both web builds, and workflow checks through hk. `mise run setup-hooks` installs only this repository's local hk hook.

Use demo mode for examples and tests that need no Google account. Live provider tests use a fake `GwsProcess`; they must not invoke a user's real calendars. Keep credentials and personal configuration out of the repository.

Commit messages should state the change in the domain or contract. Pull requests should explain the trigger, resulting behavior, affected F requirements, validation, and any remaining limitation. Do not include generated credentials, local paths from another checkout, or unsupported release and deployment claims.
