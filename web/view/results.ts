import type { HtmlBuilder } from "foldkit/html";
import { isLoading, Message, type Model } from "../model.js";
import { orderedObservations, formatInstant, observationText } from "../presentation.js";
export const resultsView = (model: Model, h: HtmlBuilder<Message>) =>
  h.section(
    [h.Class("results card")],
    [
      h.p([h.Class("eyebrow")], ["03 / RESULTS"]),
      h.h2([], ["Meeting options"]),
      h.button(
        [
          h.Class("button primary"),
          h.OnClick(Message.ClickedSearch()),
          h.Disabled(isLoading(model) || model.people.length === 0),
        ],
        [isLoading(model) ? "Searching…" : "Search availability"],
      ),
      h.div(
        [h.Class("result-meta")],
        model.searchResult === null
          ? ["No search yet"]
          : [
              `${model.searchResult.candidates.length} presented option${model.searchResult.candidates.length === 1 ? "" : "s"} (${model.searchResult.validCount} valid, ${model.searchResult.evaluatedCount} intervals evaluated)`,
            ],
      ),
      h.div(
        [h.Class("results-scroll")],
        [
          h.div(
            [h.Class("results-list")],
            (model.searchResult?.candidates ?? []).map((candidate) =>
              h.article(
                [h.Class("result-card valid")],
                [
                  h.div(
                    [h.Class("result-top")],
                    [
                      h.strong(
                        [],
                        [
                          `${formatInstant(candidate.start, model.timeZone)} – ${formatInstant(candidate.end, model.timeZone)} (${model.timeZone})`,
                        ],
                      ),
                      h.span([h.Class("score")], [`${candidate.score ?? 0}%`]),
                    ],
                  ),
                  h.p(
                    [],
                    [
                      `${candidate.availableWeight ?? 0}/${candidate.totalWeight ?? 0} weighted rule coverage`,
                      ` · ${candidate.attendance} meeting attendance rules · ${candidate.score}% score`,
                    ],
                  ),
                  h.details(
                    [],
                    [
                      h.summary([], ["Availability details"]),
                      h.ul(
                        [h.Class("attendees")],
                        orderedObservations(model.people, candidate).map((attendee) =>
                          h.li(
                            [],
                            [
                              h.span(
                                [],
                                [
                                  model.people.find(
                                    (person) => person.id === attendee.participantId,
                                  )?.name ?? attendee.participantId,
                                ],
                              ),
                              h.span([], [observationText(attendee, model.timeZone)]),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
                  h.button(
                    [
                      h.Class("button ghost"),
                      h.OnClick(
                        Message.ClickedCopy({
                          index: model.searchResult?.candidates.indexOf(candidate) ?? -1,
                        }),
                      ),
                    ],
                    ["Copy proposal"],
                  ),
                ],
              ),
            ),
          ),
          h.h3([], ["Blocked alternatives"]),
          h.div(
            [h.Class("results-list")],
            (model.searchResult?.blockedAlternatives ?? []).slice(0, 5).map((candidate) =>
              h.article(
                [h.Class("result-card blocked")],
                [
                  h.strong(
                    [],
                    [
                      `${formatInstant(candidate.start, model.timeZone)} – ${formatInstant(candidate.end, model.timeZone)} (${model.timeZone})`,
                    ],
                  ),
                  h.p(
                    [],
                    [
                      (candidate.requiredConflicts ?? []).join(", ") ||
                        "Required attendee conflict",
                    ],
                  ),
                  h.details(
                    [],
                    [
                      h.summary([], ["Why blocked"]),
                      h.p([], ["Review only; this interval cannot be copied as a valid proposal."]),
                      h.ul(
                        [h.Class("attendees")],
                        orderedObservations(model.people, candidate).map((attendee) =>
                          h.li(
                            [],
                            [
                              h.strong(
                                [],
                                [
                                  model.people.find(
                                    (person) => person.id === attendee.participantId,
                                  )?.name ?? attendee.participantId,
                                ],
                              ),
                              h.span([], [observationText(attendee, model.timeZone)]),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
          model.searchResult !== null &&
          model.searchResult.candidates.length === 0 &&
          model.searchResult.blockedAlternatives.length === 0
            ? h.p([h.Class("empty")], ["Your options will appear here."])
            : h.empty,
        ],
      ),
      model.searchResult === null
        ? h.empty
        : h.div(
            [h.Class("result-meta")],
            [
              `Searched ${formatInstant(model.searchResult.searchedAt, model.timeZone)}.`,
              ...(model.searchResult.calendarsWithErrors.length > 0
                ? [
                    ` Calendar data unavailable for ${model.searchResult.calendarsWithErrors.map((entry) => entry.calendarId).join(", ")}.`,
                  ]
                : []),
            ],
          ),
    ],
  );
