# ZENOX Finance — cahier des charges fonctionnel et technique

**Version :** 0.1 — base complète de revue, non homologuée  
**Date de référence :** 2026-10-19  
**Référence normative produit :** checkpoint maître 2026-10-19.

## 1. Portée et vocabulaire

Le présent cahier des charges fixe les exigences produit qui guideront l'audit du dépôt. Il ne certifie pas l'état de l'implémentation. Chaque exigence porte un identifiant stable ; le statut sera établi plus tard par preuve de code, migration, test, CI et/ou validation externe.

Les termes « doit » et « obligatoire » désignent une exigence du produit. Une obligation légale ne sera revendiquée que si elle est reliée à une source primaire applicable et à une date/périmètre.

## 2. Exigences fonctionnelles

### 2.1 Identité, tenants et autorisations

- **ZF-IAM-001** : les utilisateurs s'authentifient via un mécanisme validé côté serveur.
- **ZF-IAM-002** : la création, l'invitation, l'activation, la suspension et la révocation des membres sont auditées.
- **ZF-IAM-003** : chaque requête résout le tenant depuis le contexte authentifié et les permissions.
- **ZF-IAM-004** : aucune lecture ou écriture inter-tenant n'est possible, même par manipulation d'ID, filtre, curseur, document ou référence externe.
- **ZF-IAM-005** : les rôles et scopes sont minimaux, vérifiés côté serveur et couverts par des tests négatifs.
- **ZF-IAM-006** : les comptes d'intégration ont cycle de vie de credentials, rotation/révocation et grants explicites.
- **ZF-IAM-007** : les données globales de référence sont modifiables seulement par les rôles de plateforme autorisés.

### 2.2 Entreprises et configuration

- **ZF-TEN-001** : une entreprise dispose d'identité légale/commerciale, adresse, pays, fuseau horaire, langues, identifiants fiscaux et paramètres de numérotation nécessaires.
- **ZF-TEN-002** : les devises de référence, de document et de règlement sont distinctes.
- **ZF-TEN-003** : les modifications de profil ne changent pas les snapshots des documents déjà émis.
- **ZF-TEN-004** : la couverture juridictionnelle de l'entreprise est explicite : fonctionnalités autorisées, date de validité et statut de revue.

### 2.3 Clients, fournisseurs et catalogue

- **ZF-CRM-001** : gérer personnes, organisations, adresses et contacts multiples.
- **ZF-CRM-002** : préserver les références externes sans faire partager les clés primaires entre systèmes.
- **ZF-CRM-003** : fournir recherche bornée, filtres, pagination et archivage contrôlé.
- **ZF-CAT-001** : gérer produits/services, unités, descriptions, prix de référence et catégories.
- **ZF-CAT-002** : copier les valeurs pertinentes dans la version de document ; le catalogue reste modifiable indépendamment.
- **ZF-SUP-001** : le modèle cible supporte fournisseurs et documents d'achat ; l'activation complète de la comptabilité fournisseurs peut être post-MVP.

### 2.4 Devis

- **ZF-QUO-001** : créer, lire, modifier et envoyer des devis en brouillon.
- **ZF-QUO-002** : définir les statuts draft, sent, accepted, rejected, expired et cancelled, avec transitions contrôlées.
- **ZF-QUO-003** : figer un snapshot de la version acceptée et tracer la conversion en facture.
- **ZF-QUO-004** : empêcher la conversion répétée de créer plusieurs factures sans intention explicitement autorisée.

### 2.5 Factures et documents légaux

- **ZF-INV-001** : créer et éditer un brouillon uniquement si son état et sa version le permettent.
- **ZF-INV-002** : recalculer les totaux côté serveur, sans faire confiance aux totaux envoyés par le navigateur.
- **ZF-INV-003** : modéliser dates d'émission, de livraison/prestation, d'échéance, devise, lignes, remises, frais, bases et taxes.
- **ZF-INV-004** : l'émission et la numérotation sont atomiques et résistantes à la concurrence.
- **ZF-INV-005** : une facture émise devient immuable pour les champs financiers et juridiques.
- **ZF-INV-006** : conserver snapshot des parties, lignes, prix, devise, précisions/arrondis, règles fiscales et contenu du document.
- **ZF-INV-007** : gérer statuts, événements, dates de transmission, erreurs, annulation/correction et relation aux documents d'origine.
- **ZF-INV-008** : générer des fichiers dans les formats explicitement validés ; différencier HTML imprimable, PDF et format structuré juridiquement requis.
- **ZF-INV-009** : tous les documents privés sont servis avec autorisation et stockage privé, jamais par URL publique permanente par défaut.
- **ZF-INV-010** : les clés d'idempotence et les contraintes de base préviennent la double émission lors des retries.
- **ZF-INV-011** : les mentions et règles requises sont fournies par le pack juridictionnel versionné.
- **ZF-INV-012** : un document ne peut pas être émis dans une juridiction ou un profil dont les préconditions obligatoires ne sont pas satisfaites.

