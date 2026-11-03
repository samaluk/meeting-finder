# ADR 0001: Share one Meeting Finder interface across transports

Status: accepted

## Context

The product has a CLI, local HTTP API, Foldkit web application, and agent skill. It also has live Google providers and a credential-free demo mode. Resolution and search must have identical precedence, availability, ranking, and explanation rules for every caller.

## Decision

Expose the domain through `MeetingFinder.resolve` and `MeetingFinder.search`. Put directory and calendar access behind the `Directory` and `CalendarAvailability` Effect services. Select live or demo implementations only in the composition layer. Keep provider process details in the `gws` adapter and transport parsing in the CLI or HTTP entry point.

## Consequences

Facade tests can prove the core behavior with deterministic services, and demo mode exercises the same rules as live mode. New transports do not duplicate meeting logic. Provider failures remain typed and explainable. Adapters carry the work of normalizing external responses and preserving cancellation, limits, pagination, and calendar errors. A transport may shape output, but it cannot change domain validity or ranking.

## Alternatives

Per-transport implementations would appear simpler initially but would create divergent behavior and duplicate tests. Calling `gws` from the domain would make demo mode and deterministic tests depend on credentials and would couple policy to one provider. A generated second CLI specification would split the Effect contract. These alternatives were rejected for the baseline.
