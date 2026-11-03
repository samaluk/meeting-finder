import { BunServices } from "@effect/platform-bun";
import { Layer } from "effect";
import type { Mode } from "./mode.js";
import { DemoCalendarAvailabilityLive, DemoDirectoryLive } from "./adapters/demo.js";
import { GwsCalendarAvailabilityLive, GwsDirectoryLive } from "./adapters/gws.js";
import { GwsProcessLive } from "./adapters/gws-process.js";

const demo = Layer.merge(DemoDirectoryLive, DemoCalendarAvailabilityLive);
const live = Layer.merge(GwsDirectoryLive, GwsCalendarAvailabilityLive).pipe(
  Layer.provide(GwsProcessLive),
  Layer.provide(BunServices.layer),
);

/** The only place where transport mode chooses external data providers. */
export const providerLayer = (mode: Mode) => (mode === "demo" ? demo : live);
