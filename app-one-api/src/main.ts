// app-one-api — proof application 1: a REST API built on skeleton-core.
//
// It contains NO business logic of its own: config, logging, storage,
// validation and error mapping all come from the core. This file only
// wires the router (src/app.ts) to a port — compare app-two-cli, which
// wires the same TaskService to terminal commands instead.

import { createLogger, loadConfig, onShutdown, serve } from "../../skeleton-core/src/index.js";
import { createTaskRouter } from "./app.js";

const config = loadConfig();
const log = createLogger(config.logLevel);

// This app's own name unless the operator overrides it: /health should
// identify app-one-api, not the core's generic "skeleton-app" default.
const serviceName = process.env.SERVICE_NAME ?? "app-one-api";

const router = createTaskRouter(config.storePath, serviceName);
const server = serve(router, config.port, log);
onShutdown(log, () => new Promise<void>((resolve) => server.close(() => resolve())));

// A failed bind is fatal for a server. serve() has already logged the
// error through the logger; exit rather than idle with no listener.
server.on("error", () => process.exit(1));
// "Ready" only once the port is actually bound — never before it.
server.once("listening", () => {
  log.info("app-one-api ready", { service: serviceName, store: config.storePath });
});
