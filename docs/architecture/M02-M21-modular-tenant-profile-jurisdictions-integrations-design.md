# M02 / M21 — Conception modulaire du profil tenant, des juridictions et des références externes

**Date :** 2026-10-30  
**Branche :** `feat/m02-m21-tenant-onboarding-integration-foundation`  
**Statut :** conception détaillée à valider par implémentation et tests PostgreSQL jetables  
**Aucune migration exécutée sur Supabase distant.**

## 1. Objectif et exigences sources

Cette conception étend le socle existant sans reconstruire l'inscription M02 ni mélanger les responsabilités des modules.

Exigences du cahier des charges :
- **ZF-TEN-001** : identité légale/commerciale, adresses, pays, fuseau horaire, langues et identifiants fiscaux.
- **ZF-TEN-003** : une modification du profil ne doit pas altérer les snapshots de documents déjà émis.
- **ZF-TEN-004** : périmètre juridictionnel activé explicite, avec dates et statuts; l'activation est impossible sans critères.
- **ZF-CRM-002** : conserver les références externes sans partager les clés primaires entre systèmes.
- **ZF-IAM-003/004/005** : tenant résolu et autorisations vérifiées côté serveur; isolation inter-tenant.
- **ZF-IAM-007** : les données globales restent sous contrôle des rôles plateforme autorisés.

Le cahier des charges est une cible fonctionnelle et ne certifie ni le code actuel ni une conformité juridique universelle.

## 2. Frontières modulaires non négociables

| Module | Responsabilité | Ne doit pas prendre en charge |
|---|---|---|
| `tenants` | Profil d'entreprise, adresses légales/commerciales, identifiants d'entreprise, lecture/écriture tenant autorisée | Authentification, règles fiscales, API d'intégration |
| `registration` | Soumission d'inscription, statut de demande, orchestration de revue et activation | Persistance métier détaillée du profil, calcul fiscal, mapping d'intégration |
| `tax` / `tax-jurisdictions` | Référentiel juridictionnel, association tenant-juridiction, validation d'applicabilité | Profil commercial, grants API |
| `integrations` | Références externes entreprise-système, contrats API machine et orchestration d'intégration | Identifiants primaires des consommateurs, droits utilisateur |
| `integration-auth` | Authentification du principal, scopes et grants tenant existants | Mapping externe d'entreprise |
| `audit` | Contrat commun d'événement et traçabilité | Règles métier des modules producteurs |

**Règle de dépendance :** les routes appellent des services applicatifs; les services utilisent leurs repositories propres. Un module ne lit ni n'écrit directement les tables d'un autre module via son repository. Les interactions intermodules passent par des contrats applicatifs explicites (interfaces/types/use cases) et une transaction partagée uniquement si le contrat le prévoit.

Les fonctions SQL SECURITY DEFINER existantes de l'inscription restent des frontières DB spécialisées; elles ne deviennent pas un modèle à copier pour toutes les nouvelles opérations.

## 3. Conventions SQL existantes à préserver

L'inventaire des migrations de la branche montre :
- tables dans le schéma `public`, préfixe `finance_`;
- UUID générés par `gen_random_uuid()`;
- timestamps `timestamptz`;
- tables tenant-scoped avec `tenant_id`, RLS activée et forcée;
- politiques utilisant `NULLIF(current_setting('app.tenant_id', true), '')::uuid`;
- clés étrangères composites (par exemple `(tenant_id, customer_id)`) lorsque l'enfant appartient à un parent tenant-scoped;
- privilèges explicites et révocation de `PUBLIC`;
- audit via `finance_audit_events`;
- migrations additives, nommées avec timestamp, testées sur PostgreSQL jetable.

Les nouvelles tables ne doivent pas recevoir de politique permissive par défaut. Les grants du rôle runtime doivent être explicites et justifiés par les routes/services réellement implémentés.

## 4. Modèle cible — module Tenants

### 4.1 `finance_tenant_profiles` (1:1)

Complète `finance_tenants` sans recopier les attributs canoniques déjà stockés dans `finance_tenants`.

