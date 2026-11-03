---
name: meeting-finder
description: Resolve a read-only audience and search explainable meeting intervals through the local Meeting Finder CLI or HTTP API.
---

# Meeting Finder skill

Use this skill when an agent needs to inspect an audience or find meeting times. Resolve identities before searching. The operation is read-only: it never creates events, invitations, messages, reservations, or negotiations.

## Operation names

| Intent                                           | Operation                             |
| ------------------------------------------------ | ------------------------------------- |
| Normalize sources and inspect provenance         | `resolve`                             |
| Find ranked intervals and explanations           | `search`                              |
| List discoverable Chat spaces or Contacts labels | `sources spaces` / `sources contacts` |
| Inspect the input contract                       | `schema`                              |
| Inspect supported operations and limits          | `capabilities`                        |

The CLI emits one JSON document. Use `--demo` for simulated data without Google calls. Use a JSON file, `--config`, or `-` for stdin. The local HTTP equivalents are `POST /api/v1/resolve`, `POST /api/v1/search`, and `GET /api/v1/sources`; send `{ "mode": "demo", "request": ... }` when using demo mode.

## Resolution rules

Sources are unioned and deduplicated case-insensitively. Source policy is applied in source order, then explicit participant fields, participant defaults, and ordered overrides. Participant defaults fill absent policy fields and do not overwrite explicit values. The CLI places required sources before optional sources and applies required overrides after optional overrides; JSON source order remains meaningful. An override must match an existing resolved identity. Resolve all pages; do not accept a partial audience as complete.

Required participants must satisfy their attendance rules (whole meeting by default). Optional participants may be absent and affect weighted coverage. Weights range from 1 to 100 and never relax required status. Unknown calendars are never treated as free. Search evaluates local date and time values but measures duration and overlap using Temporal instants; touching busy endpoints do not overlap. If no candidate exists, adjust policy only through an explicit user instruction; never relax requirements automatically.

## Examples

Resolve a demo request:

```sh
meeting-finder resolve --demo
```

Search from stdin:

```sh
printf '%s\n' '{"startDate":"2030-01-07","endDate":"2030-01-11","timeZone":"America/Santiago","durationMinutes":60,"sources":[{"type":"chat_space","ref":"spaces/example","required":true}]}' \
  | meeting-finder search - --demo
```

The search response contains `candidates`, `blockedAlternatives`, `evaluatedCount`, `validCount`, `searchedAt`, and `calendarsWithErrors`. A successful response may have zero candidates. Errors are JSON with `code`, `detail`, and `resolution`, and the process exits with code 1; parser diagnostics may be written to stderr.

## Provider and safety behavior

Live mode requires the user's separately configured `gws` authentication and the account's access to the requested Chat, Group, Contacts, and Calendar data. In practice the account must be authorized for the `gws` operations used by the adapter: Calendar free/busy, Chat membership listing, Contacts group membership listing, and primary-calendar metadata. Exact OAuth scope grants are controlled by `gws`, Google Workspace, and administrator policy; the Meeting Finder skill must not invent or request a broader scope set. The skill must not request, print, or store credentials. Keep requests within the published limits, preserve provider errors, and treat demo results as simulated. Prefer discovery through `/schema.json`, `/openapi.json`, `/docs`, `/llms.txt`, `/.well-known/api-catalog`, and `/.well-known/agent-skills/index.json` rather than guessing fields.
