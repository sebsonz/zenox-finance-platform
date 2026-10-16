# Integration fixtures and migration drift audit

## Purpose

The Finance integration suite uses synthetic, deterministic tenants and currency rows from
`tests/fixtures/integration-seed-manifest.json`. This manifest is versioned with the code,
reviewed as source, validated before use, and deliberately names tenants in the `ITEST_`
namespace. Currency rows used for tests must have `source = INTEGRATION_TEST`.

The manifest is not production seed data and must never be loaded into ZENOX FRET.

## Safe fixture preparation

Run `npm run db:test:prepare` only against the disposable local/CI database
`finance_test`. The preparation script refuses non-loopback hosts and database names
other than `finance_test`; it also validates manifest schema, tenant namespaces, unique IDs,
and currency fixture source before writing data.

The script creates or hardens the CI-only `finance_runtime_test` login and validates
non-superuser / non-BYPASSRLS flags and effective grants. Membership administration remains
separate from the ordinary invoice runtime role.

## Migration drift command

`npm run db:drift-check` is read-only. It starts a PostgreSQL READ ONLY transaction and
compares the repository's timestamped SQL files with `public.finance_schema_migrations`:

- an applied migration whose checksum changed is a blocking drift finding;
- an applied migration missing from source control is a blocking finding;
- duplicate timestamps and filenames outside the naming convention are blocking findings;
- unapplied repository migrations are listed as pending and are never applied by this command.

This command never creates the migration ledger and never runs SQL from migration files.
In CI it runs after migrations have been applied to the disposable `finance_test` service.
Run it against a dedicated Finance environment only as an explicit read-only audit after
verifying the connection target; do not use any FRET connection string.

## Real database change control

A clean drift report is not, by itself, authorization to apply migrations to a live system.
Before a live Finance migration, inventory the existing objects/ledger and role grants,
verify a restorable backup, review the ordered forward-only migration plan, and obtain
explicit deployment authorization. Never reset or drop an entire schema as a shortcut.
