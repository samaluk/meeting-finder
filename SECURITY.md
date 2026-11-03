# Security and privacy

Meeting Finder runs locally and only reads directory membership and calendar free/busy. It does not create events, send messages, collect Google credentials, or persist calendars in browser storage. Exported requests, audiences, results, and copied proposals can contain personal information: treat those as private documents and keep them outside the source checkout.

## Authentication

Authenticate the installed Google Workspace CLI (`gws`) using its native authentication flow. Check `command -v gws` and `gws auth status` in the same account and shell context before changing a working login. Missing environment variables do not establish that a saved login is missing. Resource permissions and administrator scope restrictions are separate from authentication.

Meeting Finder inherits the caller's environment so native account/profile selection continues to work. It never adds credentials to subprocess arguments or configuration files. If automation requires a token or credential file, use the native `gws` mechanisms and a scoped secret manager; avoid shell history, command arguments, request bodies, URLs, or committed `.env` files. Do not set credentials for the public landing page. `.env.example` contains operational settings only; Bun may load a local `.env` automatically, so keep secrets outside the checkout when possible.

Provider subprocesses use argument arrays without a shell, closed stdin, bounded output, scoped termination, and configured timeouts. Raw process diagnostics and provider calendar error text are classified into safe error messages before reaching application responses. Calendar identities and availability remain part of intended local results. Optional tracing emits static operation metadata only.

## Local HTTP access

The server binds to loopback and validates the request Host and Origin. Responses disable caching and framing. To use a private HTTPS reverse proxy, configure its exact origin as documented in the README. This is a trusted local tool, not a multi-user authenticated service; anyone allowed to reach the proxy can invoke its read operations with the server's identity. Keep the proxy private and restrict access to trusted users. Do not expose it through a public Vercel rewrite.

The public `site/` build contains only synthetic data. Its production policy uses `connect-src 'none'`; no calendar API or sign-in flow is hosted there.

## Reporting

Report vulnerabilities privately through [GitHub security advisories](https://github.com/samaluk/meeting-finder/security/advisories/new). Include a minimal reproduction using synthetic data. Do not post tokens, credential files, real calendar exports, or private subprocess diagnostics in public issues. If private reporting is unavailable, open a minimal issue asking for a private reporting channel without exploit details or personal data.

This project is early software. Security fixes target the current main branch; there are no supported release branches yet.
