# M04 — Clients et contacts

**Statut :** implémentation fonctionnelle complétée sur la branche; validation CI consolidée en cours sur le SHA courant. Ne pas déclarer production-ready avant revue et tests d'environnement.  
**Branche :** `feat/m04-customers-contacts`  
**PR :** #21 — ouverte, brouillon, non fusionnée  
**Base :** M03 `149de0735e5b02a0dc0c0dfbe1252be86e2c5ce5`  
**Dernier SHA documentaire :** `a48925de07195a71d88f954516e03369bf08b340`  
**Architecture de référence :** `docs/architecture/2026-10-29-complete-modular-architecture-fr.md`

## Périmètre livré

### Backend
- CRUD logique des clients : création, lecture, recherche, mise à jour des champs modifiables et archivage.
- Contacts et adresses : création, lecture paginée, mise à jour et archivage.
- Contrats d'intégration existants conservés avec scopes `customer:read` / `customer:write`.
- Routes utilisateur sous `/api/v1/user/tenants/:tenantId/customers`.
- Tenant issu de l'appartenance ACTIVE vérifiée côté serveur; statut tenant vérifié.
- Permissions `customers:read` et `customers:manage`; la matrice actuelle attribue la gestion à OWNER, ADMIN, FINANCE_MANAGER; FINANCE_OPERATOR peut lire; VIEWER lecture seule.
- Acteur USER dérivé de l'issuer + subject + membership ID, jamais du corps de requête.
- Journalisation de chaque mutation client/contact/adresse dans `finance_audit_events`, dans la même transaction que la mutation.
- M06 demeure propriétaire des devises; la devise par défaut est vérifiée via le repository M06.
- SQL reste dans les repositories; use cases/services restent responsables de l'orchestration transactionnelle.

### Données et sécurité
- Migration contacts/adresses `20261029000100_customer_contacts_addresses.sql` inchangée.
- RLS + FORCE RLS, policies tenant-scoped et clés étrangères composites préservées.
- Pas de suppression physique; archivage logique.
- Pas de migration distante exécutée.

### Frontend
- Workspace connecté à la route `/customers`.
- Liste, recherche, fiche client, contacts et adresses.
- Dialogues responsive pour créer/modifier clients, contacts et adresses.
- Archivage logique pour les trois ressources.
- Affichage des actions de gestion limité aux rôles OWNER, ADMIN, FINANCE_MANAGER; le backend reste l'autorité.
- Requêtes same-origin, cookies de session, cache no-store, états de chargement, erreur et vide.

### Documentation et tests
- README backend et frontend actualisés.
- Contrat API documenté pour session utilisateur et intégration machine.
- Tests de routes couvrant l'accès de gestion OWNER, le refus VIEWER et les lectures tenant-scoped.
- Test de matrice des permissions M04 ajouté.
- Tests unitaires et PostgreSQL cross-tenant antérieurs conservés.

## Validation
- Ancienne validation CI connue : SHA `836e7af0928b3a7fadcb833a87aead66b13e22d1`, workflow #40977038471, succès.
- Cette validation est antérieure aux dernières évolutions.
- Une validation consolidée est déclenchée sur le dernier SHA; son résultat doit être relevé avant de clôturer M04.
- Pas de répétition des tests antérieurs sans modification pertinente; la validation courante doit couvrir le commit exact.

## Garde-fous
- Ne pas fusionner PR #21 sans accord explicite.
- Ne pas appliquer de migration sur Supabase distant sans accord explicite distinct.
- Ne pas toucher à `zenoxfret_v2`.
- Préserver les changements locaux et commits non poussés de l'environnement Windows.
- Aucun déploiement ou changement de production n'est autorisé par ce checkpoint.

## Clôture M04
- [x] API clients, contacts et adresses pour intégrations.
- [x] Adaptateur utilisateur lecture et écriture avec contrôle tenant.
- [x] Permissions de gestion et attribution d'acteur.
- [x] Audit transactionnel des mutations.
- [x] Interface utilisateur de gestion des trois ressources.
- [x] Documentation backend, frontend et API.
- [ ] CI verte sur le dernier SHA après l'ensemble des modifications.
- [ ] Test manuel local du parcours complet avec un tenant de test et des comptes par rôle.
- [ ] Revue finale des critères de sécurité opérationnelle avant merge/déploiement.

**Prochaine action :** terminer la validation CI consolidée, corriger uniquement les écarts révélés, puis présenter le bilan M04 pour revue. Aucun passage à M05 avant cette clôture.
