# ZENOX Finance — MVP international et stratégie de couverture

- Version : 1.0 — 19 octobre 2026
- Statut : document de cadrage à valider
- Produit : ZENOX Finance
- Dépôt : `sebsonz/zenox-finance-platform`
- Premier consommateur : ZENOX FRET V2
- Principe : architecture internationale dès le départ, livraison incrémentale, conformité démontrée juridiction par juridiction.

## 1. Vision

ZENOX Finance est une plateforme financière indépendante, multi-entreprise, API-first, destinée aux entreprises de différentes tailles et de différents pays pour créer, émettre, transmettre, recevoir, consulter et conserver leurs factures électroniques et documents financiers, suivre les paiements et utiliser des règles fiscales datées et versionnées.

ZENOX FRET V2 est le premier consommateur de ZENOX Finance, pas le propriétaire de son moteur. ZENOX Finance doit aussi pouvoir être vendu et utilisé directement par des entreprises sans lien avec ZENOX FRET.

La plateforme doit être conçue pour évoluer vers une couverture internationale. Une fonctionnalité générique ou un format de facture valide ne signifie pas, à lui seul, qu'une juridiction est juridiquement prise en charge ou que ZENOX détient une autorisation réglementaire.

## 2. Principe de progression « 10 % → 100 % »

Les 10 % représentent un premier incrément utilisable et cohérent, pas 10 % de conformité légale mondiale. Le socle initial doit inclure les abstractions internationales et les contrôles de qualité nécessaires pour éviter une refonte ultérieure.

La progression vers 100 % est mesurée séparément selon :
1. la couverture fonctionnelle du produit ;
2. la couverture des scénarios d'usage ;
3. la couverture des juridictions et régimes effectivement validés ;
4. la couverture des formats et réseaux d'échange ;
5. les validations, immatriculations ou certifications réellement obtenues ;
6. la fraîcheur des règles et versions de spécification.

Un pays n'est marqué « pris en charge en production » que si ses exigences ont une source officielle, une date d'effet, des tests représentatifs, une revue qualifiée et les autorisations requises pour le rôle exercé par ZENOX. Sinon, le statut est « recherche », « en développement » ou « expérimental », jamais « conforme ».

## 3. MVP complet : résultat attendu

Le MVP doit démontrer un cycle financier de bout en bout :
1. créer et configurer une entreprise ;
2. enregistrer ses clients, coordonnées, identifiants fiscaux et devises ;
3. définir les articles/services ou lignes libres ;
4. créer un brouillon de facture avec lignes, quantités, prix, remises, taxes, échéance et références ;
5. valider le document selon le profil de conformité activé ;
6. émettre la facture avec numéro attribué par le serveur, instantané immuable du document et des règles appliquées ;
7. produire une représentation lisible et un document électronique structuré lorsque le profil activé le permet ;
8. enregistrer un paiement et l'allouer à une ou plusieurs factures ;
9. exposer les montants payés, le solde et l'état de règlement ;
10. corriger par avoir ou document correctif contrôlé, sans réécrire une facture émise ;
11. retrouver toutes les actions dans l'audit ;
12. permettre à ZENOX FRET d'effectuer ces opérations par API versionnée, authentifiée, autorisée et idempotente.

## 4. Périmètre MVP — obligatoire

### 4.1 Identité, entreprises et sécurité
- Identité de plateforme et authentification utilisateur.
- Entreprises/tenants, membres, rôles et permissions.
- Isolation stricte multi-tenant et contrôle côté serveur.
- Comptes de service d'intégration avec scopes limités, rotation/révocation des secrets et périmètre tenant explicite.
- Journal d'audit des actions sensibles.
- Gestion des états PENDING, ACTIVE, SUSPENDED et DISABLED.
- Aucun tenant, rôle ou statut de validation accepté sur la seule base d'un champ fourni par le navigateur.

### 4.2 Référentiels
- Clients et fournisseurs.
- Coordonnées et adresses structurées.
- Identifiants légaux et fiscaux, pays d'émission et statut de vérification.
- Devises ISO 4217, précision monétaire issue d'un référentiel central.
- Articles/services facultatifs, unités, catégories, descriptions et codes externes.
- Dates, fuseaux horaires, langues, pays et adresses sans hypothèse monocountry.

### 4.3 Factures et avoirs
- Brouillon, validation, émission, envoi, acceptation/rejet technique, annulation/correction selon le droit applicable.
- Lignes, quantité, prix unitaire, remises, frais, références, conditions de paiement et échéances.
- Totaux exacts, sous-totaux, bases imposables, taxes par catégorie, retenues distinctes, total dû.
- Numérotation contrôlée côté serveur, séquences configurables par entreprise et profil réglementaire, sans collisions concurrentes.
- Snapshots immuables de la facture émise, des données des parties, de la devise, du calcul, des règles et des formats utilisés.
- Avoirs et corrections reliés au document source ; pas de modification silencieuse d'une facture émise.
- Prévisualisation avant émission, rendu PDF lisible, téléchargement et accès autorisé.
- États du document, du paiement et de la transmission conservés séparément.

