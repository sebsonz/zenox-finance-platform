# Supabase environment transition plan

## Target project

- Supabase organization: `zenoxfinance`
- Supabase project URL: `https://qsmairsmgfnlmiltvgvn.supabase.co`
- Intended use: ZENOX Finance only, after the legacy V1 database contents have been deliberately cleared and the target schema has been reviewed.

## Important current-state boundary

The project was moved into the `zenoxfinance` organization and is intended to be repurposed from the old V1 database. Do **not** run the Finance migration runner against the existing database while V1 tables/data are still present. The current Finance migration files are not a verified in-place conversion of the legacy V1 schema.

The repository work and CI use a disposable PostgreSQL database. Passing CI does not mean the live Supabase project has been migrated or validated.

## Controlled cutover checklist

1. Confirm the exact Supabase project and that any V1 data needed for records or recovery has been exported and stored securely outside GitHub.
2. Inspect the existing schema, extensions, roles, policies, triggers, functions, and storage objects; identify any project-level settings that should be retained.
3. Confirm the project is no longer serving any V1 application or production traffic.
4. Take and verify a recoverable backup/export before destructive changes.
5. Obtain explicit confirmation immediately before clearing the live database. The clear operation is destructive and must not be bundled with ordinary application commits.
6. Clear only the intended legacy application objects/data, preserving or deliberately recreating required Supabase-managed objects, roles, extensions, and auth configuration. Do not use an indiscriminate drop of the whole public schema without an inventory.
7. Apply the Finance migrations to the intended project using the reviewed deployment procedure.
8. Verify migration history, tables, RLS and FORCE RLS states, policies, grants, functions, indexes, and a least-privilege backend connection.
9. Configure server-side environment values in the deployment secret manager. Never commit `DATABASE_URL`, service-role keys, or integration tokens.
10. Run post-deployment smoke tests and cross-tenant denial tests before connecting the UI.

## Environment configuration

For the API/BFF, set the project URL and public/anon key as server-side configuration for the Auth verification call:

- `SUPABASE_URL=https://qsmairsmgfnlmiltvgvn.supabase.co`
- `SUPABASE_ANON_KEY=<configure in deployment environment; do not commit>`

Use the anon/publishable key only for the Auth user verification endpoint. Never substitute a Supabase service-role key in this setting. Database connection credentials and Finance integration credentials remain separate server-only secrets.

## Not yet completed

This document does not clear the live database, apply migrations to Supabase, configure deployment secrets, or certify the project for production. Those actions require an inventory and a verified backup first.
