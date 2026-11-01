# M02 — Onboarding des organisations

**Statut :** implémentation initiale en cours sur `feat/m02-complete-organization-onboarding`. Ne pas déclarer le module complet avant CI verte et validation PostgreSQL sur une base jetable.

## Responsabilités

M02 possède le parcours d'inscription d'une organisation : brouillon, reprise, validation de saisie, consentements, soumission et suivi de la demande. Il ne possède ni l'identité utilisateur (M01), ni le référentiel officiel du tenant (M03), ni les fichiers (M11), ni les règles de conformité (M22), ni les décisions d'administration plateforme (M20).

## Parcours actuellement implémenté dans cette branche

1. L'utilisateur authentifié et confirmé crée ou reprend un brouillon.
2. Les données de l'organisation, de l'adresse, du représentant et des contacts sont validées côté API avec Zod.
3. Les brouillons sont stockés dans `finance_registration_drafts`, sans créer de tenant.
4. L'utilisateur accepte séparément une version des conditions et une version de la politique de confidentialité.
5. La soumission appelle une fonction SQL transactionnelle qui réutilise `finance_submit_organization_registration` : tenant PENDING, membership OWNER PENDING, demande PENDING, audit existant et conservation du payload déclaré.
6. La soumission répétée du même brouillon retourne la demande initiale.
7. Lors de l'approbation M20, un déclencheur transactionnel appelle la frontière de persistance M03 pour matérialiser le profil et l'adresse déclarés dans les tables canoniques du tenant.

## Contrats HTTP

Sous `/api/v1/user/registration` :

- `GET /drafts/current` : reprendre le brouillon courant.
- `POST /drafts` : créer ou sauvegarder le brouillon courant.
- `GET /drafts/:draftId` : lire un brouillon appartenant à l'identité.
- `PATCH /drafts/:draftId` : modifier un brouillon appartenant à l'identité.
- `POST /drafts/:draftId/submit` : soumettre avec les deux consentements.
- `GET /requests` : lister les demandes soumises.

Les anciennes routes `/organizations` et les fonctions SQL existantes restent en place pour compatibilité.

## Sécurité et données

- Le sujet et l'émetteur d'identité proviennent exclusivement du contexte authentifié serveur.
- Les écritures HTTP exigent une origine identique.
- Les brouillons ne sont accessibles que par des fonctions SQL SECURITY DEFINER étroitement limitées.
- Les tables privées ont RLS ENABLE et FORCE ; les rôles navigateur n'ont aucun accès direct.
- Le payload ne collecte pas de numéro fiscal brut. Les identifiants fiscaux/réglementaires sont exclus jusqu'à l'intégration du chiffrement et de l'empreinte HMAC définis par M03.
- Le transfert M03 du profil général et de l'adresse à l'approbation est implémenté par la migration `20261031000200_registration_approval_tenant_profile_handoff.sql` ; il reste à valider sur PostgreSQL jetable.
- Les pièces justificatives M11 disposent d'un stockage privé Supabase, de fonctions SQL à périmètre limité, d'une vérification de signature, d'une interface de dépôt candidat et de routes de revue opérateur M20. Antivirus, rétention, audit formel et tests Storage réels restent à faire.
- M22 fournit un registre versionné et une route de lecture des exigences approuvées par juridiction et forme juridique. Aucune exigence n'est préchargée ; l'absence de configuration n'est jamais présentée comme une absence d'obligation. La gouvernance opérateur et la validation juridique restent à faire.

## Migration

`20261031000100_registration_drafts_and_extended_profile.sql` et `20261031000200_registration_approval_tenant_profile_handoff.sql` sont additives et destinées uniquement à la base ZENOX Finance. Elles n'ont pas été exécutées sur Supabase distant. Elles doivent être appliquées et testées uniquement sur PostgreSQL jetable pendant la validation locale/CI.

## Tests et critères de complétude

- Unitaires : validation stricte, consentements, transitions et autorisations HTTP.
- PostgreSQL jetable : création, reprise, modification, isolation d'identité, soumission, idempotence et conservation du payload.
- Régression : conserver les tests des anciennes routes et de la revue plateforme.
- Frontend : parcours multiétape, erreurs, reprise, validations HTML et consentements séparés.
- CI : backend typecheck/build, migrations, drift-check, tests et frontend typecheck/build.

**Non terminé tant que** les migrations n'ont pas passé PostgreSQL jetable, que la CI n'est pas verte, que les tests Storage réels et antivirus/rétention ne sont pas traités, que l'interface opérateur M20 n'est pas raccordée et que la gouvernance réglementaire M22 n'est pas validée. Aucune migration distante ni aucun merge sans accord explicite.
