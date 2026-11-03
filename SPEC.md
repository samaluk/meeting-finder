# Meeting Finder specification

Status: implemented F01–F10 baseline. The capabilities and constraints below are derived from the Spanish functional specification that accompanied the Effect v4 rewrite of the original proof of concept; this English document is the project source for the rebuild. Repository checks run through `mise run check`. Publication remains a separate step.

The baseline uses TypeScript 7.0.2, Effect 4.0.0, Bun 1.4.2, Foldkit 0.167.0, `gws`, a local web application, CLI, and local HTTP API. Domain behavior in this document is independent of implementation details.

## 1. Problem and outcome

Finding a time for 15–20 people is difficult when all attendees are treated as required. An organizer needs to inspect an audience, decide who may be absent, and express relative importance without opening calendars one by one or assuming meetings can move.

Meeting Finder returns comparable meeting intervals with explainable attendance, conflicts, and coverage scores. If no valid interval exists, it shows the blocking reasons and lets the user adjust conditions. It does not guarantee a match for the entire audience.

The product is intended to work locally through a web application and a CLI. Agents and people use the same use cases and rules. Agent access uses structured contracts and does not depend on a browser.

## 2. Scope

The baseline includes Google Calendar through the account already authenticated in `gws`; explicit people; Google Chat spaces; Google Groups; Google Contacts labels; required and optional attendance; per-person full, start, end, or continuous-percentage attendance rules; relative weights; individual overrides; working hours, timezone, breaks, and blocking calendars; search, explanations, and copying a proposal; JSON configuration; non-interactive CLI; local HTTP API; documentation; an agent skill; and demo mode without Google calls.

The baseline excludes event creation or modification, invitations, Chat messages, reservations, automatic negotiation, recurring meetings, and inference that existing meetings can move. It also excludes public hosting, product-owned accounts, background synchronization, and an MCP server.

## 3. Main flow

1. Define duration, dates, and result timezone.
2. Add people or sources and resolve their members.
3. Review totals, required and optional participants, and overrides.
4. Change required status and weights individually or with supported bulk actions.
5. Search when the rules are ready.
6. Compare valid intervals, or inspect blockers when none are valid.
7. Adjust rules and search again, or copy a proposal for coordination elsewhere.

Resolution is separate from search. Resolution may consult a directory, but it does not calculate or display meeting intervals.

## 4. Functional requirements

F01–F10 define the current baseline. Provider and wire details that this document does not define are implementation details unless listed as deferred work.

### F01 — Compose an audience

The planned sources are an explicit person identified by email or calendar ID, a list of emails separated by comma, whitespace, or semicolon, a Google Chat space identified by link, `spaces/ID`, or short ID, a Google Group email, and a Google Contacts group ID or unambiguous label. A Contacts contact must resolve to a primary or otherwise unambiguous email.

Each source supplies initial required status and weight to each member. A Group email and a personal Contacts label are different source kinds. Google Group expansion uses the provider's `freebusy.query` path when that is the available account capability.

Sources form a union and identities deduplicate case-insensitively. A Group may contribute people outside a Chat space. Resolution reports the normalized request, total, sources, source memberships, and applied overrides.

Every paginated source must be traversed completely. Empty, incomplete, inaccessible, or ambiguous sources fail the complete resolution with a recoverable error; no partial audience is presented as complete. Chat bots and pending invitations are reported as omitted. A Chat group's invisible email requires a `groupAliases` relationship to its Google Group.

`primary` resolves to the active account so the organizer is not counted twice. Source flags never add the organizer implicitly. The final audience contains 1–100 people; exceeding that limit fails without truncation.

### F02 — Required status, weights, and overrides

A required participant must satisfy their attendance rule for a valid candidate. The default rule requires the whole meeting. An optional participant may be absent, reducing coverage. Removing a person removes them from all calculations; making them optional keeps them in the audience.

Weights are integers from 1–100. They express relative priority, not attendance probability or a reservation. A source weight applies to every member; it is not a group budget.

Policy precedence is: sources apply in source order, with the last containing source setting source required status and weight; explicit participants add people or overwrite declared fields; participant defaults fill absent working and attendance policy fields; ordered overrides apply last to required status, weight, and attendance rule. Defaults never overwrite an explicit source or participant value.

An override must match an existing audience identity. Duplicate identities in explicit participants are rejected, while identities repeated across sources are unified. Names are for review; an agent must resolve an email and address ambiguity before applying an override by name.

