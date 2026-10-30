# M04 — Clients et contacts

## Responsabilités
- Répertoire client tenant-scoped : création, consultation, recherche, mise à jour et archivage logique.
- Contacts et adresses : création, consultation paginée, mise à jour et archivage logique.
- Références externes client, identifiants métier uniques par tenant et devise par défaut validée par M06.
- Validation stricte des entrées, erreurs métier stables et pagination bornée.
- Contrats API d'intégration et adaptateur utilisateur distincts.

## Architecture
- Routes HTTP : validation et traduction des erreurs; aucune requête SQL.
- Services applicatifs : orchestration, transactions tenant-scoped et règles métier.
- Repositories : SQL paramétré exclusivement dans cette couche.
- M06 reste propriétaire des devises; M04 consomme son contrat de lecture.
- L'adaptateur utilisateur appelle les services M04 in-process; aucune auto-appel HTTP ni fabrication d'identité machine.

## Sécurité
- Tenant déterminé côté serveur après vérification de la session et de l'appartenance ACTIVE.
- Lecture : permission `customers:read`.
- Écriture : permission `customers:manage` (OWNER, ADMIN, FINANCE_MANAGER).
- Acteur USER construit à partir de l'issuer, du subject et de l'identifiant d'appartenance; aucune donnée d'acteur acceptée depuis le navigateur.
- Chaque mutation écrit un événement `finance_audit_events` dans la même transaction que la mutation.
- Les opérations d'intégration restent protégées par les scopes `customer:read` et `customer:write`.
- Contacts/adresses restent liés au client et au tenant par les contraintes composites; RLS + FORCE RLS et politiques tenant-scoped.
- Archivage logique uniquement; pas de suppression physique.

## API utilisateur
Base : `/api/v1/user/tenants/:tenantId/customers`
- `GET /` — liste et recherche.
- `GET /:customerId` — détail.
- `POST /` — création.
- `PATCH /:customerId` — mise à jour.
- `POST /:customerId/archive` — archivage.
- `GET|POST /:customerId/contacts` — liste/création.
- `PATCH /:customerId/contacts/:contactId` — mise à jour.
- `POST /:customerId/contacts/:contactId/archive` — archivage.
- `GET|POST /:customerId/addresses` — liste/création.
- `PATCH /:customerId/addresses/:addressId` — mise à jour.
- `POST /:customerId/addresses/:addressId/archive` — archivage.

## API d'intégration
- `/api/v1/customers` et sous-routes contacts/adresses; authentification service et scopes explicites.
- Les identifiants tenant et principal proviennent du contexte d'authentification vérifié, jamais du corps de requête.

## Limites
- Aucun import/export de masse ni fusion de doublons dans M04.
- Pas de suppression physique.
- Les migrations sont additives et testées sur PostgreSQL jetable; aucune migration Supabase distante n'est autorisée par ce module.
- Les rôles personnalisés configurables ne sont pas créés ici; M04 utilise le modèle de permissions validé du socle.