Champs proposés :
- `tenant_id` PK/FK vers `finance_tenants(id)`;
- `trade_name` nullable;
- `timezone` (identifiant IANA validé côté application);
- `primary_language` (code BCP 47);
- `supported_languages` (liste de codes BCP 47);
- `website_url` nullable;
- `general_email` nullable;
- `general_phone` nullable;
- `created_at`, `updated_at`.

Les valeurs canoniques restent :
- `legal_name`, `country_code`, `default_currency`, `status` dans `finance_tenants`;
- la devise de référence et les devises document/règlement suivent les contrats M06/Money existants, sans ajout de duplication dans le profil.

Le profil peut être incomplet pendant `PENDING`. Les critères obligatoires dépendent du parcours d'activation et du périmètre réglementaire concerné. Ne pas rendre tous les champs globalement obligatoires par défaut.

### 4.2 `finance_tenant_addresses` (1:N, historique)

Adresse propre à l'entreprise, distincte de `finance_customer_addresses`.

Champs proposés :
- `id`, `tenant_id`;
- `address_type`: `REGISTERED`, `BUSINESS`, `BILLING`, `OTHER`;
- lignes d'adresse, ville, région, code postal, pays;
- `is_primary`, `status` (`ACTIVE`, `ARCHIVED`);
- `valid_from`, `valid_to`;
- `created_at`, `updated_at`.

Contraintes proposées :
- clé composite `UNIQUE (tenant_id, id)`;
- indexes tenant/type/status et validité;
- une seule adresse primaire active par tenant et type via index unique partiel;
- pas de suppression physique dans le parcours normal;
- pas de chevauchement temporel interdit globalement tant que le besoin métier par type n'est pas spécifié.

Une modification d'adresse crée une nouvelle version ou archive l'ancienne; les documents émis conservent leur snapshot. La politique exacte de versionnement devra être reflétée dans le service tenant.

### 4.3 `finance_tenant_identifiers` (1:N, typé et sensible)

Identifiants fiscaux ou réglementaires propres à l'entreprise, sans supposer un identifiant universel.

Champs logiques proposés :
- `id`, `tenant_id`;
- `identifier_type` (code métier contrôlé et extensible);
- `issuing_country_code`;
- `identifier_value` ou représentation protégée;
- `display_value` masquée;
- `status` (`PENDING_VERIFICATION`, `VERIFIED`, `REJECTED`, `EXPIRED`, `REVOKED`);
- `valid_from`, `valid_to`;
- source/état de vérification, vérificateur et timestamps;
- références vers justificatifs privés, sans URL publique.

**Point de sécurité bloquant avant migration :** le dépôt ne fournit pas encore de contrat établi de chiffrement applicatif, de gestion de clés et de recherche d'identifiants. Le schéma final ne doit donc pas stocker en clair ces valeurs sensibles par défaut. Il faut décider du chiffrement au repos applicatif, de la gestion/rotation des clés, du fingerprint HMAC pour recherche/déduplication, du masquage et des droits de lecture. Les valeurs complètes ne doivent jamais apparaître dans les logs, l'audit ou les réponses de liste.

L'unicité est dépendante du pays et du type d'identifiant. Aucune contrainte globale `UNIQUE(identifier_value)` n'est acceptable.

## 5. Modèle cible — module Tax / Jurisdictions

### 5.1 `finance_tenant_jurisdictions` (1:N, association datée)

Relie un tenant à une juridiction du référentiel `finance_tax_jurisdictions`. La présence dans le référentiel ne prouve pas l'applicabilité à une entreprise.

Champs proposés :
- `id`, `tenant_id`, `jurisdiction_id`;
- `status`: `PENDING_REVIEW`, `ACTIVE`, `SUSPENDED`, `EXPIRED`, `REVOKED`;
- `valid_from`, `valid_to`;
- `basis_type` / `basis_reference` décrivant le fondement déclaré;
- référence de preuve dans le stockage privé;
- `verified_at`, `verified_by`, `created_at`, `updated_at`.

Contraintes :
- FK tenant et FK juridiction;
- dates cohérentes (`valid_to IS NULL OR valid_to >= valid_from`);
- index tenant/status/validity et jurisdiction/status;
- RLS tenant-scoped avec `FORCE ROW LEVEL SECURITY`;
- audit sur soumission, vérification, activation, suspension et révocation.

