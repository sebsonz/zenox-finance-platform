# Supabase environment transition plan

## Target project

- Supabase organization: `zenoxfinance`
- Supabase project URL: `https://qsmairsmgfnlmiltvgvn.supabase.co`
- Intended use: ZENOX Finance only.
- Working assumption confirmed by the project owner: the latest V1 database dump already exists, and the old V1 application is not expected to remain in use.

## Migration strategy

Treat V1 as an archived reference, not as the active application to evolve. Keep the latest V1 dump outside GitHub as the historical recovery/reference artifact. Do not copy its old application schema blindly into Finance: the Finance migrations are the intended target schema and are not a verified in-place conversion of the V1 schema.

The current Finance migration files must not be applied to a database still containing conflicting legacy objects. The old project has not been dropped or cleared by this repository change.

The repository and CI use a disposable PostgreSQL database. Passing CI does not mean the live Supabase project has been migrated or validated.

## Controlled cutover checklist

1. Verify that the latest V1 dump is readable and stored securely outside GitHub. Do not upload database dumps, credentials, or personal/financial data to the repository.
2. Confirm that the `qsmairsmgfnlmiltvgvn` project is the intended target and is no longer serving V1 production traffic.
3. Inventory the live project's schema, extensions, roles, policies, triggers, functions, storage objects, and Auth settings before removing legacy application objects.
4. Since the owner considers V1 no longer needed, prepare a targeted cleanup that removes only legacy application objects/data while preserving or deliberately recreating required Supabase-managed objects, roles, extensions, and Auth configuration.
5. Do not use an indiscriminate drop of the entire `public` schema or drop/recreate the Supabase project as a shortcut. Review the cleanup SQL against the inventory first.
6. Apply the Finance migrations to the target project using a reviewed deployment procedure.
7. Verify migration history, tables, RLS and FORCE RLS states, policies, grants, functions, indexes, and a least-privilege backend connection.
8. Configure server-side environment values in the deployment secret manager. Never commit `DATABASE_URL`, service-role keys, or integration tokens.
9. Run post-deployment smoke tests and cross-tenant denial tests before connecting the UI.

## Environment configuration

For the API/BFF, configure:

- `SUPABASE_URL=https://qsmairsmgfnlmiltvgvn.supabase.co`
- `SUPABASE_ANON_KEY=<configure in server environment; do not commit>`

Use the anon/publishable key only for the Auth user verification endpoint. Never substitute a Supabase service-role key in this setting. Database connection credentials and Finance integration credentials remain separate server-only secrets.

## Not yet completed

This document does not clear the live database, apply migrations to Supabase, configure deployment secrets, or certify the project for production. Those operations still require the inventory and a reviewed, targeted cleanup procedure.
