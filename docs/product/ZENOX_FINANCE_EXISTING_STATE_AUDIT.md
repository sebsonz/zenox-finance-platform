# ZENOX Finance — audit initial de l'existant par rapport au MVP international

- Date : 19 octobre 2026
- Branche documentaire : docs/international-mvp-and-requirements
- Base de comparaison : dépôt GitHub et documents récupérés, état de travail connu jusqu'au 19 octobre 2026.
- Statut : audit documentaire initial, pas encore un audit exhaustif de tous les fichiers, endpoints, tests et schémas.
- Règle : « présent dans le code » ne veut pas dire « validé », « déployé » ou « conforme légalement ».

## 1. Légende des statuts

- **Présent documenté** : contrat ou code identifié dans les sources inspectées.
- **Partiel / en cours** : fondation présente, couverture incomplète ou travaux en cours.
- **À vérifier** : preuve insuffisante.
- **Non démontré / à construire** : aucun élément probant trouvé dans les sources inspectées.
- **Hors MVP initial** : explicitement prévu pour une phase ultérieure.
- **Validation juridictionnelle requise** : sources officielles à jour, tests adaptés et revue locale requis.

Les statuts sont provisoires. Une exigence ne devient « validée » qu'après examen des fichiers et tests pertinents, résultat de CI et, si nécessaire, preuve de conformité externe.

## 2. État général vérifié

Le README décrit une plateforme indépendante avec API versionnée, tenants, factures, lignes, taxes/snapshots, numérotation, paiements, allocations, soldes, audit et intégration ZENOX FRET. Il précise explicitement que la première livraison ne constitue pas une conformité fiscale mondiale.

Le document docs/architecture/INTERNATIONAL_TAX_ENGINE.md décrit des juridictions hiérarchiques, règles versionnées, calculs décimaux, snapshots immuables et checklist d'activation. Il énumère également des lacunes : taux officiels mondiaux, nexus/lieu de taxation, seuils d'immatriculation, déclaration fiscale, classification douanière, conventions, certificats de retenue, clearance de facture électronique et certification juridique.

Le 19 octobre 2026, la branche feature/tax-rule-extensibility et la PR brouillon #10 ajoutent des conditions d'applicabilité strictes, une priorité après filtrage des conditions, des métadonnées comptables et des données de revue. La CI de cette branche n'a pas été confirmée à la dernière vérification. La migration ajoutée n'a pas été appliquée à une base persistante.

La documentation précédente signale que, sur une configuration de tests du 17 octobre, 25 suites et 120 tests ont réussi, tandis que 9 suites/27 tests d'intégration étaient ignorés en raison de la configuration. Ces résultats ne valident ni l'ensemble du produit, ni la branche documentaire actuelle, ni une juridiction particulière.

## 3. Matrice d'état fonctionnel

