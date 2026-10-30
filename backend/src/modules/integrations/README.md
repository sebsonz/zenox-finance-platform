# Module Integrations

**Responsabilité :** mapping stable entre identifiants d'entreprises externes et tenants Finance, ainsi que contrats d'intégration machine versionnés.

## Structure

- `domain/` : types et invariants des références externes.
- `schemas/` : validation stricte des entrées/sélections externes.
- `application/` : contrats et use cases d'intégration.
- `services/` : orchestration de résolution/mapping.
- `repositories/` : accès SQL aux seules tables de mapping appartenant au module.
- `routes/` : adaptateurs HTTP machine versionnés.
- `types/` : types techniques strictement nécessaires.
- `tests/` : tests unitaires et d'intégration du module.

## Frontières de sécurité

- Une référence externe ne crée aucun principal, scope ou grant.
- L'autorisation machine reste sous la responsabilité de `integration-auth` et exige principal actif + secret valide + scope + grant tenant explicite.
- Les IDs internes Finance ne sont jamais remplacés par les IDs externes.
- Une référence externe seule ne confère aucun accès.
- Les acteurs sont dérivés du contexte authentifié côté serveur.
- SQL uniquement dans les repositories.
