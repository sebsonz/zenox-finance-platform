# ZENOX Finance — vision produit et périmètre MVP

**Version :** 0.1 — document de cadrage initial  
**Date de référence :** 2026-10-19  
**Statut :** proposition produit à valider, alignée sur le checkpoint maître du 2026-10-19.

## 1. Vision et positionnement

ZENOX Finance est un SaaS autonome de facturation et de gestion financière conçu dès l'origine pour les marchés internationaux. Il sert des entreprises indépendantes et des logiciels tiers. ZENOX FRET V2 est son premier consommateur interne, via une API versionnée ; il ne définit pas à lui seul le produit.

La promesse initiale est de permettre aux entreprises des juridictions effectivement prises en charge de gérer leurs clients, documents commerciaux, factures, avoirs, paiements et soldes avec traçabilité financière, données isolées et règles de conformité vérifiables.

Le terme « international » signifie que le cœur de produit, les frontières et le modèle de données acceptent plusieurs pays, langues, devises, formats et packs réglementaires. Il ne signifie pas que tous les pays sont déjà conformes.

## 2. Objectifs

- Créer, valider, émettre, partager et archiver des documents de facturation.
- Gérer les clients, produits/services, devis, factures, avoirs et acomptes.
- Enregistrer les paiements et remboursements et affecter les paiements aux créances.
- Calculer les montants par arithmétique décimale exacte et conserver les choix de calcul appliqués.
- Permettre plusieurs devises, avec taux datés et traçabilité des conversions.
- Structurer les règles fiscales et exigences de documents par juridiction et période de validité.
- Fournir une interface web et une API sécurisée destinée aux intégrations.
- Prévoir un modèle de comptabilité extensible, sans prétendre que le grand livre complet est livré par le MVP.
- Maintenir un processus d'actualisation réglementaire avec sources, approbations, tests et historique.

## 3. Utilisateurs et personas

1. **Propriétaire d'entreprise** : configure l'entité, invite les membres et pilote l'activité financière.
2. **Administrateur financier** : gère clients, documents, paramètres et traitements financiers autorisés.
3. **Agent de facturation** : prépare devis et brouillons, puis soumet à émission selon les permissions.
4. **Agent d'encaissement** : enregistre et suit les paiements et allocations autorisés.
5. **Comptable** : contrôle les opérations, exporte les données et, selon le périmètre activé, consulte les informations comptables.
6. **Auditeur** : accède en lecture aux traces et documents autorisés.
7. **Client facturé** : consulte ses propres documents, montants dus et paiements.
8. **Application intégrée** : consomme l'API selon des portées, scopes et autorisations explicitement accordés.
9. **Administrateur plateforme ZENOX** : opère la plateforme, les offres et la gestion des incidents avec privilèges contrôlés et journalisés.

## 4. Périmètre du MVP proposé

Le MVP doit réaliser un parcours financier complet et fiable dans un périmètre réglementaire initial explicitement limité.

### Inclus dans la cible MVP

- Identité, entreprises/tenants, membres, rôles et permissions.
- Isolation multi-tenant dans les routes et en base.
- Clients et contacts.
- Catalogue simple de produits/services et lignes libres.
- Devis : création, envoi/export, acceptation/refus/expiration et conversion contrôlée en facture.
- Factures multi-lignes : brouillon, calcul, validation, émission contrôlée, numéro unique, snapshot immuable, consultation et archivage.
- Avoirs et corrections référencées à une facture d'origine, sous réserve des règles de juridiction activées.
- Gestion des devises, précision et arrondis ; source/timestamp des taux de change lorsqu'ils sont utilisés.
- Moteur fiscal configurable par règles datées/versionnées ; traitement fail-closed si aucune règle suffisamment vérifiée n'est applicable.
- Génération et stockage privé de documents dans les formats validés ; PDF à confirmer par preuve d'implémentation/acceptation.
- Paiements enregistrés manuellement dans le MVP initial ; architecture d'adaptateurs pour prestataires. Une intégration réelle de prestataire ne peut être annoncée comme disponible tant que son pays, compte marchand, flux, webhook, remboursements et tests sont validés.
- Paiements partiels, allocations, soldes, créances échues et sommes non affectées.
- Idempotence des opérations financières critiques et traitement des notifications répétées.
- Notifications transactionnelles de base et journal d'envoi.
- Portail client en lecture contrôlée.
- API versionnée, documentation OpenAPI, authentification de services, scopes et contrat ZENOX FRET.
- Journal d'audit, métriques, sauvegardes et procédure de restauration.
- Tests unitaires, PostgreSQL jetable, contrats API, isolation, concurrence sur soldes/numérotation et parcours E2E.