The CLI parser processes required sources before optional sources, regardless of flag position, and processes `--required` after `--optional`. JSON preserves the declared source order when a different order is needed. This parser behavior is not a domain rule.

Resolution with all participants optional is valid. Search requires at least one required participant. Increasing a weight never allows a required participant to miss their attendance rule.

### F03 — Meeting and working rules

The planned limits are inclusive dates over 1–31 days; duration 5–480 real minutes; evaluation step 5–60 minutes, default 15; buffer 0–120 minutes; minimum attendance 1–100 and no more than the audience; requested options 1–50, default 12; a valid Temporal timezone, preferably IANA; 1–10 blocking calendars per person, defaulting to that person's ID; and one or more working days numbered Monday 1 through Sunday 7.

Working hours start and end on the same local day. An optional break must have both endpoints and be ordered. A meeting is excluded if it starts in the past or ends outside the inclusive search window.

Each participant is evaluated in their own timezone, including daylight-saving transitions. The search grid advances local dates and times, while candidate duration is measured as elapsed real minutes between Temporal instants. Local boundaries at daylight-saving transitions use Temporal-compatible disambiguation. Each available portion must be inside the participant's working hours, outside their break, and clear of all blocking calendars. Whole-meeting attendance requires the complete meeting to be available.

Buffers apply against calendar blocks. They do not extend meeting duration and do not add extra buffer against working-day boundaries.

The CLI's initial configuration proposes today through six days later in `America/Santiago`, 60 minutes, buffer 10, and minimum attendance 1. Defaults are Monday–Friday 09:00–18:00 with no break. Direct engine JSON must declare dates, duration, and timezone; omitted buffer defaults to 0. General default weight is 1. When `primary` is included in the initial configuration, it is required and has initial weight 5; both values remain editable.

Each participant has an `attendanceRule`:

- `{"type":"full"}` (default): the entire meeting must be free.
- `{"type":"start","minutes":15}`: at least the first 15 elapsed minutes must be free.
- `{"type":"end","minutes":15}`: at least the last 15 elapsed minutes must be free.
- `{"type":"percentage","percent":50}`: one continuous free block must cover at least 50% of the elapsed meeting duration. Separate portions never add up to satisfy this rule.

Minutes are integers from 1–480 and must not exceed the meeting duration at search time. Percentages are integers from 1–100. Rules can be declared on explicit participants, in participant defaults, or in ordered per-person overrides. Source required status remains separate from attendance policy. No rule is relaxed automatically.

### F04 — Availability

Availability is planned to come from `freebusy.query`, without titles or existing meeting attendees. `primary` identification may consult primary-calendar metadata. Working rules are organizer-declared policy, not inferred from Calendar.

The states are `free`, `busy`, `outside_hours`, and `unknown`. When causes overlap, explanations show `outside_hours` first, then `busy`, then `unknown`. Calendar errors remain in `calendarsWithErrors`. States describe the whole meeting, independently of rule satisfaction; a `busy` or `outside_hours` participant may still satisfy a partial rule. If any blocking calendar is unknown, no free intervals are trusted and no attendance rule is satisfied, even when a known conflict takes precedence in the state.

Unknown calendars are never free. Individual calendar errors may be shown while calculating conservatively from sufficient other data. A provider-wide failure or response that does not cover the requested window aborts search. Queries cover the buffer before and after the search window. All occupied blocks are respected; Meeting Finder never claims they are negotiable.

### F05 — Candidate eligibility, scoring, and presentation

A valid candidate requires every required participant to have `ruleSatisfied: true` and at least the configured number of participants to satisfy their attendance rules. Optional participants whose rules are satisfied count toward minimum attendance. This counts people meeting their individual commitments, not simultaneous headcount throughout the meeting.

For a valid interval, planned coverage is:

```text
availableWeight = sum(weight for participants with ruleSatisfied true)
totalWeight = sum(weight for all participants)
score = round(100 * availableWeight / totalWeight, 1 decimal)
```

A satisfied partial-attendance rule contributes the participant's full weight; this score measures coverage of declared commitments, not person-minutes. The denominator includes required, optional, and unknown participants. Weights do not need to total 100.

Candidate ordering is planned as available weight descending, available participant count descending, then earliest start ascending. Presentation selection returns non-overlapping valid candidates up to the requested limit. Candidate validity is independent of this selection, and the product does not promise every minute variation.

