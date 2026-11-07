# ZENOX Finance — fondation documentaire et financière

**Date :** 2026-11-07  
**Branche de travail :** `feat/invoice-document-foundation`  
**Commit de départ :** `5d988dedf0b7a55cde422f52edd8f63616603bd4`  
**Statut :** décision d'architecture proposée, à valider par les tests d'implémentation.

## 1. Objectif

Faire évoluer le module de facturation existant vers un système documentaire et financier complet, sans réécrire les fonctions déjà opérationnelles et sans confondre des objets métier qui ont des cycles de vie différents.

Cette fondation couvre :
- la fiabilisation et l'enrichissement des factures existantes ;
- les devis et leur conversion contrôlée en facture ;
- les documents pro forma ;
- les factures d'acompte et de solde ;
- les avoirs partiels/totaux et les notes de débit ;
- les rendus HTML/PDF, l'aperçu, l'impression et l'archivage ;
- les paiements, remboursements et allocations comme objets distincts.

Aucune conformité fiscale ou légale universelle ne sera revendiquée. Les règles bloquantes dépendent d'un pack juridictionnel versionné, de sources applicables et de validations documentées.

## 2. État initial vérifié sur GitHub

Référence : dépôt `sebsonz/zenox-finance-platform`, commit de départ ci-dessus.

### Déjà présents
- brouillons de factures multi-lignes ;
- validation Zod des entrées ;
- calcul serveur via Decimal.js ;
- modification optimiste des brouillons et recalcul serveur ;
- snapshots fiscaux immuables attachés aux brouillons ;
- émission transactionnelle, séquence par tenant/année et idempotence ;
- attribution d'acteur USER/SERVICE ;
- artefacts HTML et PDF immuables avec empreinte SHA-256 ;
- accès documentaire via routes tenant-scoped ;
- avoir intégral avec référence à la facture source ;
- tests unitaires et PostgreSQL ciblant plusieurs étapes du cycle de facture.

### Lacunes et limites vérifiées
- le schéma de brouillon ne porte que client, devise, échéance, notes et lignes ;
- les lignes ne portent pas encore d'unité, référence produit/service, description longue, catégorie comptable ou métadonnées métier structurées ;
- le calcul provisoire des lignes utilise un taux saisi, alors que le snapshot fiscal applique ensuite les règles effectives : les deux étapes doivent être clairement séparées dans l'interface et dans le contrat métier ;
- la facture ne contient pas encore un instantané complet et structuré de l'émetteur ;
- les champs documentaires usuels (date de livraison/prestation, référence de commande, conditions et modalités de paiement, références externes) ne sont pas exposés dans le contrat de brouillon actuel ;
- la numérotation est actuellement codée en format `INV-année-séquence`, sans profil de numérotation configurable ;
- le rendu PDF actuel utilise Helvetica Type 1, convertit les caractères non ASCII en `?` et limite les lignes à une largeur fixe ; il ne constitue pas un rendu commercial acceptable ;
- le HTML inclut des données techniques de calcul et n'offre pas encore un système de modèles/version de présentation ;
- le crédit disponible est limité à l'avoir intégral ;
- les dossiers backend/frontend de devis sont essentiellement des squelettes.

## 3. Principes de modélisation

### 3.1 Ne pas réduire tous les documents à un seul statut

Les objets doivent rester distincts :

| Objet | Nature | Cycle de vie attendu |
|---|---|---|
| Devis | Proposition commerciale | Brouillon, envoyé, accepté, refusé, expiré, converti |
| Pro forma | Document commercial prévisionnel, non assimilé à une facture fiscale émise | Brouillon, publié/partagé, remplacé/expiré |
| Facture standard | Créance documentée et émise | Brouillon, validée, émise, correction/régularisation selon juridiction |
| Facture d'acompte | Facture liée à un paiement anticipé | Émise, partiellement/totalement réglée, soldée/ajustée |
| Facture de solde | Facture du solde d'une opération | Brouillon, émise, réglée selon les paiements et acomptes imputables |
| Avoir | Document correctif référant une facture émise | Brouillon, émis, appliqué/remboursé selon opérations distinctes |
| Note de débit | Document correctif augmentant un montant dû | Brouillon, émise, liée à la facture ou opération source |
| Paiement | Mouvement de règlement | Initié, confirmé, échoué, remboursé/contesté selon fournisseur |
| Allocation | Imputation d'un paiement/crédit sur une créance | Créée, ajustée ou annulée selon règles d'audit |

Un devis, une pro forma, une facture, un avoir et un paiement ne sont pas des variantes interchangeables d'une même ligne de table.

### 3.2 Compatibilité avec les factures existantes

- Conserver `finance_invoices` comme agrégat de facture fiscale émise.
- Ne pas réinterpréter les lignes historiques ni recalculer leurs snapshots.
- Étendre les factures par migrations additives, avec valeurs par défaut explicites et contraintes validées progressivement.
- Créer des agrégats séparés pour les devis, documents pro forma, notes de débit, paiements et allocations.
- Relier les documents par des références typées et des clés tenant-aware.
- Les factures d'acompte et de solde restent des factures émises, mais leurs relations, calculs et imputations doivent être explicites et testables ; elles ne sont pas un simple libellé de présentation.
- Les avoirs doivent référencer la facture source, les lignes/quantités/montants corrigés et le snapshot fiscal d'origine. Un avoir ne déclenche jamais automatiquement un remboursement.

### 3.3 Modèle commun de rendu documentaire

Introduire une couche de rendu indépendante des agrégats métier :
- modèles versionnés ;
- rendu HTML accessible et responsive ;
- CSS d'impression dédié et aperçu avant impression ;
- PDF généré avec polices embarquées et prise en charge Unicode ;
- métadonnées de version, format, taille, empreinte et auteur ;
- stockage privé, accès tenant-scoped et journalisation des lectures ;
- conservation immuable de chaque rendu émis ;
- génération reproductible depuis les snapshots documentaires, jamais depuis des données client modifiables après émission.

