import { Runtime } from "foldkit";
import { init, update } from "./app.js";
import { ModelSchema } from "./model.js";
import { view } from "./view.js";

const container = document.getElementById("root");
if (container === null) throw new Error("Meeting Finder root element is missing");
const application = Runtime.makeApplication({ Model: ModelSchema, init, update, view, container });
Runtime.run(application);