Each presented candidate explains start, end, score, available and total weight, attendance, required conflicts, each participant's whole-meeting state and local times, attendance rule and satisfaction, trusted free intervals, total available minutes, and the longest continuous free block in elapsed minutes and percentage. A satisfied rule includes an `attendanceInterval`: the maximal qualifying start/end block, or the earliest longest block for a percentage rule. This is an available portion, not an event or a reservation. The response includes search time, timezone, audience, calendar errors, and evaluated and valid interval counts. A successful search may contain zero candidates; that is a result, not a service error.

### F06 — Explain no valid interval

When no valid candidates exist, the search may return up to five blocked alternatives, also respecting the requested option limit. Alternatives have at least one participant satisfying their attendance rule, are ranked first by fewer required conflicts, then by the candidate ordering rules, and are separate from `candidates`.

The web distinguishes blocked alternatives and does not offer them as valid proposals. Explanations identify busy, outside-hours, and unknown participants. No search automatically relaxes dates, duration, required status, or working rules; every such adjustment is an explicit user or authorized-agent decision.

Blocked alternatives are ordered first by the fewest required conflicts, then by available weight descending, available participant count descending, and earliest start ascending. Busy and presentation interval overlap uses half-open boundaries: touching endpoints do not overlap.

### F07 — Review large audiences in the web application

The primary case is 15–20 people, with support for 100. Compact rows show identity, required status, weight, attendance rule controls, and actions. Percentage controls explicitly require continuity. Start/end controls specify minimum minutes. Working hours, breaks, and calendars appear in expandable detail. Filtering matches name or email case- and accent-insensitively.

“All optional” and “All required” act on the complete audience even while a filter is active. People can be added or removed, with required and optional totals visible. On desktop, audience and results scroll independently and search controls remain outside those scroll areas. Small screens retain essential controls.

For eight or more people, result availability details start collapsed and show required people before optional people while preserving order within each group. Rule changes invalidate old results. A response from a search that overlaps a rule change is not presented as current.

Loading prepared participants does not start availability search. Resolving a source replaces the editable list with a new snapshot. Changing a source definition requires resolving again; manual snapshot edits are not automatically persisted as source overrides.

### F08 — Portable configuration and proposals

CLI and HTTP accept source configurations with overrides and already-resolved participants. The web can import, edit, and download a resolved-participant configuration for terminal use.

The download preserves participants and rules used for search. It is a participant snapshot: it does not preserve source provenance or original overrides. The web JSON editor requires participants and does not yet support exchanging arbitrary source-only input.

The application does not store availability or configuration in browser storage. Persistence requires an explicit download or prepared file. Copying a proposal copies date, local times, timezone, available people, and conflicts; it sends nothing and creates no event. A demo proposal is marked simulated.

### F09 — CLI and local HTTP access

The non-interactive CLI plans these operations: `init`, `sources spaces`, `sources contacts`, `resolve`, `search`, `schema`, `capabilities`, and `serve`. `schema` outputs the JSON Schema contract and `capabilities` outputs supported operations, limits, and discovery points. `serve` accepts `--config`. The CLI accepts a file, `--config`, stdin via `-`, or repeatable source and override flags. `resolve` produces normalized audience and provenance without ranking; `search` produces explanations and intervals.

The default output is one JSON document. Errors are JSON on stdout with process code 1 and `code`, `detail`, and `resolution`; parser diagnostics go to stderr. `--help` is human-readable and `search --text` provides text output. CLI and HTTP use the same rules for equal input, time, and availability.

The local HTTP operations are `POST /api/v1/resolve` with `{ "mode": "live", "request": <RequestInput> }`, `POST /api/v1/search` with `{ "mode": "live", "request": <RequestInput> }`, and `GET /api/v1/sources` with `kind=chat_space` or `kind=contact_group`, plus `mode`. `mode` is `live` or `demo`; search responses include mode. Short aliases `/api/resolve` and `/api/search` are also supported. `serve` accepts `--config`, `--port`, and `--demo`. Shared schemas are discoverable through `/schema.json`, `/openapi.json`, `/docs`, `/llms.txt`, `/.well-known/api-catalog`, and `/.well-known/agent-skills/index.json`. The homepage and documentation support `Accept: text/markdown`.

Planned HTTP errors use `application/problem+json`: 400 invalid input, 403 disallowed origin, 404 unknown route, 405 with `Allow` for known routes and wrong methods, 413 oversized input, 415 wrong content type, and 502 provider failure.

The agent skill explains identity resolution, precedence, recoverable errors, and read-only scope.

### F10 — Simulated exploration

