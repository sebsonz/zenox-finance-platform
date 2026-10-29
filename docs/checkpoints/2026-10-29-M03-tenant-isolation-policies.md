# M03 — Multi-tenancy et politiques

**Branche de travail :** `feat/m03-tenant-isolation-policies`
**Base de travail :** `feat/m01-identity-access-sessions`
**Architecture de référence :** `docs/architecture/2026-10-29-complete-modular-architecture-fr.md` (v1.0)
**Statut :** démarré — non validé; aucune déclaration de complétude avant preuves CI sur le SHA final.

## Décision de périmètre

M03 signifie exclusivement **Multi-tenancy et politiques** : contexte tenant fiable, membership/grants, autorisation tenant, politiques d'accès, isolation DB/RLS et tests négatifs cross-tenant.

Les clients relèvent de M04. Les devises et références relèvent de M06. Le travail existant clients/devises est conservé sur sa branche existante et ne doit pas être fusionné ou déplacé automatiquement dans M03.

## Base réutilisable constatée

- M01 est la base de branche choisie; son checkpoint reste « en cours » tant que tous les critères listés ne sont pas validés.
- `backend/src/modules/tenants/repositories/tenant-members.repository.ts` et `tenant-member-management.repository.ts` existent pour la lecture/gestion des membres; ils ne suffisent pas à eux seuls à prouver l'isolation complète du domaine.
- `backend/src/modules/integration-auth/types/authenticated-principal.ts` définit un contexte de requête d'intégration avec `tenantId`, `principal`, scopes et `allowedTenantIds`.
- `backend/src/db/transaction.ts` fournit le contexte transactionnel tenant utilisé par les repositories.
- La fondation SQL contient `finance_tenants`, `finance_integration_principals` et `finance_idempotency_keys`.
- Aucun changement de migration distante ne doit être effectué; les tests de migration restent limités à PostgreSQL jetable.

## Travail d'acceptation

1. Cartographier les chemins d'authentification user et service, le contexte tenant et les grants existants, sans déplacer massivement les fichiers.
2. Définir un contrat unique et fail-closed de résolution du tenant depuis l'identité authentifiée et un membership/grant actif; ne jamais faire confiance au seul `tenantId` du corps de requête.
3. Vérifier que les handlers/services valident scope et grant avant d'appeler les repositories.
4. Vérifier les politiques RLS et FORCE RLS, les rôles/grants runtime, et la transaction-localité de `app.tenant_id`.
5. Ajouter/compléter des tests négatifs : tenant absent/invalide, membership/grant absent ou révoqué, principal d'intégration non autorisé, accès croisé A→B, contexte manquant, rôle runtime à privilèges minimaux.
6. Exécuter les tests unitaires, intégration PostgreSQL jetable, typecheck/build et CI; enregistrer les résultats et le SHA exact.
7. Mettre à jour ce checkpoint avec les preuves et les blocages réels.

## Frontières modulaires obligatoires

- Routes HTTP : transport, validation d'entrée et traduction d'erreurs.
- Application/use cases : orchestration et autorisation requise.
- Domain/policies : invariants et décisions d'accès.
- Repositories : SQL et persistance du domaine propriétaire uniquement.
- Shared : primitives génériques d'auth, tenancy, DB, erreurs et observabilité; aucune logique métier propre à un autre module.
- Frontend : expérience/navigation seulement; jamais une frontière d'autorisation.
- Les autres domaines passent par les contrats/services de tenancy, pas par l'import de détails privés.

## Garde-fous

- Ne pas fusionner de PR sans accord explicite.
- Ne pas exécuter de migration sur Supabase distant sans accord explicite.
- Ne pas réinitialiser, nettoyer ou écraser les modifications locales.
- Ne pas déclarer M01 ou M02 terminés sur la seule base d'une CI verte ou de l'existence des routes.
- Ne pas renommer/supprimer la branche historique `feat/m03-customers-currencies`; elle est conservée pour récupération ultérieure du travail M04/M06.
