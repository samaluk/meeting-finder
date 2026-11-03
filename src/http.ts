import { BunHttpServer, BunServices } from "@effect/platform-bun";
import { Context, Effect, Layer, Schema } from "effect";
import { HttpRouter, HttpServer } from "effect/http";
import { inputError, issuesFromSchemaError } from "./errors.js";
import { configureHttp, type HandlerOptions } from "./http-options.js";
import { apiRoutes } from "./http/routes.js";
import { discoveryRoutes } from "./http/discovery.js";
import { localProtocol } from "./http/protocol.js";
export { validateProxyOrigin } from "./http-options.js";
const app = (options: HandlerOptions) =>
  Layer.unwrap(
    configureHttp(options).pipe(
      Effect.map((configured) =>
        Layer.mergeAll(apiRoutes(configured), discoveryRoutes, localProtocol(configured)).pipe(
          HttpRouter.provideRequest(BunServices.layer),
          Layer.provide(HttpServer.layerServices),
          Layer.provide(BunServices.layer),
        ),
      ),
    ),
  );
export const makeHandler = (options: HandlerOptions = {}) =>
  HttpRouter.toWebHandler(app(options), { disableLogger: true });

const PortSchema = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 65535 }));

export const serve = <E = never, R = never>(
  options: HandlerOptions & {
    readonly port?: number;
    readonly onListening?: (address: string) => Effect.Effect<void, E, R>;
  } = {},
) =>
  Layer.launch(
    Layer.unwrap(
      Schema.decodeEffect(PortSchema)(options.port ?? 0).pipe(
        Effect.mapError((cause) =>
          inputError(
            "Invalid server port",
            "Use an integer from 0 through 65535",
            issuesFromSchemaError(cause).map((entry) => ({
              ...entry,
              path: ["port", ...entry.path],
            })),
          ),
        ),
        Effect.map((port) =>
          HttpRouter.serve(app(options), { disableLogger: true, disableListenLog: true }).pipe(
            Layer.provideMerge(BunHttpServer.layer({ hostname: "127.0.0.1", port })),
            Layer.tap(
              (context) =>
                options.onListening?.(
                  HttpServer.formatAddress(Context.get(context, HttpServer.HttpServer).address),
                ) ?? Effect.void,
            ),
          ),
        ),
      ),
    ),
  );

export const HttpApp = app;