The web offers “View example”. CLI `resolve`, `search`, and source listing support `--demo`, and `init` supports `--demo`.

Demo mode makes no Google calls and needs no functional credentials. It uses the same validation, resolution, candidate validity, ranking, and explanation rules as live mode. Responses include `mode: "demo"`, and web, CLI, and agent output identify simulated results when displaying or copying them.

## 5. Acceptance scenario

Given a simulated Chat space containing `p1@example.test` through `p20@example.test`, a Group containing `p1` through `p7` plus `extra@example.test`, duration 60 minutes, and buffer 10:

```json
{
  "startDate": "2030-01-07",
  "endDate": "2030-01-11",
  "timeZone": "America/Santiago",
  "durationMinutes": 60,
  "bufferMinutes": 10,
  "sources": [
    { "type": "chat_space", "ref": "spaces/example", "required": true },
    { "type": "google_group", "ref": "team@example.test", "required": false }
  ],
  "overrides": [
    { "id": "p2@example.test", "required": true, "weight": 10 },
    { "id": "p20@example.test", "required": true }
  ]
}
```

Resolution produces 21 unique people: 14 required and 7 optional. The external Group member is included as optional. `p2` remains required at weight 10 despite the optional Group source, and `p20` remains required.

The organizer can make everyone optional, then restore `p2` and `p20` and adjust weights before searching. If no interval has both required people free, the result has no valid candidates and does not silently change their policy. When both are free, options are ordered by available weight; an occupied optional participant does not invalidate an otherwise valid interval. A copied proposal identifies conflicts and creates no event, invitation, or message.

This scenario uses a controlled directory and does not require real Google identities.

## 6. Mandatory technical and operational constraints

These constraints are part of the current baseline. Implementation details may evolve without weakening these requirements.

- Domain and application rules do not depend on CLI, HTTP, Bun, or `gws`; adding a protocol does not duplicate meeting rules.
- Effect v4 contracts use Schema, errors are typed, services use Context and Layer, the runtime is at entry points, Clock controls application time, and Scope manages server/process resources.
- Cancellation releases resources. Closing the server or cancelling a request interrupts associated work, including work after HTTP disconnect.
- Inputs are limited to 128 KiB, with at most 20 sources and 100 overrides. Provider output is limited to 10 MiB per stream and 100 pages per listing; limits that prevent completion are errors.
- Availability queries use batches of at most 50 calendars and at most two simultaneous batches. Provider process timeout defaults to 60 seconds and is configurable with `MEETING_FINDER_GWS_TIMEOUT_MS`.
- The local server binds to `127.0.0.1`, validates Host and Origin, offers no CORS, and has no public authentication flow. An explicit `serve --proxy-origin` HTTPS origin permits access through a private reverse proxy such as Tailscale Serve while retaining the loopback binding and exact origin checks.
- Authentication is reused from `gws`. The web does not request credentials, and availability is not stored. Local configuration files remain under the user's control.
- Verification uses strict TypeScript, Effect diagnostics, `@effect/vitest`, controllable time, simulated services, and tests that never need real calendars. The live adapter is exercised with upstream-shaped fixtures and fake child processes; it is not tested with real credentials.
- Support for 100 people is a functional limit. No latency target or guarantee is currently defined; duration depends on directory access, permissions, and provider queries.

## 7. Deferred work and non-goals

The following are explicitly deferred and do not authorize implementation by themselves:

- **P01 — Full source round-trip:** importing, editing, and exporting sources, defaults, and overrides while preserving their semantics or clearly converting to a snapshot.
- **P02 — Interactive terminal editing:** selecting people, changing status or weight, and saving JSON without searching, while retaining non-interactive commands.
- **P03 — Web subset bulk editing:** selecting a subset and applying required status or weight with clear scope.
- **P04 — Preserve edits across source refresh:** define override retention, additions/removals, and people no longer in the audience.

P02 is an additional terminal experience, not a prerequisite for agent use of the non-interactive CLI. No priority order for P01–P04 is assumed.

## 8. Recorded design decisions

Participant defaults are a flat policy object used to fill absent participant fields. Explicit source and participant values take precedence, and ordered overrides remain the final policy adjustment.

The search grid advances local date and time values. Candidate duration is measured in elapsed minutes between Temporal instants, including across daylight-saving transitions. Local boundary construction uses compatible Temporal disambiguation.

Busy and presentation overlap is half-open: an interval ending when another begins does not overlap it. Candidate validity remains independent of presentation selection. These decisions are part of the current baseline and should change only with an explicit contract update.