### Inclus sous forme de fondations, mais pouvant être livrés après le premier parcours

- Modèle du grand livre et points d'intégration comptables, sans déclarer le grand livre complet opérationnel.
- Adaptateurs génériques de facturation électronique et validation de formats.
- Système de mises à jour fiscales, approbation et alertes d'expiration.
- Administration SaaS des offres/quotas, si elle n'est pas nécessaire au pilote initial.

### Exclus de la première livraison exploitable, mais conservés dans la vision

- Conformité universelle à tous les pays et régimes fiscaux.
- Agrément propre de ZENOX comme opérateur ou plateforme réglementée sans démarche officielle.
- Transmissions fiscales nationales réelles sans autorisation, contrats, credentials, tests et validation appropriés.
- Toutes les intégrations de paiement du marché dès le lancement.
- Déclaration fiscale complète automatique pour toutes les juridictions.
- Grand livre, consolidation multi-entités, clôtures, gestion budgétaire et reporting de gestion avancé au niveau entreprise.
- Gestion complète des fournisseurs/achats, dépenses, banque et rapprochement bancaire avancé.
- Garantie juridique universelle basée seulement sur les tests du logiciel.

## 5. Parcours métier MVP

### Parcours A — Préparation et émission

1. Le membre autorisé sélectionne l'entreprise et le client.
2. Il crée un brouillon avec les lignes, la devise, les dates et les conditions.
3. Le serveur vérifie les données et calcule les montants à l'aide d'une représentation décimale exacte.
4. Le moteur recherche la règle fiscale et le pack juridictionnel applicables pour la date et les faits connus.
5. Si la règle manque, est ambiguë, expirée ou non approuvée, le système bloque l'émission ou déclenche une validation explicite définie par la politique de risque ; aucun taux par défaut ne doit masquer l'incertitude.
6. Le système valide les mentions et le format exigés par le périmètre activé.
7. Une transaction atomique attribue un numéro, fige les valeurs et les snapshots, crée les événements et rend la facture émise immuable.
8. Le document est stocké de manière privée et partagé par un canal contrôlé.
9. Toute correction ultérieure passe par un avoir, une annulation autorisée ou une autre opération explicitement définie par le pack.

### Parcours B — Paiement et allocation

1. Un paiement manuel est enregistré ou une tentative est créée auprès d'un prestataire.
2. Le paiement intégré n'est confirmé qu'à partir d'une preuve fiable, vérifiée et authentifiée.
3. La confirmation est idempotente et corrélée à la tentative.
4. Une allocation peut affecter tout ou partie du paiement aux factures autorisées.
5. La transaction valide simultanément le montant non affecté et le solde restant dû.
6. Les statuts de facture et du paiement sont mis à jour sans confondre document émis, demande de paiement, confirmation du prestataire et écriture comptable.
7. Les répétitions de callbacks et de requêtes ne créent aucun doublon.

### Parcours C — Consultation client et intégration

1. Le client s'authentifie.
2. Le serveur confirme son lien avec l'entreprise et les documents accessibles.
3. Il consulte ou télécharge seulement ses propres documents.
4. Une application intégrée utilise des credentials de service, scopes et autorisations d'entreprise.
5. L'API retourne un contrat versionné et des identifiants stables.
6. Les événements, erreurs, reprises et références externes sont traçables ; aucune application consommatrice n'écrit directement dans les tables Finance.

## 6. Principes métier non négociables

