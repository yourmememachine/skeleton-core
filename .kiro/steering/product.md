# Product steering — Skeleton Core

Build a skeleton code template for small TypeScript services:
- Lean: a new reader understands the whole template in one sitting.
- Flexible: the same core must support a REST API and a CLI without forking the core.
- No heavy frameworks. Node standard library first; dependencies only when they remove real complexity.
- Every module has one job: config, logging, errors, transport (HTTP or CLI), domain, tests.