Un tenant peut avoir plusieurs juridictions actives simultanément, y compris dans plusieurs pays si son activité le justifie. Ne pas créer de contrainte globale « une juridiction active par tenant ».

Ne pas interdire tous les chevauchements de périodes : des juridictions distinctes peuvent être simultanément applicables. Pour une même paire tenant/juridiction, la règle de non-chevauchement ne sera ajoutée qu'après définition du cycle de renouvellement et de la coexistence des enregistrements. La validation applicative doit empêcher les doublons actifs identiques.

### 5.2 Garde d'activation et moteur fiscal

Une association tenant-juridiction n'autorise pas automatiquement un calcul fiscal. L'utilisation en production exige au minimum :
- association `ACTIVE` et période couvrant la date de l'opération;
- juridiction de référence active;
- règle fiscale publiée/active et applicable à la date;
- critères de validation du pack juridictionnel documentés;
- preuve et statut de vérification lorsque requis.

La vérification de complétude du tenant doit être exposée par un contrat du module Tax à l'orchestrateur `registration`; Registration ne doit pas reproduire les règles fiscales.

## 6. Modèle cible — module Integrations

### 6.1 `finance_tenant_external_references`

Relie un tenant Finance à une entreprise d'un système externe. Cette table n'est ni un principal d'intégration ni un grant d'accès.

Champs proposés :
- `id`, `tenant_id`;
- `external_system_code` (code stable enregistré);
- `external_company_id` (identifiant opaque fourni par le système);
- `status`: `ACTIVE`, `REVOKED`;
- `created_by_type`, `created_by_ref`;
- `created_at`, `updated_at`, `revoked_at`, `revoked_by`;
- métadonnées sûres minimales, sans secret.

Cardinalités retenues pour le modèle initial :
- un tenant peut avoir plusieurs références externes, y compris plusieurs systèmes;
- un système peut identifier plusieurs tenants;
- un même couple système + identifiant entreprise externe ne peut pointer que vers un seul tenant Finance à la fois;
- plusieurs identifiants externes du même système pour un tenant sont permis (cas de filiales/établissements), sauf décision métier ultérieure de restriction.

Index unique partiel proposé sur `(external_system_code, external_company_id)` lorsque `status = 'ACTIVE'`, avec index de recherche `(tenant_id, external_system_code, status)`.

La révocation conserve l'historique. Une réassociation après révocation doit être explicite, auditée et contrôlée contre les collisions historiques selon la politique de réutilisation des IDs du système source.

### 6.2 Séparation stricte de l'autorisation machine

Le contrôle API continue d'exiger :
1. principal actif et secret valide;
2. scope requis;
3. grant explicite principal-tenant existant;
4. tenant actif.

La référence externe sert à résoudre/rapprocher une entreprise externe après authentification; elle ne crée aucun principal, ne donne aucun scope, ne crée aucun grant et ne remplace jamais `tenant_id` interne. Le header tenant reste une sélection vérifiée par le middleware et les grants.

## 7. Contrats intermodules et flux

### Flux d'inscription / revue
1. `registration` conserve les fonctions d'inscription et de revue déjà existantes.
2. Le parcours enrichi appelle le service applicatif `tenants` pour créer/mettre à jour le profil et les adresses.
3. Les identifiants fiscaux sont traités par le service dédié du module `tenants` avec ses contrôles de sécurité.
4. Le module `tax` expose un use case de contrôle de complétude juridictionnelle.
5. L'orchestrateur `registration` décide si la demande peut être soumise/validée selon le résultat, sans accéder aux tables internes de ces modules.
6. L'activation reste atomique et auditée; le comportement existant doit être étendu sans régression.

**Important :** la revue plateforme actuelle active le tenant et l'OWNER directement dans une fonction SQL. Avant de rendre les critères de complétude bloquants, cette fonction et son contrat doivent être étendus de façon atomique; ajouter un contrôle uniquement dans l'interface ou dans une route ne suffit pas.

