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

const router = createTaskRouter(config.storePath, config.serviceName);
const server = serve(router, config.port, log);
onShutdown(log, () => new Promise<void>((resolve) => server.close(() => resolve())));

log.info("app-one-api ready", { service: config.serviceName, store: config.storePath });
