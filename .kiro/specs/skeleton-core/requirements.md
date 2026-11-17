# Requirements — skeleton-core

1. Core modules: config loader (env, validated), logger (JSON, level-filtered), error types, graceful shutdown helper.
2. HTTP transport: router on node:http, JSON in/out, health endpoint, error-to-status mapping.
3. CLI transport: arg parsing, subcommand dispatch, exit-code mapping — sharing the same core services as HTTP.
4. Proof apps: app-one-api exposes a small resource CRUD over the HTTP transport; app-two-cli manages the same resource model from the terminal.
5. Tests: unit tests for config + errors; one integration test per app.
