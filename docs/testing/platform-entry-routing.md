# Vérification du parcours d’entrée — ZENOX Finance

## Objectif

Un utilisateur connecté sans organisation active doit pouvoir choisir entre l’accès administrateur de la plateforme et la création d’une organisation cliente. L’interface ne confère jamais de rôle.

## Cas d’acceptation

1. **Visiteur non connecté** : l’écran de connexion/inscription s’affiche.
2. **Compte connecté sans rôle plateforme et sans organisation active** : l’écran « Choisissez votre espace » s’affiche. Le formulaire de création d’organisation ne s’ouvre que si l’utilisateur choisit explicitement « Créer une organisation cliente ».
3. **Demande d’accès plateforme par un utilisateur ordinaire** : `GET /api/v1/user/platform/me` renvoie 403; l’interface explique que l’activation nécessite une opération DBA autorisée. Aucun droit n’est accordé et aucune organisation n’est créée.
4. **Opérateur actif et email confirmé** : le contrôle serveur renvoie `isPlatformOperator: true`; l’interface actualise la session d’entrée et ouvre l’espace « Demandes d’inscription ».
5. **Email non confirmé** : le contrôle administrateur est désactivé et l’interface invite à confirmer l’adresse.
6. **Utilisateur client avec organisation active** : le parcours client et la navigation existants restent inchangés; l’option plateforme n’est pas exposée dans la navigation client.
7. **Déconnexion** : le cookie de session est supprimé côté serveur puis l’interface revient au parcours public.
8. **API inaccessible** : un message d’erreur est affiché sans modifier le rôle ni les données.

## Vérifications locales

Depuis la racine du dépôt :

- `npm --prefix backend run typecheck`
- `npm --prefix backend test`
- `npm --prefix frontend run typecheck`
- `npm --prefix frontend run build`

Les tests de base utilisent uniquement PostgreSQL jetable dans CI. Ne pas exécuter les migrations de cette fonctionnalité contre une base persistante pendant la validation de l’interface.

## Sécurité / limites

- La réponse serveur `GET /api/v1/user/platform/me` reste la seule source d’autorisation plateforme.
- Aucun email, rôle fourni par le navigateur, metadata Auth ou bouton ne peut créer/promouvoir un opérateur.
- Le premier opérateur doit être enregistré selon `docs/runbooks/bootstrap-first-platform-operator.md`, après vérification indépendante de l’identité Supabase.
- Ne jamais appliquer cette procédure à `zenoxfret_v2`.
