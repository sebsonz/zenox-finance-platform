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


## 8. Complément après exploration exhaustive de l'arborescence (2026-10-30)

L'exploration du contenu GitHub de `supabase/migrations` sur la branche de travail a retourné **22 migrations**. Elle a révélé deux migrations M02 déjà présentes, qui n'avaient pas été identifiées lors des premières recherches ciblées :

- `20261024000100_tenant_registration_onboarding.sql`
- `20261024000200_platform_registration_review.sql`

### Onboarding M02 déjà implémenté

La première migration crée `finance_registration_requests` et trois fonctions SECURITY DEFINER :
- `finance_submit_organization_registration` : crée atomiquement le tenant PENDING, le membership OWNER PENDING, la demande et l'événement d'audit;
- `finance_list_my_registration_requests` : liste les demandes de l'identité;
- `finance_get_my_registration_request` : lit une demande appartenant à l'identité.

Le routeur utilisateur est présent dans `backend/src/modules/registration/routes/registration.routes.ts`, monté sous `/api/v1/user/registration`. Il exige une session utilisateur, une adresse e-mail confirmée, un POST same-origin et un corps strict. L'issuer et le subject sont pris dans `req.financeUser`, pas dans le corps. La devise est validée par le référentiel M06.

La seconde migration crée `finance_platform_operators` (rôle PLATFORM_ADMIN), et les fonctions :
- `finance_is_active_platform_operator`;
- `finance_list_pending_registration_requests`;
- `finance_review_registration_request`.

La revue est atomique : approbation active le tenant et son OWNER; rejet désactive le tenant et révoque le membership OWNER. L'auto-examen est refusé. Les routes sont dans `backend/src/modules/registration/routes/platform-registration.routes.ts`, montées sous `/api/v1/user/platform`. Les identités d'opérateur sont dérivées de la session vérifiée. Les tests unitaires et tests PostgreSQL jetables correspondants existent :
- `backend/tests/unit/registration.routes.test.ts`;
- `backend/tests/unit/platform-registration.routes.test.ts`;
- `backend/tests/integration/registration.postgres.test.ts`;
- `backend/tests/integration/platform-registration-review.postgres.test.ts`.

### Modules présents mais squelettes

Les dossiers `backend/src/modules/onboarding` et `backend/src/modules/platform-admin` contiennent actuellement des README de squelette et des répertoires vides. L'implémentation d'inscription/revue est logée dans `modules/registration`, et non dans ces deux modules. Ne pas dupliquer ces flux sans décision de refactorisation.

### Modèle d'entreprise encore incomplet

Les deux migrations d'inscription ne stockent que le nom légal, le pays et la devise par défaut dans le tenant et la demande. Elles ne couvrent pas le profil légal/commercial complet attendu : adresse propre du tenant, nom commercial, fuseau horaire, langues, identifiants fiscaux typés. Aucun modèle d'association tenant-juridiction ni de référence externe entreprise-consommateur n'apparaît dans les 22 migrations listées.

### Sécurité et documentation

Les routes d'inscription et de revue imposent un contrôle d'origine same-origin sur les POST. Cela constitue un contrôle présent, mais ne remplace pas une revue complète CSRF/session/proxy/rate-limit. Le document `WEB_API_SECURITY_BOUNDARY.md` est obsolète lorsqu'il affirme que le workspace M04 est entièrement en lecture seule : les routes M04 de mutation existent sur la branche et doivent être reflétées dans cette documentation.

### Conclusion corrigée

M02 n'est pas à créer de zéro : le parcours initial d'inscription, le premier OWNER en attente, la revue plateforme, l'approbation/rejet transactionnels et les tests associés existent déjà. Le travail restant est une extension et une consolidation ciblées, pas une reconstruction du socle.
