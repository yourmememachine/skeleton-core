# Tech steering

- TypeScript, strict mode, Node 20+.
- Tests with node's built-in test runner — no test-framework dependency.
- Structured JSON logging behind a tiny interface so apps can swap sinks.
- Config from environment variables, validated at startup, fail fast with a clear message.
- Errors are values at module boundaries; transport layers translate them to HTTP status / exit codes.