### 2.6 Avoirs, acomptes, corrections et remboursements

- **ZF-CRN-001** : les avoirs référencent la facture et les lignes/montants concernés.
- **ZF-CRN-002** : l'effet fiscal et le format d'un avoir dépendent du pack en vigueur ; conserver la trace du calcul d'origine et de la correction.
- **ZF-CRN-003** : un acompte, une facture d'acompte, un paiement anticipé et une allocation sont des objets distincts.
- **ZF-CRN-004** : annulations/corrections après émission suivent une procédure contrôlée, auditable et juridictionnelle.
- **ZF-PAY-001** : un remboursement référence le paiement d'origine et conserve le statut/confirmation du prestataire.
- **ZF-PAY-002** : un avoir ne doit pas automatiquement rembourser le client ; la décision de paiement doit être explicite.

### 2.7 Moteur fiscal

- **ZF-TAX-001** : les règles sont liées à une juridiction, catégorie d'opération, période de validité, version, source, état d'approbation et statut de publication.
- **ZF-TAX-002** : les faits nécessaires au calcul incluent, selon la règle, statut fiscal vendeur/acheteur, lieu, type d'objet/prestation, catégories fiscales et dates pertinentes.
- **ZF-TAX-003** : les expressions de conditions sont strictement validées ; valeurs absentes/invalides ne sont pas converties implicitement et un prédicat inconnu ne vaut pas vrai.
- **ZF-TAX-004** : les moteurs calculent uniquement les types de règle réellement implémentés et testés (pourcentage, montants fixes, seuils, barèmes, retenues, compositions) ; les fonctions non supportées échouent de façon sûre.
- **ZF-TAX-005** : priorité et ordre de composition sont définis et déterministes après filtrage des règles éligibles.
- **ZF-TAX-006** : base imposable, inclusion/exclusion de taxe, déduction, retenue, exonération, arrondi et méthode de calcul sont explicitement représentés.
- **ZF-TAX-007** : le snapshot enregistre les faits appliqués, toutes les versions de règles, le calcul ligne/taxe/total, les précisions et résultats.
- **ZF-TAX-008** : l'émission est bloquée si règle obligatoire absente, ambiguë, expirée, non approuvée ou non vérifiable.
- **ZF-TAX-009** : chaque taux/règle activé porte une source primaire, une date de vérification, une date d'effet et une approbation.
- **ZF-TAX-010** : tenant ordinaire ne peut ni éditer les règles maîtres ni republier une règle fiscale sans rôle et workflow autorisés.
- **ZF-TAX-011** : toute modification crée une nouvelle version immuable ; snapshots historiques ne sont jamais re-calculés silencieusement.
- **ZF-TAX-012** : jeux de tests couvrent les cas normaux, limites, priorités, règles concurrentes, dates frontières et absence de règle.

### 2.8 Devises et change

- **ZF-FX-001** : gérer code devise normalisé, précision et source de référence.
- **ZF-FX-002** : taux stockés en exact decimal avec source, date/heure, date de valeur, méthode et possibilité de revue manuelle.
- **ZF-FX-003** : conserver le taux appliqué au document et/ou règlement ; une nouvelle valeur du taux ne réécrit pas l'historique.
- **ZF-FX-004** : distinguer devise document, devise de paiement, devise de présentation et devise du grand livre.
- **ZF-FX-005** : traiter écarts de change et conversions conformément au modèle comptable validé ; ne pas les inventer dans le MVP si le traitement n'est pas encore livré.

### 2.9 Paiements, allocations et créances

