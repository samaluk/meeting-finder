import type { HtmlBuilder } from "foldkit/html";
import { isLoading, Message, type Candidate, type Model } from "../model.js";
import {
  formatInstant,
  formatRange,
  observationText,
  orderedObservations,
} from "../presentation.js";

const attendeeList = (model: Model, h: HtmlBuilder<Message>, candidate: Candidate) =>
  h.ul(
    [h.Class("attendees")],
    orderedObservations(model.people, candidate).map((attendee) =>
      h.li(
        [h.Class(attendee.ruleSatisfied ? "met" : "unmet")],
        [
          h.span(
            [h.Class("attendee-name")],
            [
              model.people.find((person) => person.id === attendee.participantId)?.name ??
                attendee.participantId,
            ],
          ),
          h.span([], [observationText(attendee, model.timeZone)]),
        ],
      ),
    ),
  );

const when = (model: Model, h: HtmlBuilder<Message>, candidate: Candidate) => {
  const range = formatRange(candidate.start, candidate.end, model.timeZone);
  return h.div(
    [h.Class("when")],
    [h.span([h.Class("day")], [range.day]), h.strong([h.Class("time")], [range.time])],
  );
};

export const resultsView = (model: Model, h: HtmlBuilder<Message>) => {
  const result = model.searchResult;
  const blocked = (result?.blockedAlternatives ?? []).slice(0, 5);
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
              h.Disabled(isLoading(model) || model.people.length === 0),
            ],
            [isLoading(model) ? "Searching…" : "Search availability"],
          ),
        ],
      ),
      h.div(
        [h.Class("results-scroll")],
        [
          h.div(
            [h.Class("results-list")],
            (result?.candidates ?? []).map((candidate, index) =>
              h.article(
                [h.Class("result valid")],
                [
                  h.div(
                    [h.Class("result-top")],
                    [
                      when(model, h, candidate),
                      h.span([h.Class("score")], [`${candidate.score ?? 0}%`]),
                    ],
                  ),
                  h.p(
                    [h.Class("result-summary")],
                    [
                      `${candidate.attendance} of ${candidate.participants.length} attendance rules met · weight ${candidate.availableWeight ?? 0} of ${candidate.totalWeight ?? 0}`,
                    ],
                  ),
                  h.div(
                    [h.Class("result-actions")],
                    [
                      h.details(
                        [],
                        [
                          h.summary([], ["Availability details"]),
                          attendeeList(model, h, candidate),
                        ],
                      ),
                      h.button(
                        [h.Class("button ghost small"), h.OnClick(Message.ClickedCopy({ index }))],
                        ["Copy proposal"],
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
          blocked.length === 0 ? h.empty : h.h3([], ["Blocked alternatives"]),
          h.div(
            [h.Class("results-list")],
            blocked.map((candidate) =>
              h.article(
                [h.Class("result blocked")],
                [
                  h.div(
                    [h.Class("result-top")],
                    [when(model, h, candidate), h.span([h.Class("blocked-tag")], ["Blocked"])],
                  ),
                  h.p(
                    [h.Class("result-summary")],
                    [
                      (candidate.requiredConflicts ?? []).length > 0
                        ? `Required conflicts: ${(candidate.requiredConflicts ?? []).join(", ")}`
                        : "Required attendee conflict",
                    ],
                  ),
                  h.details(
                    [],
                    [
                      h.summary([], ["Why blocked"]),
                      h.p(
                        [h.Class("meta")],
                        ["Review only. This interval cannot be copied as a valid proposal"],
                      ),
                      attendeeList(model, h, candidate),
                    ],
                  ),
                ],
              ),
            ),
          ),
          result === null || (result.candidates.length === 0 && blocked.length === 0)
            ? h.div(
                [h.Class("empty")],
                [
                  h.p(
                    [],
                    [
                      result === null
                        ? "Resolve an audience, then search to see ranked times"
                        : "No interval in this window meets the rules",
                    ],
                  ),
                ],
              )
            : h.empty,
        ],
      ),
      result === null
        ? h.empty
        : h.p(
            [h.Class("meta result-foot")],
            [
              `Searched ${formatInstant(result.searchedAt, model.timeZone)}`,
              ...(result.calendarsWithErrors.length > 0
                ? [
                    ` · Calendar data unavailable for ${result.calendarsWithErrors.map((entry) => entry.calendarId).join(", ")}`,
                  ]
                : []),
            ],
          ),
    ],
  );
};
