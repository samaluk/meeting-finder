import type { HtmlBuilder } from "foldkit/html";
import { isLoading, Message, type DetailField, type Model, type Person } from "../model.js";
import { attendanceLabel, sourceTypeLabel } from "../presentation.js";

const fold = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const sourcesView = (model: Model, h: HtmlBuilder<Message>) =>
  h.div(
    [h.Class("source-box")],
    [
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
            h.Placeholder(
              model.sourceType === "person" ? "Emails, comma or space separated" : "Space or group",
            ),
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
                h.OnChange(() => Message.ChangedSourceRequired({ value: !model.sourceRequired })),
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
        : h.div(
            [h.Class("source-summary")],
            [
              h.span(
                [h.Class("meta")],
                [`${model.sources.length} ${model.sources.length === 1 ? "source" : "sources"}`],
              ),
              h.button(
                [h.Class("text-button"), h.OnClick(Message.ClearedSources())],
                ["Clear all"],
              ),
            ],
          ),
      model.sources.length === 0
        ? h.empty
        : h.ul(
            [h.Class("source-list")],
            model.sources.map((source, index) =>
              h.li(
                [
                  h.Class(source.required === false ? "chip optional" : "chip"),
                  h.Title(
                    `${sourceTypeLabel(source.type)} · ${source.required === false ? "optional" : "required"} · weight ${source.weight ?? 1}`,
                  ),
                ],
                [
                  source.type === "person"
                    ? h.empty
                    : h.span([h.Class("chip-type")], [sourceTypeLabel(source.type)]),
                  h.span([h.Class("chip-name")], [source.ref]),
                  (source.weight ?? 1) === 1
                    ? h.empty
                    : h.span([h.Class("chip-type")], [`×${source.weight}`]),
                  h.button(
                    [
                      h.Class("chip-remove"),
                      h.AriaLabel(`Remove ${source.ref}`),
                      h.OnClick(Message.RemovedSource({ index })),
                    ],
                    ["×"],
                  ),
                ],
              ),
            ),
          ),
      h.button(
        [
          h.Class("button primary"),
          h.OnClick(Message.ClickedResolve()),
          h.Disabled(isLoading(model) || model.sources.length === 0),
        ],
        [isLoading(model) ? "Resolving…" : "Resolve audience"],
      ),
    ],
  );

const detailField = (
  h: HtmlBuilder<Message>,
  index: number,
  label: string,
  value: string,
  field: DetailField,
) =>
  h.label(
    [h.Class("field")],
    [
      label,
      h.input([
        h.Value(value),
        h.OnInput((value) => Message.ChangedDetails({ index, field, value })),
      ]),
    ],
  );

const personRow = (model: Model, h: HtmlBuilder<Message>, person: Person, index: number) => {
  const label = person.name ?? (person.id || "New person");
  const rule = person.attendanceRule;
  return h.article(
    [h.Class("person")],
    [
      h.input([
        h.Type("checkbox"),
        h.Checked(person.required),
        h.AriaLabel(`${label} is required`),
        h.OnChange(() =>
          Message.ChangedPerson({ index, field: "required", value: String(!person.required) }),
        ),
      ]),
      h.div(
        [h.Class("person-who"), h.Title(person.id)],
        [
          h.span([h.Class("person-name")], [label]),
          person.name === undefined ? h.empty : h.span([h.Class("person-id")], [person.id]),
        ],
      ),
      h.div(
        [h.Class("person-rule")],
        [
          h.select(
            [
              h.AriaLabel(`Attendance for ${label}`),
              h.Value(rule.type),
              h.OnChange((value) => Message.ChangedAttendance({ index, field: "type", value })),
            ],
            [
              h.option([h.Value("full")], ["Whole meeting"]),
              h.option([h.Value("start")], ["At the start"]),
              h.option([h.Value("end")], ["At the end"]),
              h.option([h.Value("percentage")], ["Continuous %"]),
            ],
          ),
          rule.type === "full"
            ? h.empty
            : h.input([
                h.Type("number"),
                h.Class("amount"),
                h.Min("1"),
                h.Max(String(rule.type === "percentage" ? 100 : model.duration)),
                h.AriaLabel(`${rule.type === "percentage" ? "Percent" : "Minutes"} for ${label}`),
                h.Title(attendanceLabel(rule)),
                h.Value(String(rule.type === "percentage" ? rule.percent : rule.minutes)),
                h.OnInput((value) => Message.ChangedAttendance({ index, field: "amount", value })),
              ]),
        ],
      ),
      h.input([
        h.Type("number"),
        h.Class("weight"),
        h.AriaLabel(`Weight for ${label}`),
        h.Value(String(person.weight)),
        h.OnInput((value) => Message.ChangedPerson({ index, field: "weight", value })),
      ]),
      h.button(
        [
          h.Class("chip-remove"),
          h.AriaLabel(`Remove ${label}`),
          h.OnClick(Message.RemovedPerson({ index })),
        ],
        ["×"],
      ),
      h.details(
        [h.Class("working-rules")],
        [
          h.summary([], ["Calendar and hours"]),
          h.div(
            [h.Class("working-grid")],
            [
              h.label(
                [h.Class("field wide")],
                [
                  "Identity",
                  h.input([
                    h.Value(person.id),
                    h.OnInput((value) => Message.ChangedPerson({ index, field: "id", value })),
                  ]),
                ],
              ),
              detailField(
                h,
                index,
                "Calendars",
                (person.calendarIds ?? [person.id]).join(","),
                "calendarIds",
              ),
              detailField(h, index, "Timezone", person.timeZone ?? model.timeZone, "timeZone"),
              detailField(
                h,
                index,
                "Weekdays, 1–7",
                (person.workingHours?.days ?? [1, 2, 3, 4, 5]).join(","),
                "workingHours:days",
              ),
              detailField(
                h,
                index,
                "Day starts",
                person.workingHours?.start ?? "09:00",
                "workingHours:start",
              ),
              detailField(
                h,
                index,
                "Day ends",
                person.workingHours?.end ?? "18:00",
                "workingHours:end",
              ),
              detailField(
                h,
                index,
                "Break starts",
                person.workingHours?.breakStart ?? "",
                "workingHours:breakStart",
              ),
              detailField(
                h,
                index,
                "Break ends",
                person.workingHours?.breakEnd ?? "",
                "workingHours:breakEnd",
              ),
            ],
          ),
        ],
      ),
    ],
  );
};

