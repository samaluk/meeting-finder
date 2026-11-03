import { Effect, FileSystem } from "effect";
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http";
import { OpenApi } from "effect/http-api";
import { fileURLToPath } from "node:url";
import { MeetingFinderApi } from "../api.js";
import { getCapabilities, getInputSchema, docs, agentSkill } from "../discovery.js";
import { problem } from "./problem.js";
import { discoveryPaths } from "./paths.js";
const getOpenApi = () => OpenApi.fromApi(MeetingFinderApi);
const json = (value: unknown) => HttpServerResponse.jsonUnsafe(value);
const webRoot = fileURLToPath(new URL("../../dist/web/", import.meta.url));
const staticResponse = Effect.fn("meeting-finder.http.discovery")(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest;
  const path = new URL(request.url, "http://localhost").pathname;
  if (path === "/schema.json") return json(getInputSchema());
  if (path === "/openapi.json") return json(getOpenApi());
  if (path === "/docs" || (path === "/" && request.headers.accept?.includes("text/markdown")))
    return HttpServerResponse.text(docs, { contentType: "text/markdown" });
  if (path === "/llms.txt") return HttpServerResponse.text(docs, { contentType: "text/plain" });
  if (path === "/.well-known/api-catalog")
    return json({ name: "meeting-finder", endpoints: getCapabilities().discovery });
  if (path === "/.well-known/agent-skills/index.json")
    return json({
      skills: [{ name: "meeting-finder", path: "/.well-known/agent-skills/meeting-finder.md" }],
    });
  if (path === "/.well-known/agent-skills/meeting-finder.md")
    return HttpServerResponse.text(agentSkill, { contentType: "text/markdown" });
  const name = path === "/" ? "index.html" : path.slice("/assets/".length);
  if (path !== "/" && !/^[A-Za-z0-9._-]+\.(?:js|css)$/u.test(name))
    return problem(404, "Asset not found");
  const fs = yield* FileSystem.FileSystem;
  const content = yield* fs
    .readFileString(path === "/" ? `${webRoot}index.html` : `${webRoot}assets/${name}`)
    .pipe(Effect.match({ onSuccess: (value) => value, onFailure: () => undefined }));
  return content === undefined
    ? problem(404, "Asset not found")
    : HttpServerResponse.text(content, {
        contentType: path.endsWith(".js")
          ? "text/javascript"
          : path.endsWith(".css")
            ? "text/css"
            : "text/html",
      });
});

export const discoveryRoutes = HttpRouter.use((router) =>
  Effect.gen(function* () {
    for (const path of discoveryPaths) yield* router.add("GET", path, staticResponse());
    yield* router.add("GET", "/assets/*", staticResponse());
  }),
);
