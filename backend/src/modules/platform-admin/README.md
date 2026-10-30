# M20 — Administration plateforme

## Responsabilité

M20 possède les opérations de contrôle-plane réservées aux opérateurs explicitement autorisés : accès plateforme, vue des tenants/utilisateurs, revue des demandes, suspension contrôlée, audit et outils de support minimaux.

## Architecture

- `routes/` : transport HTTP de l'administration plateforme.
- `services/` : autorisation applicative des opérateurs et orchestration des cas d'usage.
- `repositories/` : accès au registre des opérateurs plateforme uniquement.
- Les domaines métier restent propriétaires de leurs données. M20 ne fait pas de SQL direct sur les tables privées de M02/M10/M24.
- Les lectures d'un autre domaine passent par son cas d'usage ou son contrat applicatif public.

## Autorisation

- L'identité vient exclusivement de `requireUserAuth`.
- La clé d'autorisation est le couple vérifié Supabase `issuer + subject`.
- Une adresse email, un rôle envoyé par le navigateur ou un `tenantId` fourni par le client ne donne aucun privilège.
- L'adresse email doit être confirmée.
- La décision finale est vérifiée côté backend et par la fonction SQL `finance_is_active_platform_operator`.
- Les opérations sensibles sont auditées par le domaine propriétaire.

## Première tranche

La route `GET /api/v1/platform-admin/tax/jurisdictions` est un endpoint plateforme en lecture seule. Elle vérifie M20 puis appelle le cas d'usage public de M10 Tax. Le domaine M10 garde la propriété de la validation et de la persistance du référentiel.

Ce module n'est pas déclaré complet : les écrans organisations, utilisateurs, audit, finance et les opérations de support restent à construire et à valider.
