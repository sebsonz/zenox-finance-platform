# Strict modular architecture

## Runtime baseline

- Node.js 22+
- TypeScript strict mode
- Express 5 REST API
- PostgreSQL through pg
- API namespace: /api/v1
- Exact decimal arithmetic via decimal.js; persisted money uses PostgreSQL NUMERIC.

## Target structure

```text
src/
  app.ts                         # Express composition root; no listen()
  server.ts                      # process lifecycle, listen, shutdown
  config/                        # validated environment and app configuration
  db/                            # pool, transaction helper, migration metadata
  middleware/                    # request ID, authentication, authorization, errors
  routes/v1/                     # versioned route composition only
  modules/
    health/
      routes/
      services/
    tenants/
      controllers/
      repositories/
      services/
      validators/
      types/
    integration-auth/
      controllers/
      repositories/
      services/
      validators/
      types/
    customers/
      controllers/
      repositories/
      services/
      validators/
      types/
    currencies/
      controllers/
      repositories/
      services/
      validators/
      types/
    tax/
      controllers/
      repositories/
      services/
      engine/
      validators/
      types/
    invoices/
      controllers/
      repositories/
      services/
      engine/
      validators/
      types/
    payments/
      controllers/
      repositories/
      services/
      validators/
      types/
    idempotency/
      repositories/
      services/
      types/
    audit/
      repositories/
      services/
      types/
  domain/                         # shared value objects only, no business workflows
  utils/
tests/
  unit/
  integration/
  security/
  contract/
supabase/migrations/
```

## Dependency rules (mandatory)

1. Routes only map HTTP input/output to controllers. No SQL or business calculations.
2. Controllers validate/translate HTTP concerns and call one application service. They do not access the database directly.
3. Services orchestrate use cases and transactions. They do not contain Express request/response objects.
4. Repositories are the only business-module layer allowed to execute SQL.
5. Engines are deterministic calculations (tax, invoice totals, allocation rules) and have no HTTP/database dependencies.
6. Validators define input contracts; domain types define internal contracts. Do not use raw request bodies as domain types.
7. A module may call another module only through an explicitly exported service/interface, never by importing another module's repository.
8. Shared domain/ may contain value objects such as Money, CurrencyCode, TenantId and typed errors; never place invoice/payment workflows there.
9. Route registration is centralized under routes/v1. A module exports a route registrar, not global application setup.
10. Database access must use parameterized SQL. Financial writes use explicit transactions and tenant scope.
11. No module may infer tenant authorization from a body/query parameter. Tenant access is derived from authenticated principal context and checked on every use case.
12. Each module owns its migrations or clearly names its schema objects; migrations are ordered, immutable once applied, and tested on a dedicated Finance database.
13. No direct browser access to the database. No client receives service credentials.
14. External side effects (webhooks, provider calls) happen through explicit adapters/outbox patterns, not inside pure calculation engines.
15. app.ts composes middleware and routes but never opens a network listener. server.ts owns process lifecycle and graceful shutdown.
16. Each module has an explicit public surface. Internal repositories and engines are private implementation details.

## Standard module layering

```text
HTTP route -> controller -> validator -> service/use case
                                   service -> engine (pure calculations)
                                   service -> repository (SQL)
                                   service -> transaction manager
```

## Financial invariants

- Decimal strings at API boundaries; no JavaScript Number for money.
- PostgreSQL NUMERIC for persisted amounts.
- Currency precision and rounding policy are explicit, versioned configuration.
- Issued invoice snapshots are immutable; corrections use explicit documents/workflows.
- Confirmed payments only can be allocated, and allocation is atomic and bounded.
- Idempotency keys are unique within tenant + operation; same key with a different canonical request hash is a conflict.
- Tenant isolation and auditability are mandatory for every financial read/write.
- No production Finance API exposure until authentication, tenant authorization, RLS/role grants and tests are complete.

## Validation workflow

1. Confirm module scope and contracts.
2. Validate schema and invariants.
3. Implement one module at a time in its layer boundaries.
4. Add unit tests for engines and validators.
5. Add integration tests for repository transactions.
6. Add tenant-isolation, idempotency, concurrency and authorization tests.
7. Run typecheck, build, tests and migration checks.
8. Record a checkpoint with commands and actual results. Never report tests as passing unless they were executed.