export const audienceView = (model: Model, h: HtmlBuilder<Message>) => {
  const required = model.people.filter((person) => person.required).length;
  const needle = fold(model.filter);
  const visible = model.people
    .map((person, index) => ({ person, index }))
    .filter(({ person }) => fold(`${person.name ?? ""} ${person.id}`).includes(needle));
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
      sourcesView(model, h),
      h.div(
        [h.Class("audience-tools")],
        [
          h.input([
            h.Type("search"),
            h.Placeholder("Filter people"),
            h.AriaLabel("Filter people"),
            h.Value(model.filter),
            h.OnInput((value) => Message.ChangedFilter({ value })),
          ]),
          h.button(
            [h.Class("button ghost small"), h.OnClick(Message.SetRequired({ required: true }))],
            ["All required"],
          ),
          h.button(
            [h.Class("button ghost small"), h.OnClick(Message.SetRequired({ required: false }))],
            ["All optional"],
          ),
          h.button(
            [h.Class("button ghost small"), h.OnClick(Message.AddedPerson())],
            ["Add person"],
          ),
        ],
      ),
      model.people.length === 0
        ? h.div(
            [h.Class("empty small")],
            [h.p([], ["Add sources and resolve them, or load the example"])],
          )
        : h.div(
            [h.Class("people")],
            [
              h.div(
                [h.Class("people-head"), h.AriaHidden(true)],
                [
                  h.span([], ["Req."]),
                  h.span(
                    [],
                    [
                      visible.length === model.people.length
                        ? "Person"
                        : `Person · ${visible.length} of ${model.people.length}`,
                    ],
                  ),
                  h.span([], ["Attendance"]),
                  h.span([], ["Weight"]),
                  h.span([], []),
                ],
              ),
              ...visible.map(({ person, index }) => personRow(model, h, person, index)),
              visible.length === 0
                ? h.p([h.Class("meta no-match")], ["No one matches this filter"])
                : h.empty,
            ],
          ),
      h.details(
        [h.Class("snapshot-tools")],
        [
          h.summary([], ["Import or export participants"]),
          h.textarea([
            h.Placeholder("Paste snapshot JSON"),
            h.AriaLabel("Participant snapshot"),
            h.Value(model.snapshotDraft),
            h.OnInput((value) => Message.ChangedSnapshot({ value })),
          ]),
          h.div(
            [h.Class("snapshot-actions")],
            [
              h.button(
                [h.Class("button ghost small"), h.OnClick(Message.ClickedImport())],
                ["Import"],
              ),
              h.button(
                [h.Class("button ghost small"), h.OnClick(Message.ClickedDownload())],
                ["Download snapshot"],
              ),
            ],
          ),
        ],
      ),
    ],
  );
};