### 4.4 Paiements et soldes
- Enregistrement des paiements (ne signifie pas nécessairement traitement/acquisition de paiement).
- Allocation totale ou partielle aux factures.
- Paiement non affecté, paiements partiels, trop-perçu et remboursement selon politiques définies.
- Solde restant, échéance, statut de règlement et historique.
- Idempotence et protection contre double allocation ou double callback.
- Rapprochement automatisé et intégration PSP : hors MVP de base sauf connecteur explicitement choisi.

### 4.5 Fiscalité
- Juridictions hiérarchiques et règles versionnées avec dates d'effet, catégorie, priorité, type, traitement, source et statut.
- Calcul déterministe avec arithmétique décimale exacte et politique d'arrondi versionnée.
- Taxe incluse/exclue, composition uniquement selon une politique explicite et testée.
- Conditions d'applicabilité structurées et strictement validées ; aucune exécution de code ou SQL provenant des règles.
- Tax snapshots immuables.
- Règles globales gérées par la plateforme ; overrides entreprise limités et isolés.
- Revue et validation avant activation d'une règle de production.
- Le MVP ne doit activer que les règles juridictionnelles documentées et validées.
- Barèmes, seuils, montants fixes, prorata, retenues complexes et déclarations fiscales ne sont pas réputés pris en charge sans implémentation et tests dédiés.

### 4.6 Facturation électronique et conformité
- Modèle canonique indépendant des formats nationaux.
- Couche d'adaptateurs pour formats structurés, validations, transmissions et statuts.
- Versionnement des schémas, règles de validation, listes de codes et connecteurs.
- Registre de conformité par juridiction : exigences, source officielle, version, date d'effet, statut de revue, tests et approbateur.
- Gestion des accusés, rejets, reprises, délais et corrélations dès que le connecteur le permet.
- PDF seul ne constitue pas une facture électronique structurée lorsqu'un régime exige un format structuré.
- Les fonctions de transmission réglementaire sont désactivées tant que l'autorisation ou l'intermédiaire requis n'est pas en place.

### 4.7 API et intégration
- API versionnée, contrat documenté et erreurs normalisées.
- Authentification utilisateur et service distinctes ; aucun secret d'intégration dans le navigateur.
- Autorisation tenant et scopes à chaque opération.
- Idempotency keys pour les écritures financières.
- Correlation ID, pagination, limites, timeouts et politique de retry.
- Webhooks signés, réessais contrôlés et déduplication lorsque implémentés.
- Adapter ZENOX FRET utilisant les identifiants de Finance, sans duplication du moteur ou des tables Finance dans FRET.

### 4.8 Exploitation
- Configuration validée au démarrage.
- Secrets gérés hors du dépôt.
- Sauvegardes et tests de restauration avant production.
- Logs structurés sans secrets ni données inutiles.
- Surveillance des erreurs, des délais et des transmissions.
- Migrations versionnées et contrôle de dérive.
- Tests unitaires, intégration PostgreSQL jetable, autorisation, multi-tenant, idempotence, concurrence et contrats API.
- Aucun changement de migration Finance appliqué à la base ZENOX FRET.

## 5. Architecture cible

1. **Core Platform** : entreprises, identité, rôles, audit, configuration.
2. **Canonical Financial Model** : parties, produits/services, factures, avoirs, paiements, allocations, documents.
3. **Calculation Engines** : calculs monétaires, fiscalité, arrondis et règles métier versionnés.
4. **Compliance Packs** : règles par pays/régime, formats, validateurs, listes de codes et dates d'effet.
5. **E-Invoicing Gateway** : adaptateurs de transmission, annuaire, accusés, statuts et e-reporting quand requis.
6. **Integration API** : consommateurs produits, webhooks, idempotence, scopes et contrats.
7. **Operations & Governance** : observabilité, audit, sécurité, gestion de versions, preuves et revue de conformité.

Les couches nationales ne doivent pas être codées directement dans les règles centrales de facturation. Les adaptateurs nationaux doivent pouvoir évoluer sans casser le contrat canonique.

## 6. Ce qui est hors MVP mais doit être prévu dans l'architecture

