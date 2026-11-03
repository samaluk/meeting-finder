import { Schema } from "effect";
import { RequestInputSchema } from "./domain/request.js";
import { MAX_INPUT_BYTES } from "./json-input.js";

export const getInputSchema = () => {
  const document = Schema.toJsonSchemaDocument(RequestInputSchema);
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    ...document.schema,
    $defs: document.definitions,
  };
};

export const getCapabilities = () => ({
  name: "meeting-finder",
  version: "0.0.0",
  operations: ["init", "resolve", "search", "sources", "schema", "capabilities", "serve"],
  readOnly: true,
  attendanceRules: {
    types: ["full", "start", "end", "percentage"],
    percentage: "continuous",
    default: "full",
  },
  modes: ["live", "demo"],
  limits: { audience: 100, sources: 20, overrides: 100, requestBytes: MAX_INPUT_BYTES },
  discovery: [
    "/schema.json",
    "/openapi.json",
    "/docs",
    "/llms.txt",
    "/.well-known/api-catalog",
    "/.well-known/agent-skills/index.json",
  ],
});

export const docs = `# Meeting Finder

Local, read-only meeting availability search. No events, invitations or messages are created.

1. POST /api/v1/resolve to inspect an audience before searching.
2. Review required participants, optional participants and weights.
3. POST /api/v1/search to find explainable candidates.

Both POST routes accept { "mode": "demo", "request": { ... } } with Content-Type: application/json.
Per-person attendanceRule supports {type:"full"}, {type:"start",minutes:15}, {type:"end",minutes:15}, or {type:"percentage",percent:50}. Percentage requires one continuous block. Set it on participants, participantDefaults, or overrides. Results include ruleSatisfied and availableIntervals. Satisfied rules count toward minimum attendance and full weighted coverage; these are not simultaneous headcounts.
Search requires startDate, endDate, timeZone, durationMinutes, and participants or sources.
GET /api/v1/sources?kind=chat_space&mode=demo lists example sources; contact_group lists Contacts labels.
Use live mode with a separately authenticated gws account. Demo is simulated and makes no Google calls.

Required participants must satisfy their attendance rules (whole meeting by default). Unknown calendars are never free. Scores measure priority coverage, not acceptance probability.
An empty candidates array is a successful result; blocked alternatives are not valid proposals.
See /schema.json for audience input and /openapi.json for operation-specific input and output schemas.
Errors use application/problem+json with detail and resolution.
CLI: meeting-finder init --demo; meeting-finder resolve --demo; meeting-finder search --demo.
Use --config file.json or - for stdin, and search --text for human-readable output.
`;

export const agentSkill = `---
name: meeting-finder
description: Resolve an audience and search explainable meeting times with a read-only local CLI or HTTP API.
---

# Meeting Finder

Resolve names to unambiguous identities before applying overrides. List sources with sources spaces or sources contacts. Use resolve to review the full audience and provenance before search. A display name is not an identity.

Sources form an ordered union. The last containing source fixes source required status and weight; explicit participant fields override source fields; ordered overrides apply last. Participant defaults supply omitted timezone and working rules. Overrides must match existing participants. CLI optional sources follow required sources; individual --required follows --optional. Declare primary explicitly to include the organizer.

Required participants must satisfy their attendance rules (whole meeting by default) regardless of weight. Never relax restrictions without explicit authorization. Unknown calendars remain unavailable. Zero candidates is a valid outcome; explain blocked alternatives separately and never call one a valid proposal.

Use --demo or HTTP mode demo without credentials and identify all results and copied proposals as simulated. Live mode reuses gws authentication. Never request credentials through the web or create events, invitations or messages.

CLI accepts --config, a file argument, or - for stdin. JSON errors contain code, detail and resolution and exit with code 1. Recover by correcting the request or provider access, not by silently dropping an inaccessible source. HTTP errors use application/problem+json.

Discover /schema.json, /openapi.json, /docs and /llms.txt. HTTP: POST /api/v1/resolve and POST /api/v1/search with {mode, request}; GET /api/v1/sources?kind=chat_space|contact_group&mode=live|demo.
`;
