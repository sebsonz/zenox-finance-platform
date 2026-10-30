# M10 — Fiscalité

## Responsabilité

M10 possède les juridictions, règles fiscales versionnées, conditions d'applicabilité, moteur de calcul, snapshots fiscaux immuables et preuves de sources.

## Architecture

- `schemas/` : validation des filtres et contrats d'entrée.
- `application/` : cas d'usage publics du domaine, dont `listTaxJurisdictions`.
- `repositories/` : accès SQL aux tables fiscales appartenant à M10.
- `engine/` et `services/` : calcul et résolution des règles.
- `routes/` : transport du calcul fiscal pour les intégrations authentifiées.

Le module Platform Admin peut appeler le cas d'usage de consultation des juridictions, mais ne doit ni importer le repository M10 ni exécuter du SQL fiscal.

## Sécurité et conformité

- Les juridictions consultables sont filtrées sur `is_active = true` par la policy RLS existante.
- Le rôle runtime dispose d'un accès SELECT limité ; les rôles navigateur n'accèdent pas directement aux tables.
- Les règles globales et les juridictions ne sont pas modifiables par cette première tranche.
- Une entrée de référentiel ne constitue pas une preuve de conformité légale ou d'applicabilité dans un pays.
- Les règles fiscales absentes, ambiguës, expirées ou non approuvées doivent continuer à échouer de manière sûre.

Le domaine M10 reste en cours de construction et n'est pas déclaré complet.
