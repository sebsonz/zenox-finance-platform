# ZENOX Finance — modèle de couverture, acceptation et feuille de route

**Version :** 0.1 — proposition  
**Date :** 2026-10-19  
**Dépendances :** MVP, cahier des charges et registre international initial.

## 1. La couverture 10 % → 100 %

Le pourcentage est un indicateur de progression d'un catalogue versionné de capacités, profils transactionnels et packs de juridiction ; il ne représente pas un pourcentage de tous les pays du monde. Le catalogue et les pondérations doivent être approuvés avant de publier une valeur.

Un élément de couverture est un tuple :
`capability_id, jurisdiction_id, transaction_profile, standard_profile, effective_from, weight, implementation_status, test_evidence, source_evidence, external_review, last_reviewed_at`.

Une capacité universelle peut être comptée séparément des éléments propres à un pays. Les exigences réglementaires bloquantes ne sont jamais compensées par un score agrégé élevé.

### Niveaux de maturité

- **10 % — Fondation universelle** : multi-tenancy, permissions, modèle financier, Decimal, versionnement, audit, architecture d'extension, stratégie fail-closed et premiers tests. Aucun claim de conformité pays.
- **25 % — Parcours financier MVP** : client → devis → facture → paiement enregistré → allocation → solde, ainsi que correction/avoir et parcours E2E ; l'interface et l'API livrent le périmètre initial.
- **50 % — Première vague de juridictions** : packs choisis, chacun relié à un périmètre d'opérations, source primaire, règles versionnées, artefacts validés, tests et revue adaptée.
- **75 % — Extension contrôlée** : plus de catégories de transaction, devises, standards/connexions, transmissions et tests comparatifs ; mesure des cas couverts et lacunes.
- **100 % — Catalogue approuvé complet pour une version** : chaque capacité du catalogue fixé est livrée et testée ; toute juridiction activée dispose des preuves requises ; aucun pays ou flux non vérifié n'est présenté comme conforme. Ce n'est pas une garantie d'inclusion de tous les pays existants.

Le pourcentage numérique sera calculé seulement quand la liste et les pondérations sont approuvées et que les preuves existent. En attendant, utiliser l'état qualitatif « socle en cours », pas un chiffre non étayé.

## 2. Matrice de sortie

| Palier | Critères de sortie |
|---|---|
| Fondation | CI en vert au SHA exact, migration sur PostgreSQL jetable, tests RLS/grants, audit et architecture testée |
| MVP financier | Parcours E2E complet, émissions atomiques, snapshots, idempotence, paiements/allocation, correction, exposition API et portail |
| Juridiction | Sources officielles avec dates, texte applicable confirmé, pack de règles approuvé, validations structurelles/sémantiques, jeux de tests, autorisations/connecteurs et revue locale si nécessaire |
| Production | RPO/RTO choisis et testés, restauration, gestion d'incident, surveillance, sécurité, conformité et approbation go/no-go |

## 3. Critères d'acceptation techniques

- **AC-SEC-01** : les tentatives d'accès cross-tenant échouent pour API, base, exports, portail et documents.
- **AC-SEC-02** : le rôle runtime n'est pas superuser ni BYPASSRLS ; grants effectifs au moindre privilège.
- **AC-MONEY-01** : tous les totaux et arrondis sont reproductibles et testés sans calcul monétaire en flottants binaires.
- **AC-INV-01** : émission concurrente n'attribue pas de numéro identique dans la même portée de numérotation.
- **AC-INV-02** : document émis et snapshot fiscal ne peuvent être modifiés par les rôles d'usage courant.
- **AC-INV-03** : les reprises avec même idempotency key et même payload ne dupliquent pas les effets ; payload incompatible rejeté.
- **AC-TAX-01** : règle absente, ambiguë, expirée ou non approuvée bloque l'émission quand le calcul est nécessaire.
- **AC-TAX-02** : priorités, composition, valeurs nulles, frontières de dates et règles superposées ont des fixtures explicites.
- **AC-PAY-01** : callbacks/webhooks répétés ne créent ni paiement ni remboursement dupliqué.
- **AC-PAY-02** : concurrence de deux allocations ne peut pas provoquer une surallocation.
- **AC-DOC-01** : un client ne récupère ni ne devine les documents d'un autre tenant ; liens temporaires sont limités et autorisés.
- **AC-CMP-01** : document passe les artefacts de validation du format exact versionné ; toutes les violations sont classées.
- **AC-CMP-02** : pack juridictionnel non approuvé/inactif bloque la fonction réglementée.
- **AC-API-01** : OpenAPI et tests de contrat correspondent aux routes exposées.
- **AC-FRET-01** : le parcours d'intégration valide les appels répétés, les erreurs, les statuts asynchrones et les mappings d'identifiants sans connexion SQL directe.
- **AC-OPS-01** : restauration sur environnement de test prouve la récupération des données et références financières.
- **AC-CI-01** : résultats associés au commit exact et à la version de la configuration/fixtures.

## 4. Plan de test de référence

1. Unitaires : money/Decimal, calcul de ligne, taxes et priorités.
2. Unitaires de schéma : conditions, entrées invalides, limites, statuts et transitions.
3. Intégration PostgreSQL jetable : migrations, contraintes, RLS, grants, isolation et transactions.
4. API : authentification, scopes, validation, pagination, idempotence et erreurs.
5. Concurrence : émission, numérotation, allocation, même clé en parallèle et callbacks répétés.
6. Contrats : OpenAPI et consommateur ZENOX FRET.
7. Conformité : schémas, Schematron, listes de codes et fixtures pour chaque version supportée.
8. E2E : devis → facture → document → paiement → allocation → solde → avoir/remboursement.
9. Frontend : scénarios de rôles, erreurs, langues, accessibilité et responsive.
10. Opérations : restauration, surveillance, incident, retry/outbox et dérive de migration.

