# Meeting Finder glossary

This glossary defines the product's canonical domain language. When another term appears in conversation, use the canonical term below in contracts and documentation.

**Audience**

The audience is the deduplicated set of people considered for a meeting. An audience may contain required and optional participants and may be assembled from several sources.

**Availability**

Availability is the evaluated state of one participant for one meeting interval. The states are `free`, `busy`, `outside_hours`, and `unknown`.

**Blocking calendar**

A blocking calendar is a calendar whose occupied intervals prevent a participant from being free. Every blocking calendar is considered when evaluating that participant.

**Blocked alternative**

A blocked alternative is a meeting interval with at least one participant satisfying their attendance rule that cannot be a valid candidate because one or more required conditions fail. It explains why a search produced no valid candidates.

**Busy**

`busy` means that an occupied interval in a blocking calendar affects the proposed meeting or its buffer. It is distinct from `outside_hours` and `unknown`.

**Candidate**

A candidate is a meeting interval that satisfies the meeting's validity rules. Candidate validity is independent of whether presentation selection later chooses that interval to display.

**Coverage score**

The coverage score is the percentage of total participant weight represented by participants whose attendance rules are satisfied. It measures weighted coverage and does not predict whether people will accept a meeting.

**Demo mode**

Demo mode evaluates the same rules with simulated directory and availability data. It never requires working provider credentials, and every result remains identified as simulated.

**Organizer**

The organizer is the person configuring and reviewing a search. The organizer is not added to the audience implicitly; they become a participant only when declared or returned by a source.

**Free**

A participant is free when the complete meeting interval is inside that person's working rules, outside their break, and clear of all blocking calendars with trusted availability.

**Meeting interval**

A meeting interval is a start and end instant with a requested elapsed duration. Its local representation may differ between participants or across daylight-saving changes.

**Membership**

A membership records that a source contributed a particular person to the audience. Membership preserves source provenance without making a person appear more than once.

**Optional participant**

An optional participant may be absent while a candidate remains valid. When an optional participant does not meet their attendance rule, that absence lowers the coverage score.

**Outside hours**

`outside_hours` means that a proposed meeting violates a participant's working days, working hours, or break. This reason takes precedence over `busy` and `unknown` when several reasons apply.

**Participant**

A participant is one resolved person in the audience, identified by a stable identity and carrying policy such as required status, weight, timezone, working rules, and blocking calendars.

**Participant snapshot**

A participant snapshot is a portable configuration containing resolved participants and the rules used to search. It does not retain sources, their provenance, or original `overrides` unless a future feature explicitly adds that capability.

**Presentation selection**

Presentation selection chooses a non-overlapping subset of valid candidates, subject to the requested number of options. It does not change candidate validity.

**Required participant**

A required participant must satisfy their attendance rule for an interval to be a valid candidate. Weight cannot override this condition.

**Resolution**

Resolution expands sources, deduplicates identities, applies policy precedence, and returns a normalized audience. Resolution does not query or rank meeting intervals.

**Search**

Search evaluates meeting intervals over a configured search window, classifies each participant's availability, determines valid candidates, and ranks explanations and alternatives.

**Search window**

The search window is the inclusive date and timezone range in which meeting intervals may start and finish. A meeting that finishes outside the window is excluded.

**Source**

A source is a declaration that identifies people through an explicit person or a directory collection such as a Chat space, Google Group, Contacts label, or email list. A source supplies initial policy for the people it contributes.

**Unknown**

`unknown` means that availability is missing or unreliable for at least one calendar. Unknown availability is never interpreted as free.

**Weight**

A weight is an integer priority from 1 through 100 assigned to a participant. Weights are relative and affect coverage scoring and ordering; they do not reserve attendance or relax required status.

**Working rules**

Working rules describe the local days, hours, timezone, and optional break during which a participant may attend. They are declared meeting policy, not inferred from existing calendar events.

**Override**

An override is an ordered policy adjustment for a person already in the audience, applied after source and explicit participant policy. _Avoid_ using “exception” for this concept; an override cannot add a person or match an unresolved name by guesswork.

**Attendance rule**

An attendance rule is the minimum commitment for one participant: the whole meeting, its first or last specified number of elapsed minutes, or a minimum percentage in one continuous free block. Omitted rules require the whole meeting. Required status determines whether failure blocks a candidate; it does not choose the rule.

**Available portion**

An available portion is a continuous interval within the meeting that satisfies working rules and is clear of all blocking calendars and buffers, with trusted availability. Separate portions cannot combine to satisfy a percentage rule.

**Rule satisfaction**

Rule satisfaction means a participant has a trusted available portion meeting their attendance rule. It determines eligibility, minimum attendance, and weighted coverage independently of whole-meeting availability state. A participant can satisfy a start-only rule while being busy later.

**Attendance interval**

The attendance interval is the maximal available portion demonstrating a satisfied rule. For a percentage rule, use the earliest longest portion. It shows when attendance is possible and does not book time.
