# M04 — Clients et contacts

Le module possède un premier parcours client (création, liste paginée, détail) et expose désormais les contacts et adresses du client via l'API v1.

## Responsabilités

- Répertoire client tenant-scoped et identifiants externes uniques dans le tenant.
- Validation stricte des payloads et recherche paginée bornée.
- Contacts de client : création et liste paginée, types GENERAL/BILLING/TECHNICAL/LEGAL/OTHER.
- Adresses de client : création et liste paginée, types REGISTERED/BILLING/SHIPPING/OTHER.
- Contrats HTTP et persistance dans les frontières du module clients.
- Les devises restent propriétaires du module M06 et sont lues via son repository.

## Sécurité et persistance

- Le tenant provient exclusivement du contexte d'authentification d'intégration validé par M03.
- Les opérations relationnelles utilisent withTenantTransaction.
- finance_customer_contacts et finance_customer_addresses ont ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY et une policy tenant-scoped.
- Les clés étrangères composites (tenant_id, customer_id) interdisent d'attacher une relation au client d'un autre tenant.
- Les accès runtime sont provisionnés explicitement dans la préparation de la base d'intégration jetable.
- Pas de suppression physique d'un client ni de migration distante automatique.

## Endpoints

- POST /api/v1/customers — customer:write
- GET /api/v1/customers — customer:read
- GET /api/v1/customers/:customerId — customer:read
- POST /api/v1/customers/:customerId/contacts — customer:write
- GET /api/v1/customers/:customerId/contacts — customer:read
- POST /api/v1/customers/:customerId/addresses — customer:write
- GET /api/v1/customers/:customerId/addresses — customer:read

## Statut M04

En cours. La gestion des contacts et adresses a été ajoutée au backend; restent notamment les opérations de mise à jour/archivage client et relations, les tests API ciblés, l'interface frontend et la validation CI finale. Voir docs/checkpoints/2026-10-29-M04-customers-contacts.md.