- Le tenant est dérivé du contexte authentifié et autorisé côté serveur, jamais d'un champ client non fiable seul.
- Les valeurs monétaires ne sont pas calculées avec JavaScript `Number`.
- Une facture émise n'est pas éditable comme un brouillon.
- Un snapshot fiscal émis est immuable et référence précisément les versions des règles.
- La numérotation est atomique, unique selon la politique applicable et testée en concurrence.
- Une même clé d'idempotence avec le même contenu permet une reprise sûre ; une réutilisation avec contenu incompatible doit être rejetée.
- Paiement, tentative de paiement, allocation, remboursement et écriture comptable restent des objets distincts.
- Une allocation ne dépasse ni le montant disponible du paiement ni le solde autorisé de la créance.
- Toute transaction multi-objets doit être atomique ou posséder une stratégie de cohérence et de reprise explicitement documentée.
- Les règles fiscales globales ne sont pas modifiables par un tenant ordinaire.
- PDF imprimable, UBL valide ou succès CI ne suffisent pas à prouver l'homologation ou la conformité juridique.

## 7. Modèle de couverture 10 % → 100 %

Les pourcentages ne représentent pas la fraction du monde couverte. Ils mesurent la maturité relative d'un catalogue de capacités et de juridictions explicitement pondérées, dont les poids seront approuvés avant calcul.

- **Niveau 10 % — Socle architectural** : modèle universel, isolation, versionnement, Decimal, audit, registre source, interfaces d'extension et un premier parcours testé. Aucun claim de couverture internationale.
- **Niveau 25 % — Parcours MVP** : devis/factures/avoirs, paiements enregistrés, allocations, documents, API, tests E2E pour le profil de lancement.
- **Niveau 50 % — Packs de lancement validés** : plusieurs juridictions réellement choisies, chacune documentée, testée et revue, avec format/connector quand requis.
- **Niveau 75 % — Couverture élargie contrôlée** : davantage de catégories de transaction, devises, normes, connecteurs et cas fiscaux avec mesure de couverture et suivi des changements.
- **Niveau 100 % — Cible définie, jamais « tous les pays automatiquement »** : totalité du catalogue approuvé dans une version précise, tous les packs revendiqués couverts par tests et validation, tous les standards et flux dans leur périmètre, aucun élément non vérifié présenté comme conforme.

Le calcul doit utiliser une matrice versionnée `capability_id`, `jurisdiction_id`, `effective_from`, `weight`, `implementation_status`, `test_evidence`, `official_source`, `legal_review_status` et `last_reviewed_at`. Les éléments réglementaires critiques ont une condition bloquante ; un score élevé ne compense pas une obligation légale non satisfaite.

## 8. Mesures de succès proposées

- 100 % des parcours financiers critiques couverts par tests automatisés d'acceptation.
- 0 accès inter-tenant autorisé dans la suite de tests de sécurité.
- 0 doublon lors des tests de reprise/idempotence ciblés.
- 0 surallocation de paiement dans les tests de concurrence.
- 100 % des factures émises de test liées à une version de règles et un snapshot fiscal immuable lorsque la juridiction exige un calcul fiscal.
- 100 % des fonctions réglementées annoncées publiquement soutenues par des preuves propres à leur juridiction et version.
- Reprise testée d'une sauvegarde suivant les objectifs RPO/RTO qui seront fixés.
- Les seuils de performances et de disponibilité doivent être fixés après cadrage des volumes, coûts et infrastructure.

## 9. Hypothèses et décisions ouvertes

À décider pendant la validation du cahier des charges : pays pilotes et séquence, catégories B2B/B2C/B2G, politique de juridiction par tenant, fournisseur PDF, stockage, prestataires de paiement prioritaires, statut exact du portail client, conformité locale, délais de rétention, RPO/RTO, objectifs de performance et stratégie d'homologation/partenariat.

Les choix de pays pilotes doivent découler de la recherche réglementaire, des clients cibles et de la capacité réelle à satisfaire les exigences officielles ; ne pas choisir seulement en fonction de la simplicité apparente d'un taux de taxe.