| ID | Domaine / exigence | État provisoire | Preuve ou emplacement | Écart / action nécessaire |
|---|---|---|---|---|
| GOV-01 | Vision indépendante et intégration FRET par API | Présent documenté | README.md | Vérifier l'ensemble des contrats API et l'absence de dépendance de données |
| GOV-02 | Roadmap mesurable 10 % → 100 % | À formaliser | MVP et cahier des charges | Définir dénominateur, jalons, états et preuves |
| TEN-01 | Tenant et isolation multi-entreprise | Partiel / à vérifier | Migration finance_foundation | Audit de toutes les tables, policies, rôles runtime, tests négatifs |
| TEN-02 | Utilisateurs, membres, rôles et permissions | À vérifier | Routes/services de l'application | Établir la matrice complète et les tests d'autorisation |
| INT-01 | Identités de service et scopes | Présent documenté | finance_integration_principals | Auditer rotation, révocation, limitation des scopes et endpoints |
| AUD-01 | Journal d'audit | Présent documenté | finance_audit_events | Vérifier exhaustivité, attribution acteur, accès, rétention et secrets |
| IDEM-01 | Idempotence | Présent documenté | finance_idempotency_keys, README | Tester concurrence, reprise, états échoués et opérations métier |
| INV-01 | Factures multi-lignes | Présent dans la branche de travail selon PR #5/#9 | PR #5 et PR #9 | Vérifier code exact, tests, erreurs et workflow complet |
| INV-02 | Émission idempotente et numérotation | Partiel / à vérifier | PR #5 et README | Tester concurrence, séries, changement de période, collisions |
| INV-03 | Avoirs / notes de crédit | Présent partiel selon PR #5/#9 | PR #5, PR #9 | Vérifier toutes transitions et règles par juridiction |
| INV-04 | Facture émise immuable | Partiel / à vérifier | README et doc fiscal | Prouver immutabilité du document complet, parties, lignes et rendu |
| DOC-01 | PDF / documents HTML et accès audités | Présent partiel selon PR #9 | PR #9 et code documents facture | Vérifier rendu, accès tenant, hash, versions et stockage |
| PAY-01 | Paiements enregistrés | Présent documenté dans le périmètre | README | Vérifier endpoints, transactions, doublons et audit |
| PAY-02 | Allocations et soldes | Présent documenté dans le périmètre | README | Vérifier limites, allocations partielles, trop-perçus, remboursements |
| PAY-03 | Initiation de paiement / PSP | Hors MVP initial ou à décider | MVP | Décider si le MVP se limite à enregistrer les paiements |
| CUR-01 | Référentiel devises / précision | Présent dans l'architecture/code selon README et service taxe | currencyRepository, README | Vérifier codes, minor units, historique et arrondis |
| TAX-01 | Moteur fiscal décimal | Présent documenté | INTERNATIONAL_TAX_ENGINE.md | Auditer tests, calculs inclus/exclus, composition et cas limites |
| TAX-02 | Juridictions hiérarchiques | Présent documenté | INTERNATIONAL_TAX_ENGINE.md | Vérifier schéma, données et requêtes |
| TAX-03 | Règles versionnées avec dates d'effet | Présent documenté | doc fiscal et repository | Ajouter tests frontières de dates et chevauchements |
| TAX-04 | Snapshots fiscaux immuables | Présent documenté | Migration immutable_tax_calculation_snapshots | Confirmer migration, trigger, permissions et tests sur PostgreSQL jetable |
| TAX-05 | Conditions fiscales structurées | En cours — PR #10 brouillon | schema/service taxe et PR #10 | CI non confirmée, tests intégration et compatibilité à valider |
| TAX-06 | Sens comptable distinct de la famille fiscale | En cours — PR #10 brouillon | Migration tax_rule_extensibility | Valider calculs et traitement de l'AIB avant règle activée |
| TAX-07 | Administration/versionnement/approbation des règles | Non démontré / à construire | Checkpoint taxe | API protégée, audit, nouvelles versions, approbation, reviewer serveur |
| TAX-08 | Taux officiels, seuils, lieu de taxation, déclarations, douanes | Non démontré / à construire | INTERNATIONAL_TAX_ENGINE.md | Construire par besoin et juridiction, revue professionnelle |
| EINV-01 | Modèle canonique indépendant des formats | Partiel / à spécifier formellement | README et MVP proposé | Définir modèle, mapping et champs de correspondance |
| EINV-02 | Formats structurés internationaux/nationaux | Non démontré / à construire | Aucun pack validé trouvé | Choisir formats cibles, schémas versionnés, validateurs et fixtures |
| EINV-03 | Transmission/accusés/rejets/reprise | Non démontré / à construire | Aucun connecteur réglementaire vérifié | Définir gateway et statut distinct de la facture |
| EINV-04 | Autorisations de transmission par pays | Validation juridictionnelle requise | Sources officielles par pays | Choisir logiciel compatible, connecteur autorisé ou demande d'agrément |
| COM-01 | Registre des packs de conformité et sources | À formaliser | MVP et cahier des charges | Créer entités et workflow de validation/versionnement |
| API-01 | API versionnée | Présent documenté | README | Audit exhaustif OpenAPI, auth, erreurs, scopes et compatibilité |
| API-02 | Adaptateur FRET sans accès DB direct | Objectif documenté | README | Prouver par code, contrats et test end-to-end |
| UI-01 | Portail indépendant complet | Partiel / à vérifier | Frontend existant | Audit des pages, permissions, accessibilité et scénarios E2E |
| SEC-01 | RLS forcée et rôle runtime least-privilege | Fondations documentées ; couverture à auditer | Migrations fondation et tests DB | Vérifier toutes tables et privilèges, pas seulement la fondation |
| OPS-01 | Migrations et drift check | Présent dans l'outillage | Scripts backend et CI | CI actuelle doit passer sur la branche, base jetable uniquement |
| OPS-02 | Sauvegarde/restauration et incidents | À vérifier / formaliser | Preuve insuffisante consultée | Runbooks, tests de restauration, RPO/RTO et alertes |
| QA-01 | Tests unitaires | Résultats antérieurs partiels | Checkpoint du 17 octobre et tests taxe | Exécuter suite sur le head exact et archiver résultats |
| QA-02 | Tests intégration/E2E complets | Partiel | 9 suites/27 tests ignorés signalés auparavant | Configurer les tests nécessaires et réduire les tests ignorés |
| BEN-01 | Pack Bénin facture normalisée | Validation juridictionnelle requise | Sources DGI citées dans MVP | Textes actuels, spécifications/autorisation, tests et revue locale |
| FRA-01 | Pack France e-invoicing | Validation juridictionnelle requise | impots.gouv.fr cité dans MVP | EN16931/format, plateforme agréée ou connecteur autorisé, e-reporting |
| EU-01 | EN 16931 / Peppol / PINT | Non démontré / à construire | Références OpenPeppol dans MVP | Versions de spécification et validateurs exacts à intégrer et tester |
| CERT-01 | Certifications / homologations du produit | Non démontré | Aucune preuve d'autorisation consultée | Évaluer par rôle et pays ; ne pas revendiquer de statut non obtenu |

