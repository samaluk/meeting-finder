import type { Html, HtmlBuilder } from "foldkit/html";
import { isLoading, Message, type Candidate, type Model } from "../model.js";
import {
  formatInstant,
  formatRange,
  observationText,
  orderedObservations,
} from "../presentation.js";

const nameOf = (model: Model, id: string) =>
  model.people.find((person) => person.id === id)?.name ?? id;

/** Large audiences: explain who misses the rule in full, list everyone else by name. */
const attendance = (model: Model, h: HtmlBuilder<Message>, candidate: Candidate) => {
  const observations = orderedObservations(model.people, candidate);
  const unmet = observations.filter((observation) => !observation.ruleSatisfied);
  const met = observations.filter((observation) => observation.ruleSatisfied);
  return h.div(
    [h.Class("attendance")],
    [
      unmet.length === 0
        ? h.empty
        : h.div(
            [],
            [
              h.h4([h.Class("unmet")], [`Rule not met · ${unmet.length}`]),
              h.ul(
                [h.Class("attendees")],
                unmet.map((attendee) =>
                  h.li(
                    [],
                    [
                      h.span([h.Class("attendee-name")], [nameOf(model, attendee.participantId)]),
                      h.span([], [observationText(attendee, model.timeZone)]),
                    ],
                  ),
                ),
              ),
            ],
          ),
      met.length === 0
        ? h.empty
        : h.div(
            [],
            [
              h.h4([h.Class("met")], [`Rule met · ${met.length}`]),
              h.ul(
                [h.Class("name-list")],
                met.map((attendee) =>
                  h.li(
                    [h.Title(observationText(attendee, model.timeZone))],
                    [nameOf(model, attendee.participantId)],
                  ),
                ),
              ),
            ],
          ),
    ],
  );
};

const fitLabel = (model: Model, candidate: Candidate, blocked: boolean) => {
  if (blocked) {
    const conflicts = (candidate.requiredConflicts ?? []).map((id) => nameOf(model, id));
    return `Blocked by ${conflicts.join(", ") || "a required attendee"}`;
  }
  const total = candidate.participants.length;
  const missing = total - candidate.attendance;
  return missing === 0 ? `All ${total} rules met` : `${missing} of ${total} miss their rule`;
};

const optionRow = (
  model: Model,
  h: HtmlBuilder<Message>,
  candidate: Candidate,
  copyIndex: number | null,
) => {
  const range = formatRange(candidate.start, candidate.end, model.timeZone);
  const blocked = copyIndex === null;
  return h.details(
    [h.Class(blocked ? "option blocked" : "option")],
    [
      h.summary(
        [],
        [
          h.span([h.Class("day")], [range.day]),
          h.span([h.Class("time")], [range.time]),
          h.span([h.Class("fit")], [fitLabel(model, candidate, blocked)]),
          h.span([h.Class("score")], [blocked ? "–" : `${candidate.score ?? 0}%`]),
        ],
      ),
      h.div(
        [h.Class("option-body")],
        [
          h.div(
            [h.Class("option-meta")],
            [
              h.span(
                [h.Class("meta")],
                [
                  blocked
                    ? "Review only. This interval cannot be copied as a valid proposal"
                    : `Weight ${candidate.availableWeight ?? 0} of ${candidate.totalWeight ?? 0}`,
                ],
              ),
              blocked
                ? h.empty
                : h.button(
                    [
                      h.Class("button ghost small"),
                      h.OnClick(Message.ClickedCopy({ index: copyIndex })),
                    ],
                    ["Copy proposal"],
                  ),
            ],
          ),
          attendance(model, h, candidate),
        ],
      ),
    ],
  );
};

const emptyResults = (h: HtmlBuilder<Message>, message: string) =>
  h.div([h.Class("empty")], [h.p([], [message])]);

const resultOptions = (model: Model, h: HtmlBuilder<Message>): ReadonlyArray<Html> => {
  const result = model.searchResult;
  if (result === null)
    return [emptyResults(h, "Resolve an audience, then search to see ranked times")];
  const { candidates } = result;
  const blocked = (result.blockedAlternatives ?? []).slice(0, 5);
  if (candidates.length === 0 && blocked.length === 0) {
    return [emptyResults(h, "No interval in this window meets the rules")];
  }
  const options: Html[] = [];
  if (candidates.length > 0) {
    options.push(
      h.div(
        [h.Class("options")],
        candidates.map((candidate, index) => optionRow(model, h, candidate, index)),
      ),
    );
  }
  if (blocked.length > 0) {
    options.push(
      h.h3([], ["Blocked alternatives"]),
      h.div(
        [h.Class("options")],
        blocked.map((candidate) => optionRow(model, h, candidate, null)),
      ),
    );
  }
  return options;
};

const resultFoot = (
  h: HtmlBuilder<Message>,
  result: NonNullable<Model["searchResult"]>,
  timeZone: string,
) => {
  const calendars = result.calendarsWithErrors.map((entry) => entry.calendarId);
  return h.p(
    [h.Class("meta result-foot")],
    [
      `Searched ${formatInstant(result.searchedAt, timeZone)}`,
      ...(calendars.length > 0 ? [` · Calendar data unavailable for ${calendars.join(", ")}`] : []),
    ],
  );
};

export const resultsView = (model: Model, h: HtmlBuilder<Message>) => {
  const result = model.searchResult;
  const loading = isLoading(model);
  return h.section(
    [h.Class("results card")],
    [
      h.div(
        [h.Class("card-head")],
        [
          h.div(
            [],
            [
              h.h2([], ["Options"]),
              h.p(
                [h.Class("meta")],
                [
                  result === null
                    ? `No search yet · times in ${model.timeZone}`
                    : `${result.candidates.length} shown · ${result.validCount} valid of ${result.evaluatedCount} intervals · ${model.timeZone}`,
                ],
              ),
            ],
          ),
          h.button(
            [
              h.Class("button primary"),
              h.OnClick(Message.ClickedSearch()),
              h.Disabled(loading || model.people.length === 0),
            ],
            [loading ? "Searching…" : "Search availability"],
          ),
        ],
      ),
      h.div([h.Class("results-scroll")], resultOptions(model, h)),
      result === null ? h.empty : resultFoot(h, result, model.timeZone),
    ],
  );
};
