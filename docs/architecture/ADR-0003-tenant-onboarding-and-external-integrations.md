# ADR-0003 — Onboarding des tenants et intégrations multi-systèmes

**Statut :** contrat de conception retenu pour implémentation progressive; aucune migration ni activation distante autorisée par ce document.  
**Date :** 2026-10-30  
**Périmètre :** M02 — Onboarding et tenants; M21 — API et intégrations; dépendances M01, M03, audit et M22.

## 1. Contexte vérifié

Le cahier des charges ZENOX Finance définit une plateforme financière autonome, internationale et multi-tenant. Finance reste la source de vérité de ses données financières; ZENOX FRET est son premier consommateur, sans accès direct aux tables Finance.

Le schéma actuel fournit déjà :
- `finance_tenants` avec `tenant_code`, `legal_name`, `country_code`, `default_currency` et les statuts `PENDING`, `ACTIVE`, `SUSPENDED`, `DISABLED`;
- `finance_user_tenant_memberships` avec les rôles `OWNER`, `ADMIN`, `FINANCE_MANAGER`, `FINANCE_OPERATOR`, `VIEWER` et les statuts de membership existants;
- des principaux d'intégration authentifiés par client ID + secret hashé + scopes;
- des grants explicites principal-tenant dans la migration de normalisation existante;
- des juridictions de référence et des règles fiscales versionnées.

Le modèle actuel ne suffit pas, à lui seul, à démontrer un parcours complet d'onboarding, une identité légale/commerciale étendue, une association explicite des juridictions actives à un tenant, ni le rapprochement stable d'une entreprise externe avec un tenant Finance.

## 2. Décisions d'architecture

### D1 — Le tenant représente l'espace financier autonome

- Un tenant Finance correspond à l'espace de données et d'autorisation d'une entreprise cliente dans Finance.
- Son pays légal et sa devise par défaut sont des attributs de profil, pas une restriction à une seule juridiction fiscale.
- Les données d'une entreprise restent isolées par tenant dans les services, repositories, contraintes et RLS.
- Les identifiants internes Finance ne sont jamais remplacés par les identifiants des systèmes consommateurs.

### D2 — Création et cycle de vie M02

Le parcours cible est :
1. Une identité utilisateur authentifiée soumet une demande de création.
2. Le backend valide et normalise les données; il ne prend jamais un issuer/subject ou un rôle OWNER depuis le navigateur.
3. Dans une transaction unique, Finance crée le tenant en `PENDING`, crée le premier membership `OWNER` en état `PENDING`, et écrit les événements d'audit nécessaires.
4. Les contrôles de vérification et de complétude sont exécutés avant activation.
5. Une action autorisée de plateforme fait passer le tenant à `ACTIVE` et active le membership initial selon une opération atomique et auditée.
6. Suspension ou désactivation suit une opération de plateforme contrôlée, auditée et réversible uniquement selon une politique explicite.

Les statuts de tenant existants sont conservés. Aucun nouveau statut tenant n'est introduit dans ce périmètre. Les statuts de membership existants sont également conservés. La signification exacte de `DISABLED` par rapport à une fermeture définitive devra être spécifiée dans la politique de rétention et de clôture avant d'implémenter cette action.

### D3 — Profil légal et commercial

Le socle `finance_tenants` ne contient actuellement qu'un sous-ensemble des informations attendues au cahier des charges. Avant migration, le modèle devra couvrir au minimum, selon le périmètre du cahier des charges :
- identité légale et nom commercial;
- adresse légale et coordonnées;
- pays légal, fuseau horaire et langues;
- identifiants fiscaux et autres identifiants réglementaires applicables.

Ne pas ajouter arbitrairement tous ces champs à `finance_tenants`. La conception de persistance devra décider, après inventaire des tables existantes, quelles données appartiennent au profil du tenant, aux adresses ou à des identifiants typés et historisables. Les secrets et pièces justificatives doivent rester dans un stockage privé et ne pas être exposés dans les réponses publiques.

### D4 — Principal d'intégration et grants

- Un principal identifie un logiciel/client intégrateur, pas une entreprise cliente.
- Un principal peut recevoir des grants vers plusieurs tenants.
- Un tenant peut être accessible à plusieurs principaux distincts.
- L'autorisation machine exige simultanément principal actif, secret valide, scope requis, grant explicite vers le tenant demandé et tenant actif.
- Le tenant demandé dans `x-finance-tenant-id` est uniquement une sélection; le grant serveur est la preuve d'autorisation.
- Les secrets ne sont jamais exposés au navigateur, stockés en clair ou inscrits dans les logs.
- Rotation, révocation, moindre privilège, idempotence et corrélation sont obligatoires pour les opérations concernées.

### D5 — Références externes des entreprises (M21)

Une référence externe relie un tenant Finance à une entreprise dans un système consommateur, sans fusionner les identifiants.

Modèle logique proposé :
- `tenant_id` : tenant Finance;
- `external_system` : code stable du système consommateur (ex. ZENOX_FRET);
- `external_company_id` : identifiant de l'entreprise dans ce système;
- état de liaison et métadonnées de création/révocation;
- auteur/acteur de l'opération et horodatages.

Contraintes proposées à confirmer pendant la conception SQL :
- unicité de `(external_system, external_company_id)` pour éviter qu'une même entreprise externe pointe vers plusieurs tenants Finance actifs;
- unicité d'une liaison active `(tenant_id, external_system)`, sauf besoin métier documenté d'associer plusieurs entités externes du même système;
- aucune suppression physique nécessaire pour révoquer une liaison; conserver l'historique/audit.

