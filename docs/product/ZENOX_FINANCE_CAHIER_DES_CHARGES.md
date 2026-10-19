# ZENOX Finance — Cahier des charges fonctionnel, technique et conformité

- Version : 1.0 — 19 octobre 2026
- Statut : cahier des charges de référence initial, à valider par décision de produit
- Produit indépendant : ZENOX Finance
- Premier consommateur : ZENOX FRET V2
- Documents liés :
  - [MVP international](./ZENOX_FINANCE_MVP_INTERNATIONAL.md)
  - [Audit initial de l'existant](./ZENOX_FINANCE_EXISTING_STATE_AUDIT.md)

## 1. Objet et ambition

Construire une plateforme indépendante de facturation électronique et de services financiers pour les entreprises, conçue pour évoluer vers plusieurs pays et régimes de conformité. Elle doit fournir un moteur canonique de facturation, calculs fiscaux, documents, paiements enregistrés, soldes, audit et API. Elle ne doit pas dépendre de ZENOX FRET ni d'un fournisseur de facturation tiers pour son cœur métier.

L'ambition est internationale dès la conception. La prise en charge effective d'un pays dépend cependant de la validation de ses textes, spécifications, scénarios, interfaces et autorisations nécessaires. Le terme « international » décrit l'architecture et la stratégie d'expansion, pas une certification mondiale déjà obtenue.

## 2. Objectifs produit

1. Donner à toute entreprise admissible la possibilité de gérer son cycle de facturation dans les juridictions activées.
2. Produire des documents lisibles et structurés selon les profils supportés.
3. Calculer les montants avec exactitude, traçabilité et règles datées.
4. Gérer factures, avoirs, paiements enregistrés, allocations et soldes.
5. Fournir une API sécurisée à ZENOX FRET et à de futurs produits ZENOX.
6. Évoluer par packs de conformité, sans réécrire le cœur du produit.
7. Maintenir les documents émis et les snapshots historiques immuables.
8. Rendre les limites de couverture visibles et empêcher les déclarations de conformité non démontrées.

## 3. Utilisateurs et acteurs

- Administrateur de plateforme : gère le produit, les références globales et les paramètres de gouvernance autorisés.
- Administrateur d'entreprise : configure l'entreprise, ses utilisateurs et ses paramètres.
- Responsable financier : crée, valide, émet et suit les documents selon permissions.
- Opérateur financier : prépare les documents et enregistre les opérations autorisées, sans pouvoir nécessairement émettre.
- Lecteur/auditeur : accès en lecture limitée.
- Service consommateur : application serveur comme ZENOX FRET, autorisée par scopes et tenants.
- Moteur système : tâches de génération, transmission, callbacks et maintenance contrôlée.
- Reviewer conformité : personne autorisée à vérifier une règle, un pack ou un changement de norme.
- Opérateur de transmission externe : plateforme/réseau réglementaire lorsqu'un tel intermédiaire est nécessaire.

Les rôles doivent être implémentés selon le modèle d'autorisation existant et une matrice de permissions explicite. Aucun rôle ne doit être inventé ou accordé implicitement par défaut.

## 4. Périmètre fonctionnel détaillé

### 4.1 Gestion des entreprises et accès
- Création, onboarding, activation, suspension et désactivation.
- Profil légal : nom, adresse, pays, identifiants légaux/fiscaux, devise par défaut et paramètres régionaux.
- Membres, invitations, rôles et permissions.
- Comptes d'intégration distincts des utilisateurs humains.
- Scopes, limitation à un ou plusieurs tenants, révocation et rotation des credentials.
- Journaux d'audit sur opérations sensibles.
- Isolement des données par tenant au niveau API et base.
- Aucun secret d'intégration transmis ou conservé dans le navigateur.

### 4.2 Référentiels métier
- Clients et fournisseurs avec adresses et identifiants locaux/internationaux.
- Produits/services, unités, catégories et codes externes.
- Devises et précision monétaire centralisées.
- Langue, pays, fuseau horaire et format d'affichage configurables.
- Références de commandes, contrats, bons de livraison et systèmes sources.
- Conservation d'un snapshot des données de partie présentes au moment de l'émission.

### 4.3 Facturation
- Création, modification et suppression contrôlée de brouillons.
- Validation métier et réglementaire avant émission.
- Attribution atomique d'un numéro selon la série, la période et la juridiction configurées.
- Factures de vente, factures d'acompte si profil supporté, avoirs et documents correctifs définis par le pack.
- Lignes, quantités, prix, remises, frais, descriptions, références et échéances.
- Calculs ligne/document avec règles d'arrondi explicites.
- États distincts : brouillon, validé, émis, transmis, accepté/rejeté, annulé/corrigé selon le droit.
- Le statut de transmission ne doit pas être confondu avec l'émission juridique.
- Une facture émise est immuable ; une correction crée un document lié.
- Génération de rendu lisible et format structuré lorsque disponible.
- Téléchargement/consultation autorisés, audit des accès sensibles.
- Recherche et pagination sans fuite inter-tenant.

### 4.4 Fiscalité et calcul
- Modèle de taxe extensible : type, traitement, juridiction, taux ou formule prise en charge, catégorie, date d'effet, priorité, composition et source.
- Moteur déterministe à précision décimale, politique d'arrondi versionnée.
- Conditions typées sur faits métier autorisés ; aucun code, expression SQL ou fonction arbitraire fourni par un administrateur.
- Différenciation entre taxe collectée, retenue, acompte d'impôt, crédit récupérable, coût non récupérable et coût douanier.
- Prise en compte de la date fiscale, statut d'enregistrement, type d'opération, pays et catégories lorsque ces faits sont requis par la règle.
- Règles globales contrôlées par la plateforme ; overrides tenant limités, auditables et soumis aux permissions.
- Gestion des chevauchements, conflits, règles absentes et règles inconnues : refus explicite ou chemin de revue, jamais application silencieuse d'une règle non justifiée.
- Snapshots des inputs, règles et outputs.
- Les seuils, barèmes, taxes composées complexes, taxes fixes et déclarations restent non supportés jusqu'à implémentation et tests explicites.

### 4.5 Paiements, allocations et soldes
- Enregistrer les paiements, moyens/références, dates, devise et statut.
- Allouer partiellement ou totalement un paiement à des factures.
- Gérer solde, reste à payer, paiements non affectés, trop-perçus et remboursements selon politiques explicites.
- Empêcher allocation supérieure au paiement disponible ou à la créance restante.
- Réconcilier les notifications externes de manière idempotente.
- Séparer l'enregistrement d'un paiement de l'initiation/acquisition de paiement.
- Connecteurs de paiement ajoutés séparément avec exigences réglementaires, sécurité et tests.

### 4.6 Documents et conservation
- PDF et formats structurés versionnés.
- Stockage des références, hash/intégrité lorsque requis, métadonnées, versions et permissions d'accès.
- Snapshots documentaires immuables pour documents émis.
- Règles de conservation, suppression et archivage déterminées par juridiction et contrat.
- Gestion des documents liés : commande, contrat, preuve de livraison, facture d'origine et avoir.
- Signature, horodatage qualifié ou archivage certifié uniquement si implémentés et autorisés.

### 4.7 Facturation électronique et conformité par pays
Chaque pack juridictionnel doit définir :
- pays, sous-juridiction et régime d'application ;
- texte officiel et références normatives ;
- date de publication, date d'effet, date de revue et prochaine échéance de revue ;
- types d'entités, transactions et documents couverts ;
- champs obligatoires, identifiants et règles de numérotation ;
- traitements fiscaux, arrondis, bases imposables et cas d'exemption ;
- formats structurés et versions de schémas ;
- règles de validation et artefacts exacts utilisés ;
- transmission, annuaire, signatures, accusés et rapports exigés ;
- stratégie de panne, file de reprise et continuité autorisée ;
- conservation, audit et exigences de sécurité ;
- tests positifs/négatifs et exemples ;
- reviewer et statut de validation ;
- autorisations requises pour ZENOX, son partenaire ou son opérateur.
Les règles de pays ne sont activées que si les éléments nécessaires sont documentés et acceptés.

### 4.8 API et intégrations
- API REST versionnée avec OpenAPI ou contrat équivalent.
- Contrat d'erreur stable, validation stricte et compatibilité explicite.
- Idempotence pour les opérations de création/émission/paiement/allocation.
- Scopes et permissions par opération et tenant.
- Pagination, filtres, correlation IDs, limites, timeouts, retries.
- Webhooks signés et déduplication lorsque supportés.
- Gestion des versions et période de dépréciation.
- Adaptateur ZENOX FRET distinct, sans accès direct à la base Finance.
- Le système source peut fournir des références métier, mais Finance reste autoritaire sur numéro, statut, montants, taxes, document et solde de facture Finance.

### 4.9 Frontend
- Portail web utilisable indépendamment de ZENOX FRET.
- Tableau de bord, clients, factures, avoirs, paiements, soldes, documents, paramètres, membres et audit selon droits.
- Prévisualisation avant émission et erreurs de validation explicites.
- États de transmission et actions de reprise visibles aux rôles autorisés.
- Interface localisable et accessible.
- Le frontend ne calcule pas autoritairement les taxes ou montants finaux.
- Aucune donnée d'un autre tenant ne doit être rendue, même dans les recherches ou les erreurs.

### 4.10 Exploitation et sécurité
- Configuration et validation des variables au démarrage.
- Secrets hors dépôt, rotation et révocation.
- RLS forcée et rôle runtime non-superuser/non-BYPASSRLS pour les tables tenant-scoped.
- Contrôle d'accès côté serveur et défense en profondeur.
- Transactions, contraintes, idempotence et protection contre concurrence.
- Journaux structurés sans secrets, tokens ou données de paiement excessives.
- Monitoring, alertes, sauvegarde, restauration, réponse aux incidents.
- Gestion des vulnérabilités et dépendances, SBOM et revue de sécurité selon maturité.
- Migrations uniquement sur la base ZENOX Finance.
- CI avec PostgreSQL jetable, tests, typecheck, build, drift check et tests de sécurité.
- Tests de reprise et de charge avant production.

## 5. Exigences non fonctionnelles

- Exactitude financière : aucune arithmétique monétaire basée sur flottants binaires.
- Atomicité : émission, numéro, snapshots et effets associés doivent être cohérents.
- Idempotence : retries et callbacks ne dupliquent pas les effets.
- Isolation : accès inter-tenant refusé par défaut.
- Auditabilité : opérations sensibles traçables par acteur, action, ressource, date et corrélation.
- Évolutivité : nouveaux pays et formats ajoutables par modules/versionnement.
- Maintenabilité : contrats API documentés, tests de non-régression et règles métier séparées des adaptateurs.
- Résilience : erreurs externes visibles, reprises contrôlées, aucun statut de succès fictif.
- Observabilité : métriques d'émission, échecs, latence, transmissions et drift.
- Accessibilité et internationalisation : locales, fuseaux, devises, formats et caractères Unicode.
- Confidentialité : minimisation, rétention et droits d'accès adaptés au cadre juridique applicable.
- Portabilité : données exportables dans des formats documentés et stratégie de sortie.
- Mise à jour réglementaire : versions historisées, analyse d'impact, tests et date de prise d'effet.

Les objectifs chiffrés de disponibilité, RPO/RTO, latence, volumétrie et conservation devront être décidés avant le lancement de production ; ils ne sont pas supposés dans ce document.

## 6. Modèle de données logique (cible, pas inventaire de tables existantes)

Les entités suivantes représentent les concepts à couvrir. Elles ne signifient pas qu'une table portant exactement ce nom existe déjà.

- Tenant, TenantMember, Role, Permission, IntegrationPrincipal, CredentialRotation.
- Customer/Supplier/Party, PartyAddress, TaxIdentifier, Product/Service, Unit, Currency.
- Invoice, InvoiceLine, InvoicePartySnapshot, InvoiceNumberSequence, CreditNote, DocumentReference.
- TaxJurisdiction, TaxRule, TaxRuleVersion, TaxApplicabilityCondition, TaxSourceEvidence, TaxReview, TaxCalculationSnapshot.
- Payment, PaymentAllocation, Refund, ReconciliationItem.
- DocumentArtifact, DocumentVersion, Transmission, TransmissionAttempt, Acknowledgement, RegulatorySubmission.
- CompliancePack, ComplianceRequirement, SpecificationVersion, ValidationArtifact, JurisdictionRelease.
- AuditEvent, IdempotencyRecord, WebhookSubscription, WebhookDelivery, IntegrationMapping.
- OperationalMetric, Incident, Backup/RestoreEvidence (outils opérationnels à déterminer).

Les clés tenant, contraintes, index, clés étrangères, RLS et invariants doivent être conçus à partir des flux réels et des migrations déjà présentes, sans recréer des concepts qui existent.

## 7. États et invariants

### Facture
- Brouillon modifiable selon permissions.
- Émise : contenu et calcul immuables.
- Transmise : statut distinct, peut échouer/retry indépendamment du statut d'émission.
- Acceptée/rejetée : résultat de la validation ou du réseau externe, jamais inventé.
- Corrigée/annulée : transition permise uniquement par politique documentée, avec lien vers l'opération corrective.

### Paiement
- Enregistré, partiellement affecté, affecté, annulé/contrepassé selon politique.
- Les allocations ne peuvent dépasser le paiement non affecté ni le solde de la facture.
- Les opérations de paiement sont auditables et idempotentes.

### Règle fiscale
- Brouillon, en revue, approuvée, active, remplacée/retirée selon workflow défini.
- Les règles actives utilisées par des documents ne sont jamais modifiées rétroactivement.
- Une nouvelle règle/version doit comporter source, période, tests et revue adaptés.
- Une règle manquante ou ambiguë provoque un échec explicite ou une revue, pas une estimation silencieuse.

### Pack de conformité
- Recherche, spécification en cours, implémentation, tests, revue locale, prêt à activation, actif, suspendu, obsolète.
- Chaque transition a des critères et un responsable.

## 8. Sécurité et permissions minimales

- Les utilisateurs agissent selon rôle/permission et membership de tenant.
- Les services agissent selon credential, scopes et tenants autorisés.
- Les règles de référence globales sont modifiables uniquement par un workflow plateforme protégé.
- Les reviewers ne peuvent pas attribuer leur identité par un champ de requête.
- Les accès aux documents, PDFs, exports, avoirs et journaux sensibles sont audités.
- Les tokens ne sont jamais écrits dans les logs.
- Les appels de webhook vérifient signature, fraîcheur et déduplication.
- Les erreurs d'autorisation ne révèlent pas l'existence d'une ressource d'un autre tenant.
- Toute élévation de privilège et tout changement de règle fiscale doit être journalisé.

## 9. Stratégie de test et validation

### Unitaires
- calculs, arrondis, conditions, priorité, numérotation, transitions, schémas et formatage.

### Intégration PostgreSQL jetable
- migrations dans l'ordre, contraintes, RLS, rôle runtime, transactions, idempotence, concurrence, drift.

### Sécurité
- accès inter-tenant, permissions, scopes, credential révoqué, injection, mass assignment, exposition de secrets, accès documents.

### Contrats et API
- schémas d'entrée/sortie, compatibilité versions, erreurs, pagination, limites, webhooks.

### End-to-end
- cycle facture → émission → PDF/format structuré → paiement → allocation → solde → avoir → audit.
- parcours du portail utilisateur et parcours service de ZENOX FRET.
- échecs réseau, retries, doublons et transitions invalides.

### Conformité
- validateurs de référence et artefacts versionnés.
- cas officiels ou revus par expert.
- tests à la date d'effet, avant/après changement, cas limites et cas négatifs.
- résultats conservés comme preuves et liés à la version du pack.

Aucun test ne doit être présenté comme passé sans résultat CI ou exécution enregistrée.

## 10. Conformité, certifications et rôle réglementaire

ZENOX doit distinguer :
1. génération d'un document lisible ;
2. génération d'un format structuré valide ;
3. compatibilité technique avec une spécification ;
4. transmission via un opérateur ou réseau autorisé ;
5. statut officiel/certification/immatriculation de ZENOX lui-même.

Le produit peut choisir, pays par pays, de fonctionner comme logiciel de facturation compatible, de se connecter à un opérateur autorisé ou de demander une autorisation propre. Cette décision doit être fondée sur le droit actuel, les coûts, les capacités opérationnelles et le modèle commercial. Elle ne doit pas être supposée universelle.

## 11. Références réglementaires initiales à maintenir à jour

- OpenPeppol BIS Billing 3.0 : https://docs.peppol.eu/poacc/billing/3.0/
- OpenPeppol PINT EU : https://docs.peppol.eu/poac/eu/pint-eu/
- Commission européenne ViDA : https://taxation-customs.ec.europa.eu/taxation/vat/vat-digital-age-vida_en
- France — plateformes agréées : https://www.impots.gouv.fr/facturation-electronique-et-plateformes-agreees
- DGI Bénin — guide de facturation normalisée : https://api.impots.bj/media/62b9ccd77489a_GUIDE%20DE%20FACTURATION%20NORMALIS%C3%89E.pdf
- DGI Bénin — doctrine et textes : https://api.impots.bj/

Ces références sont une base de recherche, pas une liste exhaustive ni une garantie que les exigences citées sont toutes à jour pour chaque scénario. Le responsable de chaque pack doit confirmer la version applicable à la date de livraison.

## 12. Gouvernance du cahier des charges

Toute exigence doit porter :
- ID stable ;
- domaine ;
- description vérifiable ;
- priorité (MUST/SHOULD/COULD) ;
- phase (MVP/extension) ;
- source ou décision produit ;
- statut (à auditer, existant non vérifié, partiel, implémenté non validé, validé, bloqué, hors périmètre) ;
- lien code/test/migration ;
- preuve d'acceptation ;
- responsable et date de revue.

Aucune exigence n'est marquée « validée » uniquement parce qu'un fichier existe. Il faut un test ou une preuve pertinente, et pour la conformité une source et une revue adaptées.

## 13. Définition de terminé

Une fonctionnalité est « terminée » lorsque :
1. son exigence est couverte ;
2. le contrat est documenté ;
3. les contrôles de sécurité et d'autorisation sont implémentés ;
4. les tests unitaires et d'intégration pertinents passent ;
5. les migrations sont validées sur base jetable et le drift check passe ;
6. le comportement frontend/API est testé selon son périmètre ;
7. les logs et l'audit sont suffisants ;
8. la documentation/checkpoint est mise à jour ;
9. les limites restantes sont explicites ;
10. aucune affirmation de conformité supérieure aux preuves n'est faite.
