# ZENOX Finance — checkpoint maître de continuité
Date de mise à jour : 2026-10-19
Dépôt : https://github.com/sebsonz/zenox-finance-platform

## 1. Vision fondatrice — décision à préserver

ZENOX Finance est un **produit SaaS autonome de facturation et de gestion financière, conçu pour les marchés internationaux dès ses fondations**. Ce n'est ni un simple module interne de ZENOX FRET, ni un logiciel destiné à un seul pays ou à une seule entreprise.

Objectifs :
- Permettre à des entreprises indépendantes d'utiliser ZENOX Finance pour créer, émettre, gérer et archiver leurs documents de facturation et leurs opérations financières dans les juridictions prises en charge.
- Être le système de facturation officiel consommé par ZENOX FRET, son premier client interne, au moyen d'une API stable et documentée.
- Garder ZENOX Finance indépendant : son propre dépôt, sa propre base de données, son modèle métier, son moteur fiscal, ses règles de sécurité, ses versions et son cycle de livraison.
- Permettre une montée en couverture de « 10 % à 100 % » sans réécriture du cœur : les 10 % représentent un socle initial cohérent et exploitable, pas une déclaration de conformité à 10 % de tous les pays. Les 100 % doivent être mesurés par des critères de couverture fonctionnelle, juridictionnelle et de validation explicitement définis.
- Prévoir l'actualisation permanente des lois, normes, formats et schémas; les règles et normes doivent être versionnées, datées et traçables.

**Principe non négociable :** l'international est une contrainte de conception dès le départ, pas une extension tardive après un produit national.

## 2. Demande immédiate pour la prochaine conversation

La prochaine étape stratégique convenue est :
1. **Rechercher et vérifier** les standards et obligations applicables à une plateforme internationale de facturation électronique et financière, en distinguant sources officielles, standards techniques, interprétations et points nécessitant un avis juridique local.
2. Rédiger un **MVP complet** et un **cahier des charges fonctionnel, réglementaire et technique complet** de ZENOX Finance, en français, cohérent avec cette vision.
3. Définir le modèle de couverture 10 % → 100 %, les jalons, les critères d'acceptation, les preuves de validation et le mécanisme d'actualisation des règles.
4. Ensuite seulement, auditer le dépôt et les branches existantes pour construire une matrice : déjà implémenté et validé / implémenté mais non vérifié / partiel / absent / exigeant validation externe.
5. Établir la feuille de route de remédiation priorisée et rattacher les travaux existants à ces exigences, sans refaire inutilement les vérifications déjà réussies.
6. Enregistrer les livrables et les résultats dans GitHub, puis mettre à jour le checkpoint avec les preuves et statuts réels.

Ne pas commencer par un nouvel audit technique désordonné ni coder de nouveaux modules avant que le MVP et le cahier des charges soient suffisamment établis et que l'écart soit cartographié. Le cahier des charges doit guider l'audit, et non être rédigé après coup pour justifier le code existant.

## 3. Principes d'architecture cible

### 3.1 Cœur universel
Modèle commun et versionné pour entreprises, utilisateurs, clients, fournisseurs, articles/lignes, factures, avoirs, acomptes, devises, paiements, remboursements, documents, statuts, audit, exports et intégrations.

### 3.2 Moteur fiscal international
Règles versionnées et datées par juridiction, catégories de transactions, statut fiscal des parties, devise, base imposable, exemptions, retenues, acomptes d'impôt et règles de composition. Le moteur doit échouer de manière sûre lorsqu'une règle est absente, ambiguë, périmée ou non validée. Les snapshots liés aux documents émis doivent rester immuables.

Le moteur existant est principalement fondé sur des taxes en pourcentage; ne pas annoncer comme supportés les montants fixes, barèmes, seuils, formules multi-étapes ou scénarios complexes avant implémentation et tests explicites.

### 3.3 Packs de conformité par juridiction
Chaque pack doit gérer les exigences vérifiées du pays/territoire : identifiants, mentions, numérotation, règles fiscales, formats, validations, signature/horodatage si exigés, transmission, accusés/rejets, archivage et délais. Une juridiction n'est déclarée prise en charge que pour un périmètre et une date d'effet précis, avec références officielles et tests.

### 3.4 Standards et connecteurs
Prévoir un moteur de validation de formats versionnés et des adaptateurs pour standards et réseaux (par exemple EN 16931, UBL, Peppol, et systèmes nationaux lorsque pertinents). Produire un document techniquement valide ne signifie pas automatiquement que ZENOX est agréé pour transmettre les factures : les rôles réglementés doivent satisfaire les procédures et autorisations locales. L'architecture doit permettre soit l'intégration à un opérateur agréé, soit la demande d'autorisation propre si cette stratégie est retenue.

