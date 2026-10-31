# Compliance — exigences d’inscription

## Périmètre livré dans cette tranche

Le module expose la lecture des exigences réglementaires de création d’organisation à partir d’un registre versionné et juridictionnel.

- Migration : `20261031000400_registration_jurisdiction_requirements.sql`.
- Table : `finance_registration_requirements`.
- Fonction de lecture : `finance_list_registration_requirements(...)`.
- Service : `registration-requirements.service.ts`.
- Route authentifiée : `GET /api/v1/user/registration/requirements/:countryCode?legalForm=...` (le préfixe global dépend du montage de l’application).
- Seules les entrées `APPROVED`, datées et dont la source a été vérifiée sont retournées.
- L’API renvoie `NO_APPROVED_CONFIGURATION` lorsqu’aucune entrée approuvée ne s’applique.

## Gouvernance et limites

Aucune exigence légale n’est préchargée par cette migration. Une entrée ne doit pas être présentée comme une obligation légale avant vérification de sa source primaire, revue et approbation explicites. L’absence de configuration ne signifie jamais qu’aucune formalité n’est requise.

Cette tranche ne comprend pas encore :
- l’interface opérateur de création, revue, approbation, retrait et historisation des exigences ;
- les permissions fines et événements d’audit de cette gouvernance ;
- l’alimentation vérifiée des juridictions et formes juridiques ;
- l’intégration complète de la liste dans l’assistant frontend d’inscription ;
- les tests PostgreSQL et tests API dédiés.

## Sécurité

La table n’accorde aucun accès direct aux rôles applicatifs ou navigateur. La lecture publique applicative passe par la fonction SQL dédiée, avec privilèges d’exécution limités. Les routes exigent une session authentifiée et une adresse e-mail confirmée. Les réponses sont marquées `no-store`.

## Statut

Fondation backend et migration préparées sur la branche de travail. Non déployé. Aucune migration Supabase distante n’a été exécutée. Ne pas considérer le module M22 comme fonctionnellement terminé tant que la gouvernance opérateur, l’intégration frontend et les tests ne sont pas validés.
