# M04 — Espace Clients (frontend)

## Fonctionnalités
- Liste des clients actifs, recherche par nom légal/code et consultation du détail.
- Création, modification et archivage logique des clients.
- Consultation, création, modification et archivage des contacts.
- Consultation, création, modification et archivage des adresses.
- Devise par défaut validée par l'API M06; aucun calcul de devise côté navigateur.
- États de chargement, erreurs, absence de données et rafraîchissement après mutation.
- Dialogues responsive; requêtes same-origin, cookies de session et cache désactivé.

## API
Base : `/api/v1/user/tenants/:tenantId/customers`. Voir le README backend M04 pour les routes détaillées.

## Autorisations
- Lecture : `customers:read`.
- Mutations : `customers:manage`; l'autorisation réelle est vérifiée par le backend.
- L'interface ne fait jamais autorité sur le tenant, l'identité ou les permissions.
- Les actions de mutation sont auditées côté serveur.

## Limites
- Pagination initiale de l'interface limitée à 100 entrées; le contrat API conserve une pagination bornée.
- Aucun import/export de masse ni fusion de doublons dans M04.
- Pas de suppression physique.
