import type { HtmlBuilder } from "foldkit/html";
import { isLoading, Message, type Model } from "../model.js";
import { attendanceLabel } from "../presentation.js";
export const audienceView = (model: Model, h: HtmlBuilder<Message>) =>
  h.section(
    [h.Class("audience card")],
    [
      h.p([h.Class("eyebrow")], ["02 / AUDIENCE"]),
      h.h2([], ["Who is coming?"]),
      h.div(
        [h.Class("source-box")],
        [
          h.strong([], ["Add a source"]),
          h.select(
            [
              h.AriaLabel("Source type"),
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
            h.Placeholder("person, emails, space, group…"),
            h.AriaLabel("Source reference"),
            h.Value(model.sourceDraft),
            h.OnInput((value) => Message.ChangedSourceDraft({ value })),
          ]),
          h.label(
            [],
            [
              h.input([
                h.Type("checkbox"),
                h.Checked(model.sourceRequired),
                h.OnChange(() => Message.ChangedSourceRequired({ value: !model.sourceRequired })),
              ]),
              "Required",
            ],
          ),
          h.input([
            h.Type("number"),
            h.AriaLabel("Source weight"),
            h.Value(String(model.sourceWeight)),
            h.OnInput((value) => Message.ChangedSourceWeight({ value })),
          ]),
          h.button([h.Class("button secondary"), h.OnClick(Message.AddedSource())], ["Add"]),
          h.div(
            [h.Class("source-list")],
            model.sources.map((source, index) =>
              h.div(
                [h.Class("source-chip")],
                [
                  h.span(
                    [],
                    [
                      `${source.type}: ${source.ref} (${source.required === false ? "optional" : "required"}, w${source.weight ?? 1})`,
                    ],
                  ),
                  h.button([h.OnClick(Message.RemovedSource({ index }))], ["Remove"]),
                ],
              ),
            ),
          ),
        ],
      ),
      h.button(
        [
          h.Class("button primary"),
          h.OnClick(Message.ClickedResolve()),
          h.Disabled(isLoading(model)),
        ],
        [isLoading(model) ? "Resolving…" : "Resolve audience"],
      ),
      h.div(
        [h.Class("audience-tools")],
        [
          h.input([
            h.Type("search"),
            h.Placeholder("Filter people"),
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
          h.button([h.Class("button ghost"), h.OnClick(Message.AddedPerson())], ["+ Add person"]),
        ],
      ),
      h.div(
        [h.Class("people")],
        model.people
          .map((person, index) => ({ person, index }))
          .filter(({ person }) =>
            `${person.name ?? ""} ${person.id}`
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "")
              .toLowerCase()
              .includes(
                model.filter
                  .normalize("NFD")
                  .replace(/[\u0300-\u036f]/g, "")
                  .toLowerCase(),
              ),
          )
          .map(({ person, index }) =>
            h.article(
              [h.Class("person")],
              [
                h.div(
                  [h.Class("person-main")],
                  [
                    h.strong([], [person.name ?? person.id]),
                    h.small([], [person.id]),
                    h.input([
                      h.Value(person.id),
                      h.AriaLabel("Person identity"),
                      h.OnInput((value) => Message.ChangedPerson({ index, field: "id", value })),
                    ]),
                  ],
                ),
                h.label(
                  [],
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
                h.div(
                  [h.Class("attendance-policy")],
                  [
                    h.label(
                      [],
                      [
                        "Attendance",
                        h.select(
                          [
                            h.AriaLabel(`Attendance for ${person.name ?? person.id}`),
                            h.Value(person.attendanceRule.type),
                            h.OnChange((value) =>
                              Message.ChangedAttendance({
                                index,
                                field: "type",
                                value,
                              }),
                            ),
                          ],
                          [
                            h.option([h.Value("full")], ["Whole meeting"]),
                            h.option([h.Value("start")], ["At the start"]),
                            h.option([h.Value("end")], ["At the end"]),
                            h.option([h.Value("percentage")], ["Percentage (continuous)"]),
                          ],
                        ),
                      ],
                    ),
                    person.attendanceRule.type === "full"
                      ? h.empty
                      : h.label(
                          [],
                          [
                            person.attendanceRule.type === "percentage"
                              ? "Minimum %"
                              : "Minimum minutes",
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
                                Message.ChangedAttendance({
                                  index,
                                  field: "amount",
                                  value,
                                }),
                              ),
                            ]),
                          ],
                        ),
                    h.small([], [attendanceLabel(person.attendanceRule)]),
                  ],
                ),
                h.details(
                  [],
                  [
                    h.summary([], ["Working rules"]),
                    h.label(
                      [],
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
                      [],
                      [
                        "Hours",
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
                      [],
                      [
                        "End",
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
                      [],
                      [
                        "Days",
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
                      [],
                      [
                        "Break",
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
                      [],
                      [
                        "Break end",
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
                      [],
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
                h.label(
                  [],
                  [
                    h.input([
                      h.Type("checkbox"),
                      h.Checked(person.required),
                      h.OnChange(() =>
                        Message.ChangedPerson({
                          index,
                          field: "required",
                          value: String(!person.required),
                        }),
                      ),
                    ]),
                    "Required",
                  ],
                ),
                h.button([h.OnClick(Message.RemovedPerson({ index }))], ["Remove"]),
              ],
            ),
          ),
      ),
      h.div(
        [h.Class("snapshot-tools")],
        [
          h.textarea([
            h.Placeholder("Paste a participant snapshot JSON…"),
            h.Value(model.snapshotDraft),
            h.OnInput((value) => Message.ChangedSnapshot({ value })),
          ]),
          h.button(
            [h.Class("button ghost"), h.OnClick(Message.ClickedImport())],
            ["Import participants"],
          ),
          h.button(
            [h.Class("button ghost"), h.OnClick(Message.ClickedDownload())],
            ["Download snapshot"],
          ),
        ],
      ),
      h.div(
        [h.Class("counts")],
        [
          h.span([], [`${model.people.length} people`]),
          h.span([], [`${model.people.filter((person) => person.required).length} required`]),
          h.span([], [`${model.people.filter((person) => !person.required).length} optional`]),
        ],
      ),
    ],
  );
