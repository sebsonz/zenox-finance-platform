# ZENOX Finance — checkpoint de continuité
Date : 2026-10-17
Repository : https://github.com/sebsonz/zenox-finance-platform
Branche active : `chore/monorepo-frontend-backend-structure`
PR : https://github.com/sebsonz/zenox-finance-platform/pull/6 (ouverte, brouillon, non fusionnée)
Projet Supabase Finance identifié : référence `qsmairsmgfnlmiltvgvn`
Dernier commit local/distant connu au moment de ce checkpoint : `5e8f9a361b75ac9fdb21d7a0e69c7fc48a89b12f` (`chore: update Finance dependency lockfiles`).

## Objectif et architecture validés
- ZENOX Finance est un SaaS autonome, avec dépôt et base propres, destiné à fournir la facturation/paiement via une API à ZENOX FRET.
- ZENOX FRET V2 reste isolé. Ne jamais utiliser ou modifier sa base `zenoxfret_v2`, ses identifiants ou sa chaîne de connexion.
- Flux convenu : GitHub Actions + PostgreSQL jetable pour valider migrations et tests ; puis déploiement contrôlé vers le projet Supabase dédié Finance.
- Ne pas vider/resetter le projet Supabase automatiquement. D’abord inventorier schéma/historique/roles, préparer une sauvegarde restaurable, examiner les migrations en attente et obtenir une autorisation explicite avant application.
- Pas de merge de la PR #6 sans approbation explicite.
- Ne jamais lancer de migrations ou scripts de préparation sur une base réelle pendant la phase de validation.
- Ne pas divulguer ou demander le contenu des fichiers `.env`, ni aucun secret.

## État du dépôt et dépendances
- Réorganisation monorepo : backend dans `backend/`, frontend dans `frontend/`, migrations Finance dans `supabase/migrations/`, CI dans `.github/workflows/ci.yml`.
- Commit `5e8f9a3` poussé avec uniquement ces quatre fichiers :
  - `backend/package.json`
  - `backend/package-lock.json`
  - `frontend/package.json`
  - `frontend/package-lock.json`
- Versions locales installées après changement :
  - Backend : Node attendu >=22 ; Express 5.3.0, pg 8.23.1, Vitest 5.0.5, TypeScript 5.9.3, tsx 4.23.15, Zod 4.6.7, dotenv 16.6.1, decimal.js 10.6.0.
  - Frontend : React/React DOM 19.3.1, Vite 8.3.4, @vitejs/plugin-react 6.1.2, TypeScript 5.9.3, lucide-react 0.468.0.
- Contrôles locaux réussis après ces changements : backend typecheck, backend build, frontend typecheck, frontend build.
- Les versions majeures ont évolué (Vitest 3→5, Vite 6→8, plugin React 4→6) : la CI doit valider ces changements, pas seulement les builds locaux.

## Résultat CI le plus récent connu
- Workflow : `ZENOX Finance CI`, exécution #241, run ID `39057303403`, commit/PR head correspondant aux changements de dépendances.
- Résultat : ÉCHEC à l’étape `Unit and PostgreSQL integration tests`.
- Réussites avant l’échec :
  1. installation backend ;
  2. backend typecheck ;
  3. backend build ;
  4. application des migrations sur le PostgreSQL jetable `finance_test` ;
  5. préparation du rôle d’intégration limité et des fixtures ;
  6. audit des checksums / drift de migrations.
- Tests : 67 fichiers réussis, 1 fichier en échec ; 293 tests réussis, 1 test en échec sur 294.
- Échec exact : `backend/tests/integration/tenant-membership.postgres.test.ts`, test `enforces membership tenant isolation and fails closed without tenant context`. Assertion attendait `rowCount = 1`, résultat observé `rowCount = 2`. Cela indique que l’isolation de tenant n’est pas démontrée par le test actuel ; investiguer la policy RLS et le contexte de session. Ne pas affaiblir/supprimer l’assertion pour faire passer CI.
- Les étapes frontend CI ont été ignorées car l’étape de tests backend a échoué.
- Logs GitHub : https://github.com/sebsonz/zenox-finance-platform/actions
- La migration concernée est `supabase/migrations/20261016000700_user_tenant_memberships.sql`, policy `finance_user_membership_tenant_isolation`, fondée sur `tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid`. Le test utilise `SET LOCAL ROLE finance_runtime_test` et `set_config('app.tenant_id', tenantA, true)`; inspecter pourquoi deux tenants restent visibles.
- Aucun accès ni changement de base Supabase réelle n’a été effectué. La migration CI a seulement touché la base jetable du runner GitHub.

## État local à préserver
Après le commit, `git status --short` montre des fichiers non suivis qui doivent rester locaux jusqu’à décision :
- `backend/package-lock.before-fix.json`
- `backend/package-lock.pre-rebuild.json`
- `backend/package.pre-deps-update.json`
- `frontend/package-lock.before-fix.json`
- `frontend/package-lock.pre-rebuild.json`
- `frontend/package.pre-deps-update.json`
- `frontend/tsconfig.tsbuildinfo` (cache TypeScript)
- `package-lock.json` (lock racine)
Ne pas supprimer les sauvegardes. Ne pas les ajouter au commit par défaut. Ne pas utiliser `git reset --hard`, `git clean` ou `push --force`.

## Prochaine séquence de travail
1. Reprendre ce checkpoint dans le nouveau chat.
2. Lire les fichiers actuels depuis la branche `chore/monorepo-frontend-backend-structure` et inspecter le test d’intégration et la migration RLS.
3. Corriger la cause de l’échec tenant isolation (ne pas changer l’assertion de sécurité pour masquer le problème).
4. Relancer localement les tests pertinents si une base jetable sûre est disponible ; sinon s’appuyer sur la CI GitHub. Ne pas employer la base PostgreSQL locale `postgres` non identifiée.
5. Commit/push uniquement les corrections ciblées après revue.
6. Attendre une CI entièrement verte (y compris frontend) avant d’envisager le déploiement Supabase.
7. Avant le premier déploiement Supabase Finance : confirmer la cible via l’identité de connexion sans exposer de secrets, inventorier les objets et le ledger de migrations, obtenir une sauvegarde restaurable, examiner chaque migration pending, puis demander confirmation explicite avant exécution.
8. Ne jamais toucher à `zenoxfret_v2`.

## Configuration locale et authentification
- `backend/.env` a été observé avec les variables `DATABASE_URL`, `NODE_ENV`, `PORT`, `SUPABASE_ANON_KEY`, `SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`; pas de `FINANCE_SERVICE_TOKEN` dans le fichier au moment du contrôle.
- La valeur de `DATABASE_URL` a été reconnue comme pointant vers `127.0.0.1`, base `postgres`, mais l’authentification du rôle `postgres` a échoué. Ne pas tenter de changer les identifiants, ne pas modifier `pg_hba.conf`, et ne pas utiliser cette base comme base de test.
- Le PostgreSQL local répond au port 5432, mais sa base et ses données n’ont pas été inventoriées. Ne pas s’en servir pour migration/test.

## Règles de travail de l’utilisateur
- Avancer étape par étape avec commandes PowerShell précises, attendre le résultat avant l’étape suivante.
- Préserver les validations précédentes et ne pas recommencer des audits déjà confirmés sans raison.
- Garder la séparation stricte entre Finance et FRET.
- Pas de push/merge/migration supplémentaire sans accord approprié ; l’accord de push donné ici concernait le commit de dépendances uniquement.
