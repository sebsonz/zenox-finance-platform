# ZENOX Finance — Module Paiements, Allocations et Rapprochement

Statut : conception initiale; aucune implémentation n'est attestée par ce document.
Date : 2026-10-20
Pré-requis : facturation terminée et validée sur le HEAD exact avant d'implémenter les opérations de paiement.
Sécurité : migrations Finance sur PostgreSQL jetable/CI uniquement; ne jamais toucher à zenoxfret_v2.

## 1. Objectif et périmètre

Construire un registre de paiements et de tentatives qui peut être utilisé avec plusieurs prestataires, sans faire de ZENOX Finance un établissement de paiement par défaut. Finance conserve la source de vérité des paiements enregistrés, des allocations, des remboursements et du rapprochement. Le prestataire externe reste responsable de l'exécution du mouvement de fonds selon son propre contrat.

Dans le MVP :
- enregistrer un paiement manuel ou initié par un adaptateur de prestataire;
- suivre les tentatives et transitions de statut;
- allouer tout ou partie d'un paiement à une ou plusieurs factures émises;
- calculer le solde restant dû sans dépassement ni double allocation;
- enregistrer remboursements et ajustements autorisés;
- traiter des notifications de prestataire signées de façon idempotente;
- fournir un journal d'audit tenant-scoped et des données de rapprochement.

À ne pas prétendre couvrir sans conception supplémentaire : garde de fonds, paiement réglementé, conversion FX effective, comptabilité générale complète, litiges complexes de cartes, paiements récurrents et payout multi-parties.

## 2. Principes non négociables

1. Tous les montants sont représentés et calculés avec un type décimal exact; jamais avec les floats JavaScript.
2. Une opération est toujours liée à un tenant, une devise et un acteur autorisé.
3. Les opérations de mutation utilisent une clé d'idempotence, une transaction et un audit.
4. Les callbacks prestataire sont authentifiés, dédupliqués et traités sans supposer l'ordre d'arrivée.
5. Les données reçues du navigateur ne peuvent pas déclarer un paiement SETTLED/CONFIRMED sans preuve autoritative ou permission explicite pour un paiement manuel.
6. Une allocation ne peut pas dépasser le montant disponible du paiement ni le montant restant dû de la facture, selon la politique choisie.
7. Les allocations concurrentes doivent être protégées par verrouillage/contrainte transactionnelle, pas seulement par une validation applicative.
8. Les remboursements ne réécrivent pas le paiement source ni les allocations historiques; ils créent des événements/records séparés.
9. Les données de paiement ne doivent pas stocker les numéros de carte ou secrets de prestataire interdits; conserver uniquement les références nécessaires.
10. RLS/FORCE RLS, permissions serveur et isolation cross-tenant restent obligatoires.

## 3. Modèle de domaine proposé — à valider avec le schéma réel

- finance_payments : identité, tenant, montant, devise, statut, méthode, source (MANUAL/PROVIDER), référence externe normalisée, créé par, timestamps et version.
- finance_payment_attempts : tentative, provider, référence, statut, montant/devise, erreur sûre, timestamps et corrélation.
- finance_payment_events : événements immuables de changement de statut, source, événement externe idempotent, payload minimal nettoyé et date effective.
- finance_payment_allocations : lien paiement-facture, montant alloué, devise, acteur, date et référence de transaction.
- finance_refunds : montant, devise, raison, statut, référence prestataire, approbateur et timestamps.
- finance_reconciliation_items : référence d'extrait/import prestataire, montant/devise, date, référence externe, statut de rapprochement et résultat.
- finance_provider_webhook_receipts ou outbox/inbox équivalente : identifiant externe unique, empreinte/payload nettoyé, statut de traitement, retry et erreur sûre.
- finance_audit_events existant peut être réutilisé si le contrat d'audit est respecté.

Ce modèle est une proposition. Avant migration, vérifier les tables et contraintes déjà présentes; ne pas créer de doublons fonctionnels.

## 4. États et transitions

Payment (proposition) : CREATED -> PENDING -> CONFIRMED/SETTLED; les états FAILED, CANCELLED, PARTIALLY_REFUNDED et REFUNDED doivent être modélisés selon la sémantique réelle du fournisseur. Ne pas confondre succès d'une tentative, autorisation et règlement effectif.

Attempt (proposition) : CREATED -> SUBMITTED -> PENDING_PROVIDER -> SUCCEEDED ou FAILED; les transitions tardives/dupliquées ne doivent pas faire régresser un état final sans règle explicite.

Refund (proposition) : REQUESTED -> APPROVED (si requis) -> SUBMITTED -> SUCCEEDED ou FAILED. L'autorisation dépend du montant, du rôle et de la politique de l'organisation.

Allocation : création et annulation compensatoire, jamais modification silencieuse d'une allocation historique. Toute annulation produit un audit et une référence de compensation.

Les noms exacts de statuts doivent être alignés sur les besoins métier et les contrats fournisseurs avant le schéma définitif.

## 5. Invariants monétaires

- Somme des allocations actives d'un paiement <= montant confirmé du paiement moins remboursements applicables, selon la politique approuvée.
- Somme des allocations actives vers une facture <= montant exigible restant dû de cette facture.
- Montant, devise et tenant d'un paiement et d'une facture doivent être compatibles; aucune conversion implicite.
- Une conversion FX doit être une opération distincte avec taux/source/heure/arrondi explicites.
- Les montants sont arrondis selon la précision et la politique applicables; conserver les montants source et les montants calculés nécessaires à l'audit.
- Une répétition avec même idempotency key et même requête renvoie le résultat précédent; réutilisation de la clé avec un payload différent retourne un conflit.
- Une panne entre mutation et audit ne doit jamais laisser une mutation sans son audit obligatoire.