- **ZF-PMT-001** : distinguer paiement, tentative, événement de prestataire, remboursement et allocation.
- **ZF-PMT-002** : tout webhook est authentifié ou validé par une récupération serveur-à-serveur fiable, puis dédupliqué.
- **ZF-PMT-003** : idempotence, référence externe unique et transitions d'état empêchent les effets financiers dupliqués.
- **ZF-PMT-004** : allocations et remboursements sont transactionnels et protégés contre la concurrence.
- **ZF-PMT-005** : aucune surallocation de paiement ou créance.
- **ZF-PMT-006** : gérer paiement partiel, paiement multi-factures, crédit non affecté, échec, remboursement partiel/total et contestation dans le périmètre activé.
- **ZF-PMT-007** : les moyens disponibles, pays d'éligibilité, monnaies et capacités du fournisseur sont déclarés par adaptateur, pas universellement.
- **ZF-AR-001** : montant dû = montant exigible ajusté des crédits et allocations reconnus selon la règle retenue ; les calculs ont une source traçable.
- **ZF-AR-002** : les rapports distinguent montant facturé, réglé, crédité, remboursé, non affecté, échu et restant dû.

### 2.10 Facturation électronique et packs juridictionnels

- **ZF-CMP-001** : chaque pack définit les catégories de transaction couvertes, les acteurs concernés et la période d'effet.
- **ZF-CMP-002** : les règles documentaire/fiscale, identifiants, séquences, schémas, validations, transmissions, signatures et archivage requis sont sourcés.
- **ZF-CMP-003** : formats et artefacts (ex. EN 16931, UBL, Peppol BIS, formats nationaux) sont versionnés séparément des objets métier.
- **ZF-CMP-004** : la validation inclut schéma, listes de codes, règles sémantiques, calculs, dates et règles juridictionnelles applicables.
- **ZF-CMP-005** : l'intégration à un point d'accès, une plateforme agréée ou une autorité dispose d'un contrat, d'un régime d'autorisation et d'un parcours de test clairement documentés.
- **ZF-CMP-006** : le système suit soumis, accepté, rejeté, remis et autres statuts propres au transport ; il ne confond pas émission interne et réception par une autorité.
- **ZF-CMP-007** : la conformité déclarée est limitée à une juridiction, un profil, une catégorie d'opération, un format et une date d'effet vérifiés.
- **ZF-CMP-008** : un score de maturité global ne compense jamais une exigence légale bloquante non satisfaite.

### 2.11 Documents, notifications, portail et intégrations

- **ZF-DOC-001** : documents générés et modèles sont versionnés ; documents émis sont préservés.
- **ZF-DOC-002** : stockage privé, autorisations de téléchargement, rétention et journalisation.
- **ZF-NOT-001** : notifications déclenchées par événements enregistrés, idempotentes et réessayables.
- **ZF-NOT-002** : échec d'envoi et nombre de tentatives sont observables sans exposer secrets.
- **ZF-PORT-001** : le portail client vérifie l'accès à chaque ressource et document côté serveur.
- **ZF-API-001** : API versionnée, contrat OpenAPI, schémas validés, erreurs normalisées et pagination.
- **ZF-API-002** : toutes les écritures financières concernées supportent idempotence et clés de corrélation.
- **ZF-API-003** : identité intégration, tenant grant, scopes, rotation/révocation des secrets sont contrôlés.
- **ZF-API-004** : le contrat ZENOX FRET est versionné, testé par contract tests et aucune dépendance SQL directe n'est autorisée.
- **ZF-API-005** : événements/outbox et stratégie de retry garantissent livraison au moins une fois avec déduplication côté récepteur.

### 2.12 Comptabilité, rapports et plateforme

- **ZF-ACC-001** : modèle cible de grand livre avec comptes, périodes, écritures équilibrées, références aux événements source et politique de correction.
- **ZF-ACC-002** : ne pas annoncer grand livre/clôture avant implémentation et tests de l'équilibre, des verrouillages de période et des reversals.
- **ZF-RPT-001** : rapports filtrables par période, devise, client et état dans le périmètre livré.
- **ZF-PLT-001** : offre, limites et statut d'abonnement de Finance restent distincts des factures émises par les clients de Finance.
- **ZF-PLT-002** : actions administratives, droits et modifications de plan sont audités.

## 3. Exigences techniques

### 3.1 Architecture de départ

Le baseline du checkpoint est un monolithe modulaire / API-first avec Node.js 22+, TypeScript strict, Express, React/Vite et PostgreSQL/Supabase dédié. Le détail qui n'est pas déjà démontré doit être confirmé par décision d'architecture. Aucun accès navigateur direct à la base ou secret service n'est permis.

