import type { HtmlBuilder } from "foldkit/html";
import { Message, type Model, type RuleField } from "../model.js";
const field = (
  h: HtmlBuilder<Message>,
  label: string,
  value: string,
  fieldName: RuleField,
  type = "text",
) =>
  h.label(
    [],
    [
      label,
      h.input([
        h.Type(type),
        h.Value(value),
        h.OnInput((value) => Message.ChangedRule({ field: fieldName, value })),
      ]),
    ],
  );

export const rulesView = (model: Model, h: HtmlBuilder<Message>) =>
  h.section(
    [h.Class("rules card")],
    [
      h.p([h.Class("eyebrow")], ["01 / SEARCH RULES"]),
      h.h2([], ["When should we meet?"]),
      h.div(
        [h.Class("form-grid")],
        [
          field(h, "Start date", model.startDate, "startDate", "date"),
          field(h, "End date", model.endDate, "endDate", "date"),
          field(h, "Timezone", model.timeZone, "timeZone"),
          field(h, "Duration", String(model.duration), "duration", "number"),
          field(h, "Step", String(model.step), "step", "number"),
          field(h, "Buffer", String(model.buffer), "buffer", "number"),
          field(h, "Minimum attendance", String(model.minimum), "minimum", "number"),
          field(h, "Options", String(model.maxResults), "maxResults", "number"),
        ],
      ),
    ],
  );
