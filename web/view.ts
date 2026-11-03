import type { Document, HtmlBuilder } from "foldkit/html";
import { Message, type Model } from "./model.js";
import { rulesView } from "./view/rules.js";
import { audienceView } from "./view/audience.js";
import { resultsView } from "./view/results.js";
export const view = (model: Model, h: HtmlBuilder<Message>): Document => ({
  title: "Meeting Finder",
  body: h.div(
    [],
    [
      h.header(
        [h.Class("topbar")],
        [
          h.a([h.Href("/"), h.Class("brand")], ["meeting-finder"]),
          h.button(
            [h.Class("button ghost"), h.OnClick(Message.ChangedMode())],
            [model.mode === "demo" ? "Demo mode" : "Live mode"],
          ),
        ],
      ),
      h.main(
        [h.Class("shell")],
        [
          h.div(
            [h.Class("hero")],
            [
              h.h1([], ["Find a time people can actually make."]),
              h.button(
                [h.Class("button secondary"), h.OnClick(Message.ClickedExample())],
                ["View example"],
              ),
            ],
          ),
          model.error === null
            ? h.empty
            : h.div([h.Class("notice error"), h.Role("alert")], [model.error]),
          rulesView(model, h),
          h.div([h.Class("workspace")], [audienceView(model, h), resultsView(model, h)]),
        ],
      ),
    ],
  ),
});