### Flux d'intégration machine
1. `integration-auth` authentifie le principal et vérifie scopes/grants.
2. `integrations` résout la référence externe au moyen d'un service/repository propriétaire.
3. Les use cases métier ciblés appellent leurs propres modules par contrats explicites.
4. Les identifiants internes Finance restent internes; les réponses exposent uniquement les identifiants externes prévus par le contrat API.

## 8. Audit, confidentialité et autorisations

- Les mutations doivent produire un événement d'audit dans la même transaction que la mutation métier lorsque possible.
- Utiliser `finance_audit_events` et son vocabulaire existant; ne pas créer une table d'audit parallèle par module.
- `safe_metadata` contient des codes, états et identifiants non sensibles; jamais de valeur fiscale complète, secret, justificatif ou payload confidentiel.
- Acteurs utilisateur, plateforme et machine sont distingués; leur identité vient du contexte authentifié côté serveur.
- Les rôles tenant ne sont pas des rôles plateforme.
- Les lectures de profil, adresse, identifiants et juridictions appliquent le membership actif et les permissions serveur.
- Les opérations de vérification/activation globale exigent un opérateur plateforme autorisé.
- Les routes navigateur restent sous la frontière session/same-origin et doivent être couvertes par la revue CSRF/session/proxy/rate-limit déjà ouverte.
- Les routes machine restent séparées des routes utilisateur.

## 9. Plan d'implémentation modulaire

1. **Tenants — domaine et contrats** : types, schémas de validation, service et repository de profil/adresses.
2. **Sécurité identifiants** : décision chiffrement/keys/HMAC et tests avant persistance des valeurs.
3. **Tax — juridictions** : domaine, service de liaison, repository, règles de validité et preuve.
4. **Integrations — références externes** : domaine, repository, service et contrôles de collision.
5. **Registration — orchestration** : extension du flux existant via contrats, sans déplacer les routes ni dupliquer l'onboarding.
6. **API/OpenAPI** : endpoints par module, versionnés, avec scopes/permissions et erreurs stables.
7. **Tests** : unitaires par module, PostgreSQL jetable pour contraintes/RLS/transactions/concurrence, tests d'intégration intermodules.
8. **Documentation** : architecture, contrats, matrice permissions, procédures de vérification.

Aucun module ne sera déclaré terminé sur la seule présence de tables : services, repositories, routes/contrats, tests, audit et documentation doivent être cohérents.

## 10. Matrice minimale de tests

| Domaine | Cas indispensables |
|---|---|
| Profil tenant | création, mise à jour, champs invalides, tenant PENDING, isolation inter-tenant |
| Adresses | primaire unique par type, archivage/version, dates, FK tenant composite |
| Identifiants | masquage, chiffrement, absence dans logs/audit, accès autorisé/refusé, collision type/pays |
| Juridictions | plusieurs juridictions, dates actives/expirées, suspension/révocation, mauvaise juridiction, preuves, absence d'activation sans critères |
| Références externes | unicité active par système/ID, plusieurs références par tenant, collision inter-tenant, révocation, réassociation contrôlée |
| Intégration | principal sans grant refusé, scope manquant refusé, référence externe seule sans accès, tenant suspendu refusé |
| Audit | événement créé dans la transaction, rollback sans mutation partielle, acteur serveur |
| RLS | rôle runtime réel, contexte absent, contexte tenant A lisant tenant B, écritures croisées refusées |
| Snapshots | changement de profil/adresse après émission sans modification du document émis |

## 11. Points bloquants à trancher avant migration SQL

1. Contrat de chiffrement et gestion de clés pour les identifiants fiscaux/réglementaires.
2. Référentiel contrôlé des types d'identifiants et règles de validation par pays.
3. Liste des champs et preuves obligatoires par périmètre juridictionnel avant activation.
4. Politique de réutilisation d'un identifiant externe après révocation.
5. Contrat applicatif exact entre Registration et Tenants/Tax, en particulier pour garder la revue atomique.
6. Inventaire des rôles runtime et des grants SQL effectifs sur l'environnement de test.

Tant que ces points ne sont pas résolus, aucune migration persistante ne doit être générée ou appliquée. La prochaine étape est de traduire cette conception en contrats/types par module et en tests de domaine, puis de préparer les migrations additives une fois les décisions de sécurité fermées.