## 5. Feuille de route suggérée

### R0 — Recherche et base produit
Finaliser la comparaison des modèles, sources primaires, périmètre initial, MVP, cahier des charges, registre de risques et critères d'acceptation.

### R1 — Référentiel de conformité
Poursuivre les pays candidats, choisir explicitement le profil pilote, vérifier le droit en vigueur et documenter les autorisations nécessaires. Aucun taux/règle locale ne doit être inventé.

### R2 — Cartographie de l'existant
Audit par exigences des branches/PR ; confirmer le SHA de chaque branche et l'état CI courant. Réutiliser les preuves récentes, sans refaire sans motif les validations déjà faites.

### R3 — Fermer le parcours facture
Finir les points restants : intégrité de l'émission, idempotence/retry, corrections/avoirs, format PDF/stockage privé, E2E et revue visuelle.

### R4 — Sécurité fiscale et administration des règles
Administration à droits restreints, cycle draft/review/approve/publish/retire, versions immuables, approbations, sources, dates d'effet, tests d'intégration et rollback logique sans altérer l'historique.

### R5 — Paiements et allocations
Modèle provider-agnostic, confirmation fiable, idempotence, remboursements, états, allocations atomiques et tests de concurrence.

### R6 — Intégration électronique par pack
Format/standard versionné et connecteur par autorité/prestataire. Sandbox, réponses, erreurs, retry, reçus, statut de transmission et credentials documentés.

### R7 — Parcours E2E et acceptation produit
E2E multi-tenant du client intégré jusqu'à l'émission, au paiement et aux rapports ; revue visuelle et contrat FRET.

### R8 — Grand livre et extensions
Grand livre équilibré, périodes, rapprochement bancaire, dépenses/fournisseurs, reporting avancé lorsque le moteur financier et les sources sont fiables.

### R9 — Préparation de production
RPO/RTO, sauvegarde/restauration, surveillance, incident, revue de sécurité, conformité pour le périmètre revendiqué et approbation explicite.

## 6. Registre initial des risques

| Risque | Impact | Mitigation |
|---|---|---|
| Déclarer une conformité universelle sans preuves | Élevé | Catalogue par juridiction/version, blocage par critères légaux |
| Régler un taux fiscal obsolète | Élevé | Source primaire, dates d'effet, revue, tests et alertes |
| Émettre en dehors d'un processus agréé | Élevé | Vérification du rôle légal et intégration à un fournisseur agréé |
| Double émission ou double paiement | Élevé | Idempotence, contraintes uniques, transactions et tests de concurrence |
| Accès inter-tenant | Critique | RLS, grants, contextes fail-closed et tests négatifs |
| Confondre facture, paiement et écriture comptable | Élevé | Modèle métier distinct et événements source traçables |
| Migration de standard sans compatibilité | Élevé | Versions simultanées, fixtures et calendrier de dépréciation |
| Dépendance à une seule plateforme | Moyen/élevé | Interfaces d'adaptation et contrats versionnés |
| Sources synthétiques non vérifiées | Élevé | Distinguer textes primaires, fiches non vérifiées et avis juridique |
| Divergence entre dépôt, branche et checkpoint | Élevé | SHA précis, preuves CI et checkpoints datés |

## 7. Processus de mise à jour réglementaire

1. Surveiller sources officielles et annonces de standards.
2. Créer une proposition de changement avec lien, extrait/résumé, pays, version et dates.
3. Évaluer les entreprises, transactions, documents et APIs affectés.
4. Obtenir une revue fonctionnelle et juridique appropriée.
5. Créer une nouvelle version de règle ou de pack ; ne pas modifier une version publiée en place.
6. Produire des tests de conformité et de non-régression.
7. Exécuter CI sur PostgreSQL jetable et artefacts de test.
8. Faire approuver la publication par un rôle habilité.
9. Déployer selon le processus de livraison approuvé, avec stratégie de désactivation/rollback des nouvelles règles sans changer les snapshots historiques.
10. Consigner version publiée, sources, approbateurs, tests et date de prochaine revue.

Les règles expirées ou dont la validité n'a pas été reconfirmée doivent déclencher une alerte et, selon leur criticité, bloquer les nouvelles émissions concernées.

## 8. Décisions ouvertes qui empêchent de geler le MVP v1.0

- Pays/territoires et scénarios de lancement prioritaires.
- Catégories de clients/transactions (B2B/B2C/B2G, biens, services, export).
- Niveau de conformité requis pour un pilote.
- Politique PDF et stockage documentaire.
- Prestataires de paiement et conditions d'éligibilité par pays.
- Périmètre d'avoir, d'acompte et de remboursement.
- Fonctions du portail client pour la première version.
- Modèle comptable exigé pour l'acceptation MVP.
- Rétention, RPO/RTO et objectifs de performances.
- Processus d'homologation ou de partenariat réglementaire.
- Pondérations exactes de la mesure 10–100 %.

En attendant, tout calcul/claim de couverture chiffrée doit être indiqué comme non disponible faute de catalogue et poids approuvés.