### 3.5 SaaS multi-tenant et sécurité
Isolation stricte des tenants, rôles/permissions, journal d'audit, attribution d'acteur, gestion des secrets, chiffrement, sauvegardes/restauration, conservation, gestion des incidents et protection des données. Les règles globales de référence ne doivent pas être modifiables par un tenant ordinaire.

### 3.6 Intégration ZENOX FRET
API stable, versionnée, authentifiée et documentée; idempotence, corrélation, erreurs contractuelles, événements/statuts et stratégie de reprise. Finance demeure la source de vérité pour les factures émises et leurs calculs fiscaux. Pas de duplication du moteur de facturation ou de la fiscalité dans FRET. Les changements doivent être faits uniquement dans le dépôt Finance; aucune modification de la base FRET dans ce travail.

### 3.7 Actualisation continue
Registre des sources, propriétaire de la règle, date de vérification, date d'effet, version de standard, approbation, tests de non-régression, procédure d'urgence lors d'une modification légale, historique et alerte sur les règles qui approchent leur date de révision.

## 4. Livrables attendus du MVP et du cahier des charges

Créer des documents distincts mais liés :
- Vision produit, utilisateurs/personas, propositions de valeur, périmètre inclus/exclus et hypothèses.
- Cahier des charges fonctionnel par domaine et parcours, incluant cas normaux, erreurs, permissions et statuts.
- Cahier des charges technique : architecture, frontières de services, API, modèle de données, versionnement, sécurité, observabilité, sauvegarde/reprise et déploiement.
- Référentiel international de conformité : pays/territoires, normes, autorités, formats, obligations, références officielles, statut de vérification et dates d'effet.
- Matrice de couverture 10 % → 100 % avec niveaux clairement définis et critères de sortie mesurables.
- Matrice d'acceptation et de tests : unitaires, intégration PostgreSQL jetable, API, sécurité multi-tenant, migrations/drift, E2E, tests de conformité de formats et tests de non-régression.
- Feuille de route et registre de risques/dépendances.
- Matrice d'écart du dépôt existant, avec preuve GitHub/CI pour chaque statut.
- Contrat d'intégration ZENOX FRET ↔ ZENOX Finance.
- Politique de gestion des versions et de mises à jour réglementaires.

## 5. État GitHub connu au 2026-10-19

Dépôt : https://github.com/sebsonz/zenox-finance-platform

Les PR ci-dessous ont été vérifiées sur GitHub; elles sont ouvertes, en brouillon et non fusionnées sauf indication contraire. Ne pas déduire que leurs branches sont intégrées à `main`.

- PR #5 — [Factures multi-lignes, émission idempotente, documents et avoirs](https://github.com/sebsonz/zenox-finance-platform/pull/5). Base `main`, branche `feat/invoice-tax-snapshot-binding`, head `21e4a59881d62c13b7422dfcb5d03401606683c1`. Le descriptif rapporte une CI passée sur ce head; la PR elle-même garde des critères de fin : stratégie PDF/stockage privé, workflow de correction/avoirs, idempotence/retry, E2E et validation réglementaire.
- PR #6 — [Séparation backend/frontend monorepo](https://github.com/sebsonz/zenox-finance-platform/pull/6). Base PR #5, branche `chore/monorepo-frontend-backend-structure`, head `a34e22d12d94ffbc371a5eab389c9f132d3dfb13`. CI rapportée passée sur ce head dans le contexte antérieur; garder la revue du diff structurel et la CI finale comme critères avant fusion.
- PR #7 — [Endpoint utilisateur de lecture des factures](https://github.com/sebsonz/zenox-finance-platform/pull/7). Base PR #6, branche `feature/invoice-user-readonly-bff`, head `a65515576a069e9998041d12130b8a9b86dce106`. PR ouverte en brouillon; son statut `mergeable` était faux au dernier contrôle. Ne pas inférer que la CI est validée sans vérification récente.
- PR #8 — [Identité de marque et site public](https://github.com/sebsonz/zenox-finance-platform/pull/8). Branche `feature/zenox-brand-identity`, head `3406df9903211f486f01e037db3e92893ea2f009`. Brouillon non fusionné; rendu visuel mobile/desktop et CI à confirmer. Le symbole officiel ZENOX doit être réutilisé fidèlement; ne pas le remplacer par un symbole infini générique ou une approximation.
- PR #9 — [Workflow utilisateur de facturation](https://github.com/sebsonz/zenox-finance-platform/pull/9). Base PR #7, branche `feature/invoice-workflow-completion`, head `758e131bf5eaf8c2c41de01baef807b7daa7825b`. La CI complète `39133178944` est rapportée passée sur le commit antérieur `bcec8a9de0df49e61f5fc14acd291e7724e8877e`; le head courant doit être revérifié. Revue visuelle navigateur encore nécessaire.
- PR #10 — [Extensibilité des règles fiscales](https://github.com/sebsonz/zenox-finance-platform/pull/10). Base PR #9, branche `feature/tax-rule-extensibility`, head `9f7490cbe2f8c42e9bbbea75af1d84a7a46e7a6c`. Brouillon non fusionné. Ajoute traitement comptable fiscal, conditions déclaratives EQ/IN strictes, faits métiers, priorité après filtrage, snapshots et tests unitaires. Une correction du déclencheur CI a été ajoutée; **résultat CI du head courant non confirmé** au dernier contrôle.

