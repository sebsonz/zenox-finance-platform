# ZENOX Finance — checkpoint M02 Onboarding
Date: 2026-10-31
Branch: `feat/m02-complete-organization-onboarding`
Base: `feat/m02-m21-tenant-onboarding-integration-foundation`
Current branch HEAD at checkpoint creation: `ebc2101c7c34ef20865330d62806140543f359d9`

## Objectif
Construire le parcours d'inscription des organisations dans GitHub avant import dans le workspace local, sans créer de dossier de travail parallèle. Une fonctionnalité ne sera déclarée terminée qu'après implémentation complète, tests sur PostgreSQL jetable, CI verte et revue des frontières modulaires.

## Changements présents dans cette branche
- Migration additive Finance-only `20261031000100_registration_drafts_and_extended_profile.sql`.
- Table privée `finance_registration_drafts`, RLS ENABLE/FORCE et accès par fonctions SQL SECURITY DEFINER.
- Brouillon sans tenant, sauvegarde/reprise, modification identity-scoped et soumission idempotente.
- Conservation du payload déclaré dans `finance_registration_requests.registration_data`.
- Consentement distinct aux conditions et à la politique de confidentialité.
- Backend M02 : types métier, transitions, schéma Zod, repository, service et routes.
- Routes montées sous `/api/v1/user/registration`, sans retirer les routes d'inscription historiques.
- Frontend M02 : assistant multiétape intégré dans `RegistrationWorkspace`, sauvegarde automatique et reprise du brouillon.
- Tests unitaires de schéma/transitions et routes, test PostgreSQL du cycle draft.
- Script de préparation du rôle runtime de test étendu aux nouvelles fonctions.
- Workflow CI configuré pour cette branche et la branche d'intégration.

## Protection
- Aucun SQL n'a été exécuté sur Supabase distant.
- Aucune migration n'a été appliquée à une base persistante.
- PR #14 reste ouverte, DRAFT et non fusionnée.
- Aucune modification de ZENOX FRET V2.
- Aucun import local, aucune modification de fichiers locaux.

## Validation non encore acquise
Les tests n'ont pas été exécutés dans un runtime local/CI depuis cette série de commits. Ne pas présenter cette branche comme validée ou M02 terminé avant :
1. backend typecheck et build ;
2. migrations complètes sur PostgreSQL jetable ;
3. db:test:prepare et db:drift-check ;
4. tests unitaires et PostgreSQL ;
5. frontend typecheck et build ;
6. tests navigateur responsive/accessibilité ;
7. revue des permissions et isolation.

## Travaux restant nécessaires avant clôture M02
- Vérifier et corriger les éventuels défauts SQL/TypeScript révélés par la CI.
- Étendre les tests de sécurité : accès direct interdit à la table draft, identité étrangère, conflit de demande déjà soumise, retries concurrents.
- Intégrer la vérification des exigences M22 sans inventer d'obligations légales.
- Intégrer les documents M11 lorsque leur module est réellement opérationnel ; ne pas simuler le stockage.
- Finaliser le transfert des données d'inscription vers M03 à l'approbation via un contrat applicatif appartenant à M03, sans écriture directe M02/M20 dans ses tables.
- Ajouter l'affichage des informations complètes du dossier dans la revue plateforme.
- Valider les textes légaux des consentements avant tout lancement public.

## Import local ultérieur
Après validation GitHub/CI, récupérer cette branche dans le dossier local existant `D:\Projets\zenox-finance-platform` en préservant le travail local, les stashes et `frontend/tsconfig.tsbuildinfo`. Ne pas créer un dossier local de test parallèle. La migration sera testée uniquement sur PostgreSQL jetable local ; aucun accès à Supabase distant sans accord explicite.
