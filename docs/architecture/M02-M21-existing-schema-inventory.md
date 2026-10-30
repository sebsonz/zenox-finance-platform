# Inventaire M02 / M21 — schéma et code existants

**Date :** 2026-10-30  
**Branche d'analyse :** `feat/m02-m21-tenant-onboarding-integration-foundation`  
**Nature :** constat documentaire basé sur les migrations et fichiers explicitement consultés; ce n'est pas un audit exhaustif de l'ensemble du dépôt ni une preuve de déploiement distant.

## 1. Données entreprise / tenant

### Existant confirmé — `20261016000100_finance_foundation.sql`

`finance_tenants` contient :
- `id` UUID;
- `tenant_code` unique;
- `legal_name`;
- `country_code` (ISO alpha-2);
- `default_currency` (code alpha-3);
- `status` limité à `PENDING`, `ACTIVE`, `SUSPENDED`, `DISABLED`;
- `created_at`, `updated_at`.

Aucune des migrations tenant consultées ne montre de colonnes dédiées pour nom commercial, adresse légale, fuseau horaire, langues ou identifiants fiscaux. Les recherches ciblées du code indexé n'ont pas trouvé de tables `finance_tenant_profile`, `finance_tenant_address` ou `finance_tenant_tax`. Cela ne prouve pas à lui seul leur absence de tout fichier non indexé; elles doivent être vérifiées par inventaire local complet avant migration.

### Attention — adresses clients ≠ adresse de l'entreprise

La migration `20261029000100_customer_contacts_addresses.sql` crée `finance_customer_addresses`, reliée à `finance_customers` par (tenant_id, customer_id). Elle décrit les adresses des clients du tenant, pas l'adresse légale ou commerciale du tenant. Elle ne doit pas être réutilisée pour le profil de l'entreprise.

## 2. Membres et onboarding

### Existant confirmé — `20261016000700_user_tenant_memberships.sql`

`finance_user_tenant_memberships` contient :
- `tenant_id`;
- `identity_issuer`, `identity_subject`;
- rôles `OWNER`, `ADMIN`, `FINANCE_MANAGER`, `FINANCE_OPERATOR`, `VIEWER`;
- statuts `PENDING`, `ACTIVE`, `SUSPENDED`, `REVOKED`;
- `invited_by`, `activated_at`, timestamps;
- unicité par tenant + issuer + subject.

L'invariant SQL impose `activated_at` lorsque le membership est ACTIVE.

### Code confirmé par recherche

Le code de session et d'intégration appelle `tenantRepository.findActiveById` et `userTenantMembershipRepository.findActiveMembership`. L'extrait consulté établit le contrôle d'accès à un tenant déjà actif. La recherche ciblée n'a pas révélé de parcours complet de création tenant, vérification, premier OWNER et activation. Ne pas conclure à l'absence totale sans revue du dépôt local complet.

## 3. Intégrations machine

### Existant confirmé

- `finance_integration_principals` contient code, nom, hash du secret, scopes, statut, rotation et dernière utilisation.
- `20261016000200_normalize_integration_tenant_grants.sql` crée `finance_integration_tenant_grants`, clé primaire (principal_id, tenant_id), et migre les anciens grants.
- La même migration retire RLS des tables minimales de contrôle et révoque les privilèges PUBLIC; les privilèges backend doivent être explicitement provisionnés.
- Le repository d'authentification agrège les tenant IDs accordés au principal.
- Aucun modèle de référence externe entreprise-consommateur (`external_system` + `external_company_id`) n'a été trouvé dans les recherches ciblées.

**Conséquence :** ne pas recréer la table de grants ni imposer un lien principal-tenant un-à-un. La nouvelle liaison entreprise externe doit rester distincte des credentials et des grants.

## 4. Juridictions et fiscalité

### Existant confirmé — `20261016000400_tax_jurisdictions_and_rules.sql`

`finance_tax_jurisdictions` est un référentiel hiérarchique global :
- code unique, pays, nom, niveau (COUNTRY, STATE, PROVINCE, REGION, CITY, SPECIAL_ZONE);
- `parent_id`, `is_active`, timestamps.

`finance_tax_rules` peut être globale (`tenant_id IS NULL`) ou spécifique à un tenant; les règles ont juridiction, type/treatment, taux, version, période de validité, statut et référence source.

La migration ne crée pas de table d'association d'applicabilité tenant-juridiction. La présence d'une juridiction active dans le référentiel ne prouve donc pas qu'elle s'applique à un tenant.

Les snapshots fiscaux peuvent référencer `jurisdiction_id`, mais ils constituent une preuve du calcul d'un document et non un registre de juridictions activées pour l'entreprise.

## 5. Décisions de conception à conserver

1. Créer un modèle distinct de profil légal/commercial du tenant, sans détourner les adresses clients.
2. Modéliser les identifiants fiscaux/réglementaires comme des données typées, pays-dépendantes et protégées; ne pas supposer un identifiant fiscal unique universel.
3. Ajouter une association tenant-juridiction datée et traçable; plusieurs juridictions par tenant sont possibles.
4. Ajouter la référence externe entreprise-consommateur séparément des grants machine.
5. Conserver les statuts et rôles existants; aucune migration ne doit redéfinir implicitement leur sémantique.
6. Créer le tenant et le premier OWNER dans une transaction atomique; identité du propriétaire dérivée de la session vérifiée côté serveur.
7. Distinguer strictement privilège plateforme et rôle ADMIN d'un tenant.

## 6. Vérifications restantes avant migration

- Obtenir un listing exhaustif de `supabase/migrations` sur la branche et parcourir toutes les migrations, y compris celles postérieures à M04.
- Rechercher dans tout `backend/src` et `tests` les use cases d'onboarding, invitations, plateforme, profil tenant et audit.
- Vérifier la structure de `finance_audit_events`, les rôles PostgreSQL runtime et les grants de contrôle.
- Fixer les cardinalités des références externes par système consommateur.
- Définir les preuves de vérification, acteurs autorisés, transitions et règles de réactivation.
- Vérifier les protections CSRF/origin avant d'ajouter de nouvelles routes d'écriture utilisateur.

## 7. Limites

Les résultats de recherche de code GitHub sont indexés sur la branche par défaut, tandis que les fichiers de migration explicitement récupérés ont été lus sur la branche de travail. Cet inventaire ne remplace pas une vérification locale complète du HEAD courant. Aucun schéma n'a été appliqué à Supabase distant et aucun changement de base n'a été effectué.