### 3.2 Données et transactions

- Utiliser types monétaires exacts PostgreSQL `numeric` ou représentation Decimal éprouvée.
- Définir contraintes, clés étrangères tenant-aware, indices uniques et contraintes d'état.
- Utiliser transactions pour émission/numérotation, allocation et mise à jour des soldes.
- Utiliser contrôle de concurrence optimiste ou verrouillage transactionnel documenté.
- Ne pas dépendre uniquement de validations applicatives lorsque l'invariant peut être protégé en base.
- Documenter les clés et données qui doivent être immuables et les transitions d'état permises.

### 3.3 Sécurité base de données

- RLS activé pour les tables tenant ; rôle runtime non-superuser et sans BYPASSRLS.
- Politiques fail-closed et contextes tenant établis par le backend dans la transaction.
- Tests de grants effectifs, cross-tenant, bypass, absence de contexte et rôles.
- Migrations append-only, checksums/drift check, exécution sur PostgreSQL jetable en CI.
- Référentiels globaux séparés des données tenant et protégés par privilèges propres.

### 3.4 API et opérations

- Valider configuration d'environnement au démarrage et échouer clairement en cas de configuration incomplète.
- Timeout et gestion d'erreur pour les appels externes.
- Idempotency store et stratégie de rétention documentés.
- Trace/correlation IDs, métriques sans données sensibles et journaux structurés.
- Outbox transactionnelle pour événements critiques et consommations idempotentes.
- Health/readiness endpoints et alerting opérationnel.
- Limitation de débit et prévention de l'abus sur authentification, recherche et actions sensibles.

### 3.5 Documents et secrets

- Les artefacts utilisent un stockage privé, chiffrement au repos/en transit selon les capacités disponibles, contrôles d'accès, durée des liens signés limitée et métadonnées d'intégrité.
- Les secrets fournisseurs ne sont pas exposés au frontend ni stockés dans Git.
- Les opérations d'émission et de transmission conservent une preuve vérifiable sans journaliser de données interdites.

### 3.6 Sauvegarde, restauration et déploiement

- Définir RPO/RTO avec les responsables avant le lancement.
- Sauvegardes surveillées, procédure de restauration et test périodique consigné.
- Séparer LOCAL, TEST, STAGING et PRODUCTION.
- Secrets et permissions distincts par environnement.
- Pas de déploiement ni migration persistante sans approbation explicite dans la phase présente.
- Documenter rollback applicatif et migrations non réversibles ; ne jamais utiliser de reset destructif pour résoudre une dérive.

## 4. Statuts de conformité et de livraison

Chaque exigence doit recevoir exactement un état de preuve parmi :
- `PROPOSÉ`
- `À_CONFIRMER`
- `SOURCE_OFFICIELLE`
- `IMPLÉMENTÉ_NON_VÉRIFIÉ`
- `TEST_CI`
- `VALIDÉ_PAR_REVUE_EXTERNE`
- `PARTIEL`
- `ABSENT`
- `BLOQUÉ`

Les statuts peuvent ensuite être mappés au tableau d'écart, mais aucun état unique ne doit mélanger les preuves de code et les preuves réglementaires.

## 5. Tests requis avant une mise en service

- Tests unitaires des fonctions fiscales/money sans flottants binaires.
- Tests de schémas, contraintes et transitions d'état.
- Tests PostgreSQL jetable : migrations, RLS, isolation, grants, transactions, idempotence et concurrence.
- Tests contractuels API/OpenAPI et contrat ZENOX FRET.
- E2E : devis → facture → paiement → allocation → solde → avoir/remboursement.
- Tests positifs/négatifs des règles fiscales avec frontières de dates et absences de règle.
- Tests de conformité de formats et artefacts versionnés par juridiction.
- Tests visuels/accessibilité/responsive du frontend.
- Tests de restauration, charge ciblée et reprise après erreur.
- Rapport de chaque suite attaché au SHA précis et à la version des fixtures/règles.

## 6. Critères de sortie

Le cahier des charges n'est considéré stable que lorsque les décisions obligatoires et ouvertes sont explicitement marquées, les références sont traçables et chaque exigence a un critère de test ou une raison claire de validation externe. L'acceptation produit ne vaut pas conseil juridique ; l'activation d'une juridiction exige les validations réglementaires qui s'appliquent.