Le rendu destiné au client ne doit pas exposer par défaut les identifiants internes, JSON bruts de calcul, données de diagnostic ou informations techniques de snapshots.

## 4. Améliorations obligatoires de la facture existante

### 4.1 En-tête et parties
- snapshot émetteur : raison sociale, forme/statut si applicable, adresse, pays, identifiants légaux/fiscaux, coordonnées et logo ;
- snapshot client complet : type, nom légal, adresse de facturation/livraison, pays, identifiants et coordonnées ;
- numéro, dates, devise, langue, références client/commande/contrat ;
- date de livraison ou période de prestation lorsque pertinente.

### 4.2 Lignes et prix
- référence article/service, description, unité, quantité, prix unitaire ;
- remise par ligne et remise globale avec politique de cumul explicite ;
- frais additionnels et frais de livraison ;
- catégories de transaction et références fiscales par ligne ;
- taxes multiples, incluses/exclusives, composées et retenues selon politiques prises en charge ;
- sous-totaux, bases, taxes, retenues, montant brut et montant net dû ;
- calculs Decimal côté serveur et précision déterminée par devise/règle, jamais par flottants binaires.

### 4.3 Conditions et suivi
- échéance, modalités/conditions de paiement, instructions de règlement ;
- notes publiques séparées des notes internes ;
- statut de paiement calculé depuis paiements et allocations, jamais saisi librement ;
- solde dû, montant payé, crédité, remboursé et non affecté distingués ;
- historique des événements, acteurs et changements ;
- recherche, filtres, tri, pagination et exports autorisés.

### 4.4 Émission et numérotation
- profil de numérotation par tenant, type de document, exercice et éventuellement établissement ;
- allocation atomique sans doublon en concurrence ;
- émission idempotente ;
- contrôle des prérequis juridictionnels ;
- snapshots complets et artefacts créés atomiquement ;
- impossibilité de modifier une facture émise ; toute correction passe par un document correctif autorisé.

## 5. Séquence d'implémentation

### Lot 1 — Renforcement de la facture existante
1. Contrat de brouillon et métadonnées documentaires.
2. Snapshot émetteur et enrichissement du snapshot client.
3. Lignes enrichies, remises/frais et calcul financier centralisé.
4. Séparation nette entre calcul provisoire et calcul fiscal autoritatif.
5. Numérotation configurable sans casser la séquence actuelle.
6. HTML client et PDF Unicode multipage professionnels.
7. Impression, aperçu, recherche, filtres et historique.
8. Tests de non-régression, API, PostgreSQL, sécurité et E2E.

### Lot 2 — Devis
1. Agrégat, numérotation, statuts et révisions.
2. Création/modification, envoi et suivi.
3. Acceptation, refus, expiration et audit.
4. Conversion idempotente en facture avec conservation des snapshots et références.

### Lot 3 — Pro forma
1. Agrégat commercial distinct, sans émission fiscale.
2. Rendu et mentions explicites « pro forma / non-fiscal ».
3. Conversion contrôlée vers devis ou facture selon politique produit.

### Lot 4 — Acomptes et soldes
1. Factures d'acompte avec référence à la commande/devis/opération source.
2. Paiements et allocations distincts.
3. Facture de solde calculée à partir des acomptes et crédits effectivement imputables.
4. Prévention du double comptage et tests de concurrence.

### Lot 5 — Corrections
1. Avoir partiel et total avec lignes/quantités/montants affectés.
2. Note de débit avec références et justification.
3. Effets fiscaux versionnés et validés selon juridiction.
4. Remboursement séparé de l'avoir et lié au paiement d'origine.

## 6. Critères de sortie du Lot 1

- Un utilisateur autorisé peut créer, modifier, consulter, filtrer, rechercher et archiver un brouillon dans son tenant.
- Le formulaire couvre les données documentaires nécessaires et plusieurs lignes avec unités, références, remises et frais.
- Tous les montants sont recalculés côté serveur avec Decimal et politique d'arrondi versionnée.
- Une règle fiscale absente, ambiguë ou non applicable bloque l'émission lorsque le snapshot fiscal est requis.
- L'émetteur et le client sont figés dans le snapshot d'émission.
- Les numéros sont uniques dans la portée de séquence configurée, même sous concurrence.
- Une clé d'idempotence rejouée ne duplique aucun effet.
- Une facture émise et ses artefacts ne peuvent pas être modifiés par les rôles ordinaires.
- HTML, PDF et impression préservent accents, caractères Unicode, longues descriptions et tableaux multipages.
- Les documents client n'exposent aucune donnée interne de diagnostic.
- Les lectures de documents sont autorisées par tenant et journalisées.
- Les tests couvrent autorisations, accès cross-tenant, brouillons obsolètes, émission concurrente, intégrité des artefacts, calculs et parcours E2E.
- Les résultats CI sont associés au SHA exact ; les migrations sont testées sur PostgreSQL jetable uniquement.

## 7. Garde-fous de livraison

- Base dédiée ZENOX Finance uniquement ; ne jamais cibler `zenoxfret_v2`.
- Migrations append-only ; aucun reset ni modification destructive.
- Ne pas exécuter de migration persistante sur Supabase/production dans cette phase.
- Ne pas modifier les documents déjà émis ni leurs snapshots historiques.
- Ne pas déclarer une fonctionnalité terminée sur la seule présence de fichiers ou de tables : les tests et preuves d'exécution sont nécessaires.
- Chaque lot doit être synchronisé entre GitHub et le checkout local, avec commit et SHA vérifiables.
