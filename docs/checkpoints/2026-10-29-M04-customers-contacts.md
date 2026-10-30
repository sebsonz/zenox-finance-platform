# M04 — Clients et contacts

**Statut :** en cours — backend validé par CI sur un SHA antérieur, frontend lecture seule ajouté, validation CI des derniers commits documentaires en attente  
**Branche :** `feat/m04-customers-contacts`  
**PR :** #21 — ouverte, brouillon, non fusionnée  
**Base :** commit M03 validé en CI `149de0735e5b02a0dc0c0dfbe1252be86e2c5ce5`  
**Dernier SHA connu lors de la mise à jour :** `6afa78dc634cd0b58fb5579e3e474e4085f1863d`  
**Architecture de référence :** `docs/architecture/2026-10-29-complete-modular-architecture-fr.md`

## Objectif du module

Fournir un répertoire client tenant-scoped exploitable par les modules suivants, sans dupliquer les données ni contourner M03.

## État backend

- Migration additive `20261029000100_customer_contacts_addresses.sql` pour contacts/adresses, RLS + FORCE RLS, policies tenant-scoped, clés étrangères composites et index de relation primaire.
- Services et repositories clients, contacts et adresses.
- API machine d'intégration avec scopes explicites pour création, lecture, mise à jour et archivage selon les routes déjà présentes.
- Recherche et pagination bornées, validation Zod stricte, transactions tenant-scoped.
- Adaptateur utilisateur en lecture seule : session vérifiée, appartenance active, permission `customers:read`, tenant actif, contexte tenant construit côté serveur.
- Tests unitaires et PostgreSQL cross-tenant sur base jetable.

## État frontend

Le workspace `frontend/src/features/customers/CustomersWorkspace.tsx` est connecté au shell existant et à la route `/customers`.

- Liste des clients actifs et recherche par nom/code.
- Détail client, contacts et adresses.
- Utilise la session et le tenant actif déjà chargés par `App.tsx`.
- Requêtes same-origin, cookies de session, cache désactivé.
- Aucun endpoint d'écriture utilisateur exposé dans l'interface.
- Test de navigation dédié ajouté.

## Preuve CI connue

Le SHA `836e7af0928b3a7fadcb833a87aead66b13e22d1` a passé le workflow CI #40977038471 avec succès le 2026-10-30. Les étapes backend (typecheck/build, migrations PostgreSQL jetables, rôle least-privilege, checksum, tests unitaires et intégration) et frontend (installation, typecheck, tests navigation/auth API, build) étaient toutes vertes.

**Important :** des commits de documentation et de test de navigation ont été ajoutés après ce SHA. Leur CI doit être vérifiée sur le dernier SHA avant toute déclaration de validation finale M04.

## Garde-fous et limites

- Ne pas modifier les migrations historiques; toute évolution de schéma se fait dans une nouvelle migration.
- Ne pas exécuter de migration contre Supabase distant sans accord explicite.
- Ne pas fusionner la PR #21 sans accord explicite.
- Préserver M01–M03 et leurs contrats.
- M06 (devises) reste propriétaire des données de devise.
- Aucune suppression physique de client.
- L'adaptateur M04 est in-process : il appelle les services applicatifs publics avec un contexte tenant fiable; il n'appelle pas l'API d'intégration par HTTP et ne fabrique pas d'identité machine.
- Les écritures via session utilisateur restent désactivées jusqu'à définition de l'acteur métier, de l'audit, de la protection CSRF/origine et des contrôles opérationnels.
- La tranche est non-production. Pas d'autorisation de déploiement ni de migration distante.

## Checklist de clôture

- [x] CRUD client et CRUD relations via API machine d'intégration.
- [x] RLS/FORCE RLS, clés étrangères composites et grants runtime limités.
- [x] Tests PostgreSQL cross-tenant sur environnement jetable.
- [x] Adaptateur utilisateur lecture seule et contrôles d'accès tenant.
- [x] Interface frontend lecture seule Clients raccordée.
- [x] CI verte sur SHA `836e7af0928b3a7fadcb833a87aead66b13e22d1`.
- [ ] CI verte sur le dernier SHA après les mises à jour documentaires.
- [ ] Tests frontend dédiés aux états de chargement, erreurs, liste et fiche client.
- [ ] Test manuel local avec une session utilisateur et un tenant de test.
- [ ] Revue sécurité refresh/révocation, CSRF/origine, rate limits et déploiement.
- [ ] Conception acteur/audit et routes d'écriture utilisateur.
- [ ] Import local groupé en fin de module; migration distante séparée et soumise à autorisation.
