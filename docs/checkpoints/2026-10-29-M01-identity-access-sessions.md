# M01 — Identité, accès et sessions

**Branche de travail :** `feat/m01-identity-access-sessions`  
**Base :** `78e53dd2141819402fce5a5257812a7f565a1dda` (`feat/modular-routing-architecture`)  
**Statut :** en cours — ne pas déclarer terminé avant validation CI.

## Acquis conservés

- Authentification des utilisateurs via Supabase Auth, vérifiée côté serveur.
- Session BFF par cookie HttpOnly, SameSite=Lax, avec création et révocation de cookie.
- Routes de session, annuaire des tenants et contrôle d'accès au tenant.
- Modèle de rôles OWNER, ADMIN, FINANCE_MANAGER, FINANCE_OPERATOR et VIEWER.
- Service de permissions serveur et tests unitaires existants.
- Écrans d'inscription/connexion, récupération de compte et point d'entrée de plateforme.
- Authentification service-à-service séparée de l'authentification utilisateur.
- Migrations Finance existantes conservées ; aucune migration distante exécutée.

## Adaptation architecturale commencée

- Extraction des appels API de session depuis `RegistrationWorkspace.tsx` vers `frontend/src/auth/auth-api.ts`.
- Le composant d'inscription réutilise désormais les fonctions partagées au lieu d'héberger la logique de transport.
- Aucun écran existant supprimé et aucun contrat d'API modifié par cette extraction.

## Travail restant avant validation M01

1. Vérifier et compléter les parcours session/expiration/déconnexion et leur couverture de tests.
2. Terminer le contrat de rôles/permissions et les contrôles côté serveur; l'UI ne sert qu'à guider l'utilisateur.
3. Compléter le cycle d'invitation, activation, suspension et révocation des membres, sans exposer de secret d'invitation.
4. Raccorder le shell et la navigation aux capacités de session et au rôle actif, sans considérer les contrôles UI comme une autorisation.
5. Ajouter les tests de sécurité et d'intégration requis; exécuter les migrations uniquement sur PostgreSQL jetable.
6. Exécuter typecheck, build, tests backend, tests PostgreSQL et tests frontend sur le commit final.
7. Mettre à jour ce checkpoint avec le SHA validé et les résultats CI.

## Règles de travail

- Réutiliser le code et les tests existants; ne pas refaire les audits généraux déjà réalisés.
- Fichiers courts, responsabilités séparées, pas de déplacement massif.
- Pas de fusion automatique; pas de migration Supabase distante sans accord explicite.
- M01 n'est terminé qu'après preuve CI verte sur le SHA livré.
