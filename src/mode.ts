import { Schema } from "effect";
export const ModeSchema = Schema.Literals(["live", "demo"]);
export type Mode = Schema.Schema.Type<typeof ModeSchema>;