## 6. API cible — proposition, non implémentée

- POST /api/v1/payments : créer une demande de paiement ou enregistrer un paiement manuel selon la permission.
- GET /api/v1/payments : liste paginée, filtres bornés et scope tenant.
- GET /api/v1/payments/:paymentId : détail et événements autorisés.
- POST /api/v1/payments/:paymentId/attempts : créer/démarrer une tentative via adaptateur autorisé.
- POST /api/v1/payments/:paymentId/allocations : allouer un montant à une facture émise.
- POST /api/v1/payments/:paymentId/allocations/:allocationId/reversals : compensation d'allocation.
- POST /api/v1/payments/:paymentId/refunds : demander un remboursement.
- GET /api/v1/invoices/:invoiceId/balance : calculer le solde à partir de la source de vérité, tenant-scoped.
- POST /api/v1/provider-webhooks/:provider : endpoint dédié, vérification de signature, déduplication et traitement asynchrone/idempotent.
- POST/GET de rapprochement : importer des lignes contrôlées et les rapprocher, avec permissions administratives dédiées.

Les endpoints doivent employer l'enveloppe d'erreur API existante, pagination bornée, autorisations par action et idempotency key pour chaque mutation répétable.

## 7. Adaptateurs fournisseurs

- Interface interne normalisée : create/confirm/cancel/refund/getStatus et vérification de webhook, seulement si le fournisseur supporte l'opération.
- Configurations/secrets stockés côté serveur et jamais dans le frontend.
- Identifiants externes uniques par fournisseur et environnement.
- Les environnements test/live et devises supportées doivent être séparés.
- Un webhook ne peut être accepté que si la signature, le timestamp/anti-replay et le schéma sont valides.
- Ne jamais marquer un paiement confirmé sur la seule base d'une redirection navigateur.
- Les réponses fournisseur doivent être normalisées sans perdre la référence brute nécessaire au diagnostic, mais sans conserver des secrets ou données sensibles inutiles.

## 8. Permissions et audit

Permissions indicatives à valider : payments:read, payments:create, payments:confirm_manual, payments:allocate, payments:reverse_allocation, refunds:request, refunds:approve, reconciliation:manage.

Un rôle VIEWER ne peut pas créer, allouer, rembourser ou rapprocher. L'approbation de remboursement peut exiger une séparation des tâches. Les permissions de plateforme ne doivent pas être confondues avec les rôles du tenant.

Journaliser acteur, tenant, action, ressource, montant/devise utiles, corrélation et timestamp. Ne pas journaliser les secrets fournisseur, données complètes de carte, tokens ou payloads sensibles.

## 9. Tests requis avant validation

Unitaires : calcul des soldes, exactitude décimale, transitions d'état, validation des montants/devise, idempotence et mapping d'événements fournisseur.

PostgreSQL jetable :
- deux allocations concurrentes ne dépassent jamais le solde disponible;
- deux paiements concurrents ne surpaient pas la même facture;
- clé d'idempotence répétée ne crée pas de double paiement/allocation/remboursement;
- rollback intégral si insertion d'audit ou d'allocation échoue;
- l'utilisateur d'un tenant ne lit ni ne modifie les paiements d'un autre tenant;
- transitions interdites et callbacks dupliqués/tardifs sont traités sans corruption;
- remboursement et allocation préservent la traçabilité et les invariants;
- le rôle runtime ne peut pas contourner RLS ou muter directement des objets immuables.

API/provider :
- signature webhook invalide rejetée;
- replay/duplicate webhook traité une seule fois;
- ordre de livraison des événements désordonné géré explicitement;
- panne provider, timeout, retry et état inconnu couverts;
- pas de secret dans les réponses/logs.

## 10. Ordre de réalisation

1. [A FAIRE] Fermer et valider la tranche facturation sur son HEAD exact (PR #5/#9) avant le code Payments.
2. [A FAIRE] Auditer le schéma et les permissions existants; approuver le modèle de données final.
3. [A FAIRE] Ajouter migrations Finance additives, policies/grants et fonctions transactionnelles sur branche dédiée.
4. [A FAIRE] Implémenter domaine/repositories/services et API idempotente.
5. [A FAIRE] Implémenter un adaptateur de test/sandbox avant tout adaptateur live.
6. [A FAIRE] Ajouter callbacks signés, remboursements, allocations et rapprochement.
7. [A FAIRE] Ajouter UI avec BFF/API sécurisé, états honnêtes et erreurs récupérables.
8. [A FAIRE] Exécuter tests unitaires, PostgreSQL jetable, E2E et revue sécurité sur le SHA exact.
9. [A FAIRE] Garder PR en brouillon jusqu'à CI verte et revue; aucune fusion sans approbation explicite.

## 11. Critères d'acceptation

[A FAIRE] Aucun paiement confirmé par une simple action du navigateur.
[A FAIRE] Les paiements, tentatives, allocations et remboursements sont traçables et tenant-scoped.
[A FAIRE] Les invariants monétaires tiennent sous concurrence.
[A FAIRE] Toutes les mutations sensibles sont idempotentes ou protégées contre le double traitement.
[A FAIRE] Les webhooks sont authentifiés, dédupliqués et auditables.
[A FAIRE] Les soldes factures proviennent des paiements/allocations autoritatives.
[A FAIRE] RLS, permissions, tests et CI passent sur le SHA exact.
[A FAIRE] Aucun accès à zenoxfret_v2 et aucune migration persistante non autorisée.