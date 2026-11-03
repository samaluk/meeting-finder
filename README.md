# meeting-finder

Meeting Finder is a local, read-only tool for finding explainable meeting intervals across a large audience. It resolves people from explicit identities, Google Chat spaces, Google Groups, and Contacts labels, then evaluates working rules and Google Calendar availability. It returns ranked candidates and, when necessary, blocked alternatives.

The project is a TypeScript 7.0.2 and Effect 4.0.0 application running on Bun 1.4.2. The web model uses Foldkit 0.167.0. The repository implements the F01–F10 baseline in [SPEC.md](SPEC.md). It is early open-source software under the MIT license.

## Start locally

Install mise, then run:

```sh
mise install
mise run install
bun run start -- init --demo
bun run start -- resolve --demo
bun run start -- search --demo
bun run build
bun run start -- serve --demo --port 4310
```

`--demo` uses deterministic simulated directory and calendar services and makes no Google calls. Live mode reuses the user's authenticated `gws` command; it does not ask the application to collect credentials. The required OAuth scopes are therefore those granted by `gws` for the commands it uses (`calendar.freebusy.query`, Chat membership listing, Contacts group membership listing, and primary-calendar metadata), subject to the account and administrator policy; this repository does not maintain a second scope or credential configuration. `serve` starts the scoped local HTTP server and serves the built web client; it accepts `--config`, `--port`, and `--demo`. `bun run build` builds the web client.

Useful checks are `mise run check`, `bun run test`, `bun run typecheck`, `bun run effect:diagnostics`, `bun run lint`, and `bun run format:check`. The repository uses Oxfmt because Bun 1.4.2 has no formatter command. `hk` orchestrates the checks and `jactionlint` checks GitHub Actions workflows. Install this repository's local hook with `mise run setup-hooks`.

The test suite covers the domain facade, CLI process contract, provider processes, HTTP contract, and Foldkit updates. Live-provider tests use Google-shaped fixtures and fake processes, without credentials or real calendar queries. Effect diagnostics remain enabled; the pinned HTTP and process APIs report upstream instability warnings.

## Access over Tailscale

To access the app from another device on your tailnet, use a dedicated Tailscale Serve HTTPS port and declare its exact origin:

```sh
bun run start -- serve --demo --port 14310 --proxy-origin https://YOUR-MACHINE.YOUR-TAILNET.ts.net:8443
tailscale serve --bg --https=8443 http://127.0.0.1:14310
```

Open that HTTPS URL while connected to Tailscale. The app still binds to loopback; Tailscale Serve supplies private network access. Stop the forwarding with `tailscale serve --https=8443 off`.

## Product boundary

Resolution produces a normalized audience and provenance. Search evaluates intervals using each participant's timezone, working rules, blocking calendars, required status, and weight. Required participants must satisfy their attendance rules (whole meeting by default); optional participants contribute to attendance and weighted coverage. Unknown availability is conservative and remains explainable.

The application never creates events, sends invitations or messages, negotiates automatically, or assumes an existing meeting can move. Configuration and availability are not stored in browser storage. Copying a proposal is a local coordination aid. The CLI, HTTP API, web application, and agent skill use the same domain rules; demo mode uses the same rules with simulated services.

## Architecture and operational settings

Effect schemas define the request, resolved audience, availability observations, candidates, responses, and discovery documents at their boundaries. Requests are decoded and normalized once before audience resolution and search. The domain uses the normalized request as its only source of truth; transports do not reimplement precedence, attendance, ranking, or validation rules.

Failures are concrete tagged `FinderError` values. Input and search validation errors carry nested issue paths, while provider-unavailable and provider-response errors remain distinguishable at the CLI and HTTP boundaries. HTTP uses the generated Effect `HttpApi` declaration for its server handlers, typed client, and OpenAPI document, so the browser and local API share one route contract.

The Foldkit browser model updates state through pure messages and commands. Resolve and search requests are interruptible; revision and operation tokens reject stale responses after edits or replacement requests. Provider selection remains at the composition boundary, where live `gws` and demo services implement the same `Directory` and `CalendarAvailability` interfaces.

The live provider reads these optional environment settings at composition time:

- `MEETING_FINDER_GWS_TIMEOUT_MS`: 100–300000, default 60000.
- `MEETING_FINDER_PROVIDER_CONCURRENCY`: 1–20, default 2, for provider fan-out operations.
- `MEETING_FINDER_PROVIDER_RETRIES`: 0–5, default 2.
- `MEETING_FINDER_PROVIDER_RETRY_BASE_MS`: 1–30000, default 100.

Retries use bounded exponential backoff with jitter and apply only to transient provider failures. Free/busy requests are batched and their calendar fan-out is capped at two concurrent batches; the configured concurrency applies to the other provider fan-out operations. Child `gws` processes are scoped and terminated when an operation is interrupted or times out.

Set `MEETING_FINDER_TRACE=true` to emit compact, redacted span records to stderr. Records contain only a static operation name, trace and span identifiers, duration, and outcome; request data, URLs, arguments, results, and failure details are never emitted. Tracing is disabled by default and does not change the JSON result on stdout.

Read [docs/design.md](docs/design.md) for the architecture and [docs/development.md](docs/development.md) for the development cycle. The canonical terms are in [GLOSSARY.md](GLOSSARY.md).

## Partial attendance

Each person has an **Attendance** control: whole meeting, at the start, at the end, or a percentage in one continuous block. For a 60-minute meeting, 50% requires 30 uninterrupted minutes; two separate 15-minute portions do not qualify. Start/end rules take a minimum number of minutes anchored to that edge of the meeting.

The same rules work in CLI JSON and HTTP requests:

```json
{
  "overrides": [
    { "id": "person@example.test", "attendanceRule": { "type": "start", "minutes": 15 } },
    { "id": "other@example.test", "attendanceRule": { "type": "percentage", "percent": 50 } }
  ]
}
```

Add these overrides to a source request, or put `attendanceRule` directly on a participant. The default is `{"type":"full"}`; use `{"type":"end","minutes":15}` for the final 15 minutes. Overrides must match resolved identities. `bun src/main.ts search request.json` uses the shared rules; `schema` documents their bounds.

Results show rule satisfaction and actual available portions, including when the rest of a meeting is busy. A satisfied partial rule counts as one attendee and contributes full weight to rule coverage. Minimum attendance is a count of satisfied commitments, not simultaneous headcount. Unknown calendar data never satisfies a partial rule. Downloaded snapshots and copied proposals preserve and explain attendance commitments.

## Public landing page

The `site/` directory is a static introduction and interactive simulated demo. It runs the real `MeetingFinder.search` facade with fictional calendars and a fixed clock. It has no Google adapter, calendar server, credential flow, browser storage, or analytics. The local application remains in `web/`.

```sh
mise run build-site
```

Import this repository into Vercel and use the committed `vercel.json`. It builds `dist/site` with frozen Bun dependencies; it does not deploy the local calendar server. The production Content Security Policy prohibits network connections from the page. Keep the Vercel project limited to the static output, and do not add Google credentials or calendar configuration as deployment environment variables.

Read [SECURITY.md](SECURITY.md) before using live mode or reporting a vulnerability. `mise run scan-secrets` scans source files for known secret formats. This complements review; personal scheduling exports should stay outside the checkout.
