# Public site and provider diagnostic privacy

The public landing page is a separate static build in `site/`. It uses the public `MeetingFinder.search` facade with synthetic Directory and CalendarAvailability layers and a fixed Effect Clock. Attendance, ranking, and unknown-calendar semantics remain in one implementation. Fallow permits that composition but prevents site imports of Google adapters, local HTTP, or runtime composition. Tests exercise its scenarios through the facade.

Vercel deploys only `dist/site`; the local web application remains a distinct build. The public page has no credentials, analytics, persistence, external fonts, or calendar API. Its deployment policy disallows network connections from scripts.

Google authentication belongs to the installed gws CLI. Preserve caller environment/profile precedence and native saved authentication; do not introduce a second credential store or pass secrets in arguments. The provider process boundary closes interactive stdin, bounds output and execution, and classifies raw failures without forwarding stderr. The Google calendar adapter similarly maps upstream error text to a static availability failure. Application outputs still include the identities and availability needed to explain local results.

Local HTTP middleware adds no-store, no-referrer, nosniff, framing protection, and a self-only content policy to success and protocol-error responses. These headers complement existing loopback binding, Host/Origin checks, and explicit private-proxy configuration.
