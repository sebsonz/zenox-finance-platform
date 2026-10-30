# Module Tenants

**Responsabilité :** identité et profil légal/commercial du tenant Finance, adresses de l'entreprise, identifiants réglementaires protégés et accès tenant côté utilisateur.

## Structure

- `domain/` : types métier du profil, adresses et identifiants.
- `schemas/` : validation des entrées du module.
- `application/` : contrats/use cases exposés aux autres modules.
- `services/` : orchestration métier et autorisations tenant.
- `repositories/` : accès SQL aux seules tables propriétaires du module.
- `routes/` : adaptateurs HTTP utilisateur.
- `types/` : types techniques partagés strictement nécessaires.
- `tests/` : tests unitaires et d'intégration du module.

## Frontières

- `finance_tenants` reste la source canonique de `legal_name`, `country_code`, `default_currency` et du statut.
- Les adresses tenant ne réutilisent pas `finance_customer_addresses`.
- Les identifiants fiscaux/réglementaires doivent être chiffrés avant persistance; seules les valeurs masquées et empreintes HMAC sont utilisables dans les vues/listes.
- Le tenant courant est dérivé du contexte authentifié et des memberships serveur. Aucun `tenantId` fourni par le navigateur n'est une preuve d'autorisation.
- Les modifications du profil ne modifient jamais les snapshots des documents émis.

## Dépendances

Le module n'implémente ni authentification, ni règles fiscales, ni références d'intégration. Il expose des contrats applicatifs pour les besoins intermodules. SQL uniquement dans ses repositories.
