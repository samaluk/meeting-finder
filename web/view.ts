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
          h.a(
            [h.Href("/"), h.Class("brand")],
            [h.span([h.Class("mark"), h.AriaHidden(true)], ["m/f"]), "meeting-finder"],
          ),
          h.button(
            [
              h.Class(`mode ${model.mode}`),
              h.AriaLabel(
                model.mode === "demo"
                  ? "Demo mode, simulated calendars. Switch mode"
                  : "Live mode, Google calendars. Switch mode",
              ),
              h.OnClick(Message.ChangedMode()),
            ],
            [model.mode === "demo" ? "Demo mode" : "Live mode"],
          ),
        ],
      ),
      h.main(
        [h.Class("shell")],
        [
          h.div(
            [h.Class("page-head")],
            [
              h.div(
                [],
                [
                  h.h1([], ["Find a meeting time"]),
                  h.p(
                    [h.Class("page-lede")],
                    [
                      model.mode === "demo"
                        ? "Simulated calendars. Nothing is read from Google"
                        : "Reads free/busy through your gws login. Nothing is booked or sent",
                    ],
                  ),
                ],
              ),
              h.button(
                [h.Class("button secondary"), h.OnClick(Message.ClickedExample())],
                ["Load example"],
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