L'ordre des branches/PR exprime des dépendances. Ne pas fusionner ou rebaser automatiquement. Ne pas fusionner aucune PR sans accord explicite de l'utilisateur.

## 6. État fonctionnel connu — ne pas surdéclarer

### Facturation
- Des migrations, un moteur de facture, lignes, émission, numérotation par tenant/année, snapshots fiscaux, immutabilité SQL, documents HTML, BFF utilisateur, création/édition de brouillons, attribution d'acteur, audit et parcours UI de factures/avoirs ont été développés sur les branches de PR #5–#9.
- Le statut exact doit être attribué par commit et par CI. Le HTML imprimable n'est pas à lui seul une preuve de conformité légale ni un PDF certifié.
- La stratégie PDF/stockage privé, la correction complète de documents émis, idempotence et reprises, E2E et revue visuelle restent à vérifier selon les heads actuels.

### Fiscalité
- La structure de juridictions et de règles fiscales versionnées, la base de calcul Decimal, les modes inclusif/exclusif, les retenues comme déduction, et les snapshots existent selon les branches inspectées.
- PR #10 ajoute le premier niveau de conditions fiscales et de traitement comptable.
- L'administration sécurisée des règles, le cycle d'approbation, le versionnement immuable à chaque édition, les tests d'intégration et les sources fiscales officielles revues restent à compléter.
- Aucun taux AIB béninois ne doit être inventé ou activé sans source officielle vérifiée et revue appropriée. Ne pas prétendre qu'un pays est conforme sans preuve.

### Marque / site
- PR #8 porte l'identité et le site public; validation visuelle manuelle et CI doivent être confirmées. La marque doit employer le symbole officiel ZENOX validé.

### Paiements, comptabilité complète et transmission réglementaire
- Ne pas les déclarer terminés sans audit et preuves spécifiques. Le cahier des charges devra définir leur portée MVP et leur progression future.

## 7. État de CI / vérification

- Une workflow CI existe dans `.github/workflows/ci.yml`: typecheck et build backend, migrations Finance sur PostgreSQL jetable, préparation rôle d'intégration, vérification des checksums de migration, tests unitaires/intégration, typecheck et build frontend.
- Les tests/migrations doivent utiliser une base PostgreSQL jetable exclusivement.
- La CI a été ajustée dans la branche tax pour déclencher sur la base `feature/invoice-workflow-completion` de PR #10 et sur push de la branche fiscale. Le head actuel doit être contrôlé après cette modification.
- Tout état CI doit être cité avec le SHA exact testé. Un ancien passage vert ne valide pas un nouveau head.

## 8. Règles de sécurité et de travail impératives

1. **Ne jamais accéder à ni modifier `zenoxfret_v2`** dans le cadre Finance.
2. Ne jamais appliquer les migrations Finance à une base persistante pendant la phase de construction; PostgreSQL jetable uniquement, sauf instruction explicite ultérieure et environnement vérifié.
3. Ne jamais fusionner de PR ni déployer sans approbation explicite.
4. Pas de force push, reset destructif ou suppression de travail. Préserver les branches et les modifications.
5. Ne pas refaire les contrôles déjà réussis sans raison; confirmer commit, périmètre et preuve avant de les marquer acquis.
6. Ne pas présenter une réussite de compilation ou de test comme une homologation réglementaire.
7. Séparer clairement : confirmé par source officielle, confirmé par CI, implémenté mais non vérifié, hypothèse, et avis juridique requis.
8. Utiliser le dépôt GitHub Finance et ses checkpoints comme source de continuité; vérifier l'état réel avant d'affirmer que quelque chose est intégré ou validé.

## 9. Première action recommandée dans le nouveau chat

Commencer par reconnaître ce checkpoint, puis engager la phase **recherche internationale + rédaction du MVP et du cahier des charges**. Consulter les sources officielles et standards primaires pertinents; construire les livrables dans `docs/product/` ou `docs/compliance/` (structure à confirmer avant création), avec références et dates de vérification. Ensuite auditer les branches/PR #5–#10 et produire la matrice d'écart, sans coder de nouveau module avant que la base produit et ses critères d'acceptation soient validés.

Ne pas demander à l'utilisateur de répéter les décisions présentes dans ce checkpoint.
