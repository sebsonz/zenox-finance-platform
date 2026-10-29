# M04 — Clients et contacts

**Statut :** en cours  
**Branche :** `feat/m04-customers-contacts`  
**Base :** commit M03 validé en CI `149de0735e5b02a0dc0c0dfbe1252be86e2c5ce5`  
**Référence :** `docs/architecture/2026-10-29-complete-modular-architecture-fr.md`

## Objectif du module

Fournir un répertoire client tenant-scoped exploitable par les modules suivants, sans dupliquer les données ni contourner M03.

## Périmètre d'acceptation

- Créer, consulter, modifier et archiver un client sans suppression destructive.
- Gérer les contacts d'un client et ses adresses (facturation, livraison, siège/autre).
- Conserver les identifiants externes par tenant et détecter les collisions.
- Rechercher et paginer de manière bornée et déterministe.
- Valider strictement les entrées/sorties; refuser les champs inconnus et les identifiants tenant fournis par le client.
- Toutes les lectures/écritures sont réalisées dans une transaction avec le contexte tenant vérifié de M03.
- RLS activée et forcée sur toute nouvelle table tenant-scoped, avec tests négatifs cross-tenant.
- Autorisations service-to-service par scopes explicites et erreurs contractuelles stables.
- Tests unitaires, intégration PostgreSQL jetable, CI verte sur le SHA exact et documentation API mise à jour.

## Garde-fous

- Ne pas modifier les migrations historiques; toute évolution de schéma se fait dans une nouvelle migration.
- Ne pas exécuter de migration contre Supabase distant sans accord explicite.
- Ne pas fusionner de PR sans accord explicite.
- Préserver les modules M01–M03 et leurs contrats.
- M06 (devises) reste propriétaire des données de devise; M04 ne modifie pas leur référence.
- Aucune suppression physique de client : archivage explicite et règles de dépendance à valider avant tout changement d'état.

## État initial connu

Le dépôt contient déjà un premier vertical slice client (création, liste, détail), un schéma de base `finance_customers`, et des tests de validation/RLS. Cette tranche initiale ne couvre pas encore tout le périmètre M04, notamment contacts, adresses, mise à jour et archivage API.

## Checklist de clôture

- [x] Création, liste, détail, mise à jour partielle et archivage client implémentés/documentés (tests ciblés à compléter)
- [x] Tables tenant-scoped, création et liste paginée des contacts/adresses implémentées/documentées (tests API ciblés et mise à jour/archivage des relations à compléter)
- [x] RLS/FORCE RLS, clés étrangères composites et grants runtime limités ajoutés (preuve CI encore attendue)
- [x] Test PostgreSQL cross-tenant / absence de contexte ajouté pour contacts/adresses (preuve CI encore attendue)
- [ ] CI verte sur SHA final
- [ ] Checkpoint mis à jour avec preuves et limites connues
- [ ] Import local groupé en fin de module; migration distante séparée et soumise à autorisation
