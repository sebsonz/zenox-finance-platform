# M04 — Espace Clients (frontend)

## État actuel

Le composant `CustomersWorkspace` est raccordé à l'application authentifiée via la route `/customers`. Il reçoit le `tenantId` actif depuis le shell applicatif et n'ouvre pas de session ni de sélecteur d'organisation parallèle.

Fonctionnalités disponibles en lecture seule :

- liste des clients actifs, limitée à 100 résultats ;
- recherche par nom légal ou code client via le paramètre `q` ;
- fiche client avec identité, pays, devise par défaut et coordonnées ;
- consultation des contacts et adresses actifs ;
- états de chargement, absence de données et erreurs API ;
- requêtes same-origin avec cookies de session et cache désactivé.

Routes utilisées :

- `GET /api/v1/user/tenants/:tenantId/customers`
- `GET /api/v1/user/tenants/:tenantId/customers/:customerId/contacts`
- `GET /api/v1/user/tenants/:tenantId/customers/:customerId/addresses`

## Sécurité et limites

Le backend vérifie la session, l'appartenance active au tenant, la permission `customers:read` et le statut actif du tenant. Le navigateur ne constitue jamais une autorité pour le tenant ou les permissions.

Aucune création, modification ou suppression n'est exposée dans cette interface utilisateur. Les opérations d'écriture attendent une conception validée de l'acteur utilisateur et de l'audit métier. Les endpoints d'intégration machine restent distincts.

## À faire

- tests dédiés du chargement, des erreurs, des états vides et des détails ;
- validation manuelle dans un environnement local avec une session et des données de test ;
- pagination UI complète si le volume l'exige ;
- écriture utilisateur après conception acteur/audit/CSRF/origine ;
- amélioration UX (filtres, tri, création, modification) après validation sécurité.

Ce module frontend n'est pas déclaré complet ni prêt pour production.
