import type { HtmlBuilder } from "foldkit/html";
import { isLoading, Message, type Model } from "../model.js";
import { attendanceLabel, sourceTypeLabel } from "../presentation.js";
const fold = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
export const audienceView = (model: Model, h: HtmlBuilder<Message>) => {
  const required = model.people.filter((person) => person.required).length;
  return h.section(
    [h.Class("audience card")],
    [
      h.div(
        [h.Class("card-head")],
        [
          h.h2([], ["Audience"]),
          h.p(
            [h.Class("meta")],
            [
              `${model.people.length} ${model.people.length === 1 ? "person" : "people"} · ${required} required · ${model.people.length - required} optional`,
            ],
          ),
        ],
      ),
      h.div(
        [h.Class("source-box")],
        [
          h.h3([], ["Add a source"]),
          h.div(
            [h.Class("source-form")],
            [
              h.select(
                [
                  h.AriaLabel("Source type"),
                  h.Value(model.sourceType),
                  h.OnChange((value) => Message.ChangedSourceType({ value })),
                ],
                [
                  h.option([h.Value("person")], ["Person"]),
                  h.option([h.Value("emails")], ["Email list"]),
                  h.option([h.Value("chat_space")], ["Chat space"]),
                  h.option([h.Value("google_group")], ["Google Group"]),
                  h.option([h.Value("contact_group")], ["Contacts group"]),
                ],
              ),
              h.input([
                h.Class("source-ref"),
                h.Placeholder("Email, space or group"),
                h.AriaLabel("Source reference"),
                h.Value(model.sourceDraft),
                h.OnInput((value) => Message.ChangedSourceDraft({ value })),
              ]),
              h.label(
                [h.Class("check")],
                [
                  h.input([
                    h.Type("checkbox"),
                    h.Checked(model.sourceRequired),
                    h.OnChange(() =>
                      Message.ChangedSourceRequired({ value: !model.sourceRequired }),
                    ),
                  ]),
                  "Required",
                ],
              ),
              h.label(
                [h.Class("inline-field")],
                [
                  "Weight",
                  h.input([
                    h.Type("number"),
                    h.AriaLabel("Source weight"),
                    h.Value(String(model.sourceWeight)),
                    h.OnInput((value) => Message.ChangedSourceWeight({ value })),
                  ]),
                ],
              ),
              h.button([h.Class("button secondary"), h.OnClick(Message.AddedSource())], ["Add"]),
            ],
          ),
          model.sources.length === 0
            ? h.empty
            : h.ul(
                [h.Class("source-list")],
                model.sources.map((source, index) =>
                  h.li(
                    [],
                    [
                      h.span([h.Class("source-type")], [sourceTypeLabel(source.type)]),
                      h.span([h.Class("source-name")], [source.ref]),
                      h.span(
                        [h.Class("meta")],
                        [
                          `${source.required === false ? "Optional" : "Required"} · weight ${source.weight ?? 1}`,
                        ],
                      ),
                      h.button(
                        [
                          h.Class("text-button"),
                          h.AriaLabel(`Remove ${source.ref}`),
                          h.OnClick(Message.RemovedSource({ index })),
                        ],
                        ["Remove"],
                      ),
                    ],
                  ),
                ),
              ),
          h.button(
            [
              h.Class("button primary"),
              h.OnClick(Message.ClickedResolve()),
              h.Disabled(isLoading(model)),
            ],
            [isLoading(model) ? "Resolving…" : "Resolve audience"],
          ),
        ],
      ),
      h.div(
        [h.Class("audience-tools")],
        [
          h.input([
            h.Type("search"),
            h.Placeholder("Filter"),
            h.AriaLabel("Filter people"),
            h.Value(model.filter),
            h.OnInput((value) => Message.ChangedFilter({ value })),
          ]),
          h.button(
            [h.Class("button ghost"), h.OnClick(Message.SetRequired({ required: true }))],
            ["All required"],
          ),
          h.button(
            [h.Class("button ghost"), h.OnClick(Message.SetRequired({ required: false }))],
            ["All optional"],
          ),
          h.button([h.Class("button ghost"), h.OnClick(Message.AddedPerson())], ["Add person"]),
        ],
      ),
      h.div(
        [h.Class("people")],
        model.people
          .map((person, index) => ({ person, index }))
          .filter(({ person }) =>
            fold(`${person.name ?? ""} ${person.id}`).includes(fold(model.filter)),
          )
          .map(({ person, index }) =>
            h.article(
              [h.Class("person")],
              [
                h.div(
                  [h.Class("person-head")],
                  [
                    h.label(
                      [h.Class("check")],
                      [
                        h.input([
                          h.Type("checkbox"),
                          h.Checked(person.required),
                          h.AriaLabel(`${person.name ?? person.id} is required`),
                          h.OnChange(() =>
                            Message.ChangedPerson({
                              index,
                              field: "required",
                              value: String(!person.required),
                            }),
                          ),
                        ]),
                        h.span(
                          [h.Class("person-name")],
                          [person.name ?? (person.id || "New person")],
                        ),
                      ],
                    ),
                    h.span([h.Class("meta")], [person.required ? "Required" : "Optional"]),
                    h.label(
                      [h.Class("inline-field")],
                      [
                        "Weight",
                        h.input([
                          h.Type("number"),
                          h.AriaLabel("Participant weight"),
                          h.Value(String(person.weight)),
                          h.OnInput((value) =>
                            Message.ChangedPerson({ index, field: "weight", value }),
                          ),
                        ]),
                      ],
                    ),
                    h.button(
                      [
                        h.Class("text-button"),
                        h.AriaLabel(`Remove ${person.name ?? person.id}`),
                        h.OnClick(Message.RemovedPerson({ index })),
                      ],
                      ["Remove"],
                    ),
                  ],
                ),
                h.div(
                  [h.Class("person-policy")],
                  [
                    h.label(
                      [h.Class("field")],
                      [
                        "Identity",
                        h.input([
                          h.Value(person.id),
                          h.AriaLabel("Person identity"),
                          h.OnInput((value) =>
                            Message.ChangedPerson({ index, field: "id", value }),
                          ),
                        ]),
                      ],
                    ),
                    h.label(
                      [h.Class("field")],
                      [
                        "Attendance",
                        h.select(
                          [
                            h.AriaLabel(`Attendance for ${person.name ?? person.id}`),
                            h.Value(person.attendanceRule.type),
                            h.OnChange((value) =>
                              Message.ChangedAttendance({ index, field: "type", value }),
                            ),
                          ],
                          [
                            h.option([h.Value("full")], ["Whole meeting"]),
                            h.option([h.Value("start")], ["At the start"]),
                            h.option([h.Value("end")], ["At the end"]),
                            h.option([h.Value("percentage")], ["Percentage, continuous"]),
                          ],
                        ),
                      ],
                    ),
                    person.attendanceRule.type === "full"
                      ? h.empty
                      : h.label(
                          [h.Class("field amount")],
                          [
                            person.attendanceRule.type === "percentage"
                              ? "Minimum %"
                              : "Minimum min",
                            h.input([
                              h.Type("number"),
                              h.Min("1"),
                              h.Max(
                                String(
                                  person.attendanceRule.type === "percentage"
                                    ? 100
                                    : model.duration,
                                ),
                              ),
                              h.AriaLabel(`Attendance amount for ${person.name ?? person.id}`),
                              h.Value(
                                String(
                                  person.attendanceRule.type === "percentage"
                                    ? person.attendanceRule.percent
                                    : person.attendanceRule.minutes,
                                ),
                              ),
                              h.OnInput((value) =>
                                Message.ChangedAttendance({ index, field: "amount", value }),
                              ),
                            ]),
                          ],
                        ),
                  ],
                ),
                person.attendanceRule.type === "full"
                  ? h.empty
                  : h.p([h.Class("rule-summary")], [attendanceLabel(person.attendanceRule)]),
                h.details(
                  [h.Class("working-rules")],
                  [
                    h.summary([], ["Working rules"]),
                    h.label(
                      [h.Class("field")],
                      [
                        "Timezone",
                        h.input([
                          h.Value(person.timeZone ?? model.timeZone),
                          h.OnInput((value) =>
                            Message.ChangedDetails({ index, field: "timeZone", value }),
                          ),
                        ]),
                      ],
                    ),
                    h.label(
                      [h.Class("field")],
                      [
                        "Day starts",
                        h.input([
                          h.Value(person.workingHours?.start ?? "09:00"),
                          h.OnInput((value) =>
                            Message.ChangedDetails({
                              index,
                              field: "workingHours:start",
                              value,
                            }),
                          ),
                        ]),
                      ],
                    ),
                    h.label(
                      [h.Class("field")],
                      [
                        "Day ends",
                        h.input([
                          h.Value(person.workingHours?.end ?? "18:00"),
                          h.OnInput((value) =>
                            Message.ChangedDetails({
                              index,
                              field: "workingHours:end",
                              value,
                            }),
                          ),
                        ]),
                      ],
                    ),
                    h.label(
                      [h.Class("field")],
                      [
                        "Weekdays, 1–7",
                        h.input([
                          h.Value((person.workingHours?.days ?? [1, 2, 3, 4, 5]).join(",")),
                          h.OnInput((value) =>
                            Message.ChangedDetails({
                              index,
                              field: "workingHours:days",
                              value,
                            }),
                          ),
                        ]),
                      ],
                    ),
                    h.label(
                      [h.Class("field")],
                      [
                        "Break starts",
                        h.input([
                          h.Value(person.workingHours?.breakStart ?? ""),
                          h.OnInput((value) =>
                            Message.ChangedDetails({
                              index,
                              field: "workingHours:breakStart",
                              value,
                            }),
                          ),
                        ]),
                      ],
                    ),
                    h.label(
                      [h.Class("field")],
                      [
                        "Break ends",
                        h.input([
                          h.Value(person.workingHours?.breakEnd ?? ""),
                          h.OnInput((value) =>
                            Message.ChangedDetails({
                              index,
                              field: "workingHours:breakEnd",
                              value,
                            }),
                          ),
                        ]),
                      ],
                    ),
                    h.label(
                      [h.Class("field")],
                      [
                        "Calendars",
                        h.input([
                          h.Value((person.calendarIds ?? [person.id]).join(",")),
                          h.OnInput((value) =>
                            Message.ChangedDetails({
                              index,
                              field: "calendarIds",
                              value,
                            }),
                          ),
                        ]),
                      ],
                    ),
                  ],
                ),
              ],
            ),
          ),
      ),
      h.div(
        [h.Class("snapshot-tools")],
        [
          h.label(
            [h.Class("field")],
            [
              "Participant snapshot",
              h.textarea([
                h.Placeholder("Paste snapshot JSON"),
                h.Value(model.snapshotDraft),
                h.OnInput((value) => Message.ChangedSnapshot({ value })),
              ]),
            ],
          ),
          h.div(
            [h.Class("snapshot-actions")],
            [
              h.button([h.Class("button ghost"), h.OnClick(Message.ClickedImport())], ["Import"]),
              h.button(
                [h.Class("button ghost"), h.OnClick(Message.ClickedDownload())],
                ["Download snapshot"],
              ),
            ],
          ),
        ],
      ),
    ],
  );
};