## 4. PR et travaux en cours à prendre en compte

État documenté au 19 octobre 2026 :
- PR #5 — factures multi-lignes, émission idempotente, PDF et avoirs : ouverte, brouillon, non fusionnée ; un workflow antérieur a réussi sur un SHA antérieur.
- PR #6 — séparation monorepo backend/frontend : ouverte, brouillon, non fusionnée ; CI précédemment réussie sur son SHA alors observé.
- PR #7 — endpoint lecture facture autorisé utilisateur : ouverte, brouillon, non fusionnée ; CI précédemment réussie sur son SHA alors observé.
- PR #8 — identité de marque/site public : ouverte, brouillon, non fusionnée.
- PR #9 — workflow de facture utilisateur authentifié : ouverte, brouillon, non fusionnée ; résultat CI antérieur réussi sur un commit antérieur, dernier head à revérifier.
- PR #10 — extensibilité fiscale : ouverte, brouillon, non fusionnée ; dernier workflow non confirmé au moment de ce relevé.

Ces branches forment une chaîne de dépendances. Ne pas fusionner ou retargeter au hasard. Aucun merge sans approbation explicite. Vérifier les SHA et checks actuels avant de conclure sur leur statut.

## 5. Résultats de recherche réglementaire préliminaire

### Bénin
Les documents DGI consultés décrivent la facture normalisée, le cadre MECeF/e-MECeF et les exigences d'identification, numérotation, contenu et émission. Le Code général des impôts publié par la DGI indique que les systèmes de facturation commercialisés ou développés doivent satisfaire aux spécifications techniques de la DGI et être homologués avant utilisation au Bénin. Il faut donc analyser le statut de ZENOX et le dispositif technique requis, pas seulement produire un PDF.

Sources :
- Guide de facturation normalisée DGI : https://api.impots.bj/media/62b9ccd77489a_GUIDE%20DE%20FACTURATION%20NORMALIS%C3%89E.pdf
- Code général des impôts publié par la DGI : https://api.impots.bj/media/615441c406db2_CGI-B%C3%89NIN-2021.pdf
- Portail MECeF DGI : https://supportmecef.impots.bj/mecef/index.xhtml

Ces documents doivent être vérifiés contre les textes les plus récents avant décision.

### France
La DGFiP distingue une solution compatible d'une plateforme agréée. Les fonctionnalités réglementaires de transmission/réception et de transmission des données fiscales sont réservées à l'opérateur immatriculé dans le cadre applicable. Le choix du modèle ZENOX (solution compatible et connecteur, ou candidature à l'immatriculation) doit être décidé et validé séparément.

Sources :
- https://www.impots.gouv.fr/facturation-electronique-et-plateformes-agreees
- https://www.impots.gouv.fr/je-consulte-la-liste-des-plateformes-agreees

### Union européenne / Peppol
Peppol BIS Billing s'appuie sur EN 16931 et publie des artefacts de validation et listes de codes versionnés. Le paquet ViDA a un calendrier progressif et doit être suivi comme un programme réglementaire évolutif. Une génération UBL conforme ne donne pas à elle seule un accès réseau ou une autorisation de plateforme.

Sources :
- https://docs.peppol.eu/poacc/billing/3.0/
- https://docs.peppol.eu/poac/eu/pint-eu/
- https://taxation-customs.ec.europa.eu/taxation/vat/vat-digital-age-vida_en

## 6. Prochain audit technique à réaliser

1. Lire toutes les migrations Finance et dresser une matrice tables/colonnes/contraintes/index/RLS/policies/triggers/functions.
2. Lister toutes les routes API et les relier à leurs schémas, services, permissions, audit et tests.
3. Cartographier le cycle complet de facture, avoir, PDF/document, paiement, allocation et solde.
4. Auditer les contrats d'identité utilisateur et de service, les scopes et la séparation tenant.
5. Exécuter les tests sur le SHA courant via CI et relever les tests ignorés.
6. Vérifier les snapshots, immutabilité, numérotation et idempotence sous concurrence.
7. Comparer l'implémentation au cahier des charges exigence par exigence.
8. Créer les packs de conformité uniquement après avoir identifié les textes officiels et le rôle réglementaire.
9. Mettre à jour cette matrice avec liens précis aux fichiers/tests et preuves réelles.

## 7. Contraintes de sécurité et d'environnement

- Ne pas exécuter les migrations Finance sur zenoxfret_v2.
- Ne pas modifier la base ZENOX FRET.
- Les migrations et tests de schéma doivent utiliser uniquement PostgreSQL jetable/CI conformément aux décisions déjà validées. L'instance Supabase Finance validée peut être utilisée seulement dans le cadre explicitement approuvé ; ne pas l'utiliser pour appliquer des migrations expérimentales sans décision dédiée.
- Ne pas fusionner les PR ouvertes sans approbation.
- Ne pas effectuer d'opération Git destructive.
- Ne pas déclarer un test passé sans résultat observable.
- Ne pas déclarer un pays conforme sans preuve juridique et technique suffisante.