La création d'une référence externe est une opération de contrôle privilégiée, jamais une auto-déclaration libre depuis une requête publique. Le lien externe ne crée pas automatiquement un principal, un grant, un tenant ou un accès API.

### D6 — Juridictions actives par tenant (M10/M22)

- Les juridictions de référence sont distinctes des juridictions effectivement applicables à un tenant.
- Un tenant peut avoir plusieurs juridictions actives, y compris dans plusieurs pays; ne pas imposer une seule juridiction par tenant.
- L'association doit être datée, traçable et vérifiable : juridiction, statut, période de validité, source/justification, validation et acteur.
- Une juridiction n'est utilisable pour un calcul de production que si son périmètre et les règles correspondantes ont été validés selon la checklist de `INTERNATIONAL_TAX_ENGINE.md`.
- Une association tenant-juridiction ne constitue pas, à elle seule, une preuve de conformité légale ou d'immatriculation fiscale.
- Les chevauchements de périodes et la coexistence de juridictions doivent être explicitement traités; aucune contrainte « une seule juridiction active » n'est posée globalement.

### D7 — Frontières API

Les chemins ci-dessous sont des propositions de contrat, pas des routes déclarées existantes :
- `POST /api/v1/onboarding/tenants` — demande authentifiée de création d'espace;
- `GET /api/v1/user/tenants/:tenantId` — lecture du tenant accessible à l'utilisateur;
- `PATCH /api/v1/user/tenants/:tenantId` — modification des champs autorisés du profil;
- routes plateforme protégées pour vérification, activation, suspension et désactivation;
- routes plateforme protégées pour gérer les principals, scopes, grants et références externes.

Toute route utilisateur vérifie la session, le membership actif, le rôle et le statut du tenant côté serveur. Toute route plateforme vérifie une permission de plateforme distincte. Les routes machine restent séparées des routes de session utilisateur.

Les réponses d'erreur doivent être stables et ne pas divulguer l'existence de tenants non autorisés. Les opérations de création/modification sensibles utilisent validation stricte, correlation ID, audit et idempotence lorsqu'une répétition réseau pourrait créer un doublon.

## 3. Séquence d'implémentation

1. Inventaire des schémas, services, permissions et événements d'audit déjà présents (sans répéter les audits M04 déjà validés).
2. Finalisation du contrat de profil et des invariants de cycle de vie M02.
3. Conception des migrations Finance pour profil, références externes et associations juridictionnelles, avec RLS, privilèges, clés composites, index et stratégie de rétrocompatibilité.
4. Repositories et services transactionnels; aucun SQL dans les handlers.
5. Routes utilisateur, plateforme et machine avec politiques distinctes.
6. Tests PostgreSQL jetable : création atomique, concurrence, isolation cross-tenant, grants, rôles, transitions, révocation, idempotence, audit et périodes juridictionnelles.
7. OpenAPI et documentation d'intégration pour FRET et consommateurs externes.
8. Validation manuelle M02 et revue sécurité avant toute décision de merge.

## 4. Critères d'acceptation minimaux

- Le navigateur ne peut pas choisir l'identité du propriétaire initial ni s'attribuer OWNER.
- La création tenant + premier OWNER est atomique; aucune création partielle ne subsiste en cas d'échec.
- Aucun tenant n'est activé sans vérification et action autorisée.
- Les transitions de cycle de vie sont contrôlées et auditées.
- Un principal peut accéder à plusieurs tenants uniquement via ses grants explicites.
- Un identifiant externe ne peut pas être lié à plusieurs tenants Finance actifs dans le même système.
- Les références externes ne donnent aucun accès sans principal + scope + grant.
- Plusieurs juridictions peuvent être associées au même tenant avec périodes et preuves.
- Aucun calcul fiscal n'utilise une juridiction simplement parce qu'elle existe dans la table de référence.
- Les tests prouvent l'isolation tenant avec les rôles PostgreSQL réellement utilisés par le backend.
- Les migrations sont exécutées uniquement sur PostgreSQL jetable en CI jusqu'à approbation distincte.

## 5. Hors périmètre et garde-fous

- Aucune migration sur Supabase distant.
- Aucun accès ni changement sur `zenoxfret_v2`.
- Aucun merge de PR #21 ou de cette branche sans approbation explicite.
- Aucun déploiement ou changement de production.
- Pas de promesse de conformité fiscale universelle.
- Pas de création automatique d'entreprise Finance à partir d'un identifiant envoyé par FRET.
- Pas de liaison automatique entre principal et tenant en relation un-à-un.
- Ce document ne prétend pas que les routes ou tables proposées existent déjà.

## 6. Points à résoudre avant la migration

1. Inventorier le modèle d'adresse/profil et les éventuels identifiants légaux déjà présents dans toutes les migrations, pas seulement la fondation.
2. Définir les rôles et autorisations de plateforme réellement implémentés; ne pas assimiler ADMIN tenant à administrateur plateforme.
3. Fixer la politique de vérification et les preuves requises avant activation, par pays/périmètre.
4. Définir les événements d'audit et la politique d'idempotence des transitions.
5. Confirmer si un tenant peut avoir plusieurs entités externes dans le même système consommateur; ajuster la contrainte d'unicité en conséquence.
6. Définir le cycle de vie/révocation d'une association tenant-juridiction et la gestion des périodes qui se chevauchent.
7. Harmoniser `WEB_API_SECURITY_BOUNDARY.md` avec les routes d'écriture utilisateur M04 déjà livrées et documenter les contrôles CSRF/origin encore requis avant activation de nouveaux parcours d'écriture.
