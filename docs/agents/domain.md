# Domain agent guide

Use the canonical terms in [GLOSSARY.md](../../GLOSSARY.md). The audience is a deduplicated set of participants; a source contributes memberships and initial policy; an override adjusts an existing participant. Resolution expands and normalizes. Search evaluates intervals. A candidate is valid only when every required participant satisfies their attendance rule and minimum attendance is met. A blocked alternative is never a candidate.

The public flow is:

```text
RequestInput -> MeetingFinder.resolve -> ResolvedAudience
RequestInput -> MeetingFinder.search  -> SearchResult
```

`ResolvedAudience.request` contains the normalized request. `SearchResult` includes the audience, `timeZone`, `searchedAt`, candidates, blocked alternatives, `evaluatedCount`, `validCount`, and `calendarsWithErrors`. Participant observations use `free`, `busy`, `outside_hours`, and `unknown`. Unknown is conservative; outside-hours explanations precede busy, which precedes unknown.

Policy precedence is source order, then explicit participant fields, then participant defaults, then ordered overrides. Defaults fill only absent policy fields and never overwrite an explicit value. CLI source flags are parsed required first and optional second; required overrides are applied after optional overrides. Never infer an organizer or match an override by an ambiguous name. `primary` is explicit when used.

The search grid advances local date and time values, then measures duration and overlap with Temporal instants. Busy intervals use half-open boundaries, and daylight-saving transitions use compatible Temporal boundary disambiguation. The domain is read-only. Do not add event creation, invitations, messages, automatic relaxation, or claims that an occupied meeting can move. Demo mode is simulated and must be labeled; it still runs the same validation and ranking rules.