- Grand livre général complet et comptabilité en partie double.
- États financiers et clôtures.
- Déclarations fiscales et télédéclarations.
- Comptabilité analytique avancée.
- Paie.
- Gestion complète des achats/approvisionnements.
- Paiement en ligne/acquisition de fonds et conservation de fonds.
- Recouvrement avancé, relances multicanales et scoring.
- OCR, capture automatique et extraction de factures fournisseurs.
- Consolidation multi-entités, intercompany et multi-livres.
- Réseaux de transmission nationaux supplémentaires.
- Signature qualifiée, archivage légal certifié ou horodatage qualifié lorsqu'ils sont exigés.
- Statut d'opérateur réglementé/plateforme agréée : programme séparé, conditionné par le droit et les capacités de l'organisation.

Ces fonctions ne doivent pas être présentées comme présentes tant qu'elles n'ont pas été implémentées et testées.

## 7. Critères d'acceptation du MVP

Le MVP n'est accepté que lorsque les scénarios suivants sont démontrés :
- Deux tenants ne peuvent ni lire ni modifier les données l'un de l'autre.
- Un utilisateur sans permission ne peut pas créer, émettre ou consulter un document non autorisé.
- Une requête répétée avec la même clé d'idempotence ne crée aucun effet financier dupliqué.
- Les montants sont reproductibles, précis et testés aux limites d'arrondi.
- Une facture émise et son snapshot ne peuvent pas être réécrits.
- Un avoir est lié à la facture d'origine et suit une politique explicite.
- Paiements et allocations ne dépassent pas les montants autorisés.
- Le rendu documentaire correspond au snapshot émis.
- Les erreurs de validation indiquent le champ et la règle en échec sans divulguer de données sensibles.
- Les règles expirées, futures, inconnues ou ambiguës ne sont pas appliquées silencieusement.
- Les formats structurés sont validés avec les artefacts de la version annoncée.
- Une juridiction non activée ne peut pas être présentée comme juridiquement prise en charge.
- Le consommateur ZENOX FRET peut créer/consulter une facture, enregistrer un paiement et lire le solde via l'API, sans accéder à la base Finance.
- CI applique les migrations uniquement à PostgreSQL jetable, exécute tests, typecheck, build et drift check.
- Les procédures de sauvegarde/restauration, incidents et rotation des secrets sont documentées avant production.

## 8. Plan d'extension 10 % → 100 %

Chaque incrément suit : recherche officielle → exigences → conception → implémentation → tests → revue qualifiée si nécessaire → validation de conformité → activation → surveillance et mise à jour.

Les pourcentages ne sont pas calculés sur une impression générale. Le tableau de bord doit montrer séparément :
- modules livrés et acceptés ;
- scénarios d'usage testés ;
- juridictions en recherche/développement/test/production ;
- formats validés et versions supportées ;
- connecteurs testés et actifs ;
- validations officielles obtenues, avec date et périmètre ;
- règles et spécifications à réexaminer avant expiration ou changement.

## 9. Gouvernance des règles et des normes

Chaque règle, format et adaptateur doit enregistrer : identifiant, juridiction, source primaire, URL/référence, version, date de publication, date d'effet, date de vérification, statut, reviewer, tests, compatibilité et date de prochaine revue. L'identité du reviewer provient du contexte authentifié, jamais d'un champ libre envoyé par le client.

Un changement de norme doit déclencher une analyse d'impact, des tests de non-régression et une activation contrôlée. Les snapshots historiques conservent la version effectivement utilisée.

## 10. Décisions à valider avant de qualifier le MVP de complet

- Les juridictions initiales exactes et leur ordre de livraison.
- Le rôle réglementaire visé pour chaque pays : logiciel, solution compatible, connecteur via opérateur autorisé, ou opérateur lui-même.
- La liste exacte des documents électroniques MVP.
- Le niveau de comptabilité inclus dans le MVP (le grand livre complet reste hors MVP selon le cadrage actuel).
- Le périmètre des paiements : enregistrement/allocation ou initiation/encaissement via PSP.
- Les règles de conservation et exigences de sécurité propres aux marchés retenus.
- Le budget et la responsabilité des avis fiscaux/juridiques locaux.

## 11. Sources et limites

Les normes et obligations changent. Les sources officielles consultées au cadrage incluent :
- OpenPeppol, Peppol BIS Billing 3.0 et règles : https://docs.peppol.eu/poacc/billing/3.0/
- Commission européenne, VAT in the Digital Age : https://taxation-customs.ec.europa.eu/taxation/vat/vat-digital-age-vida_en
- France, plateformes agréées : https://www.impots.gouv.fr/facturation-electronique-et-plateformes-agreees
- DGI Bénin, guide de facturation normalisée : https://api.impots.bj/media/62b9ccd77489a_GUIDE%20DE%20FACTURATION%20NORMALIS%C3%89E.pdf
- DGI Bénin, Code général des impôts et doctrine publiés : https://api.impots.bj/

Ces sources fondent des exigences initiales, pas une certification globale. Chaque pack de juridiction doit être revu à partir des textes et spécifications en vigueur à sa date d'activation.
