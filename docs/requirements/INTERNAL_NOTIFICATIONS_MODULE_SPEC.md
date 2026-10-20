# ZENOX Finance — Module Notifications internes

Statut : conception; implémentation à auditer avant de commencer.
Date : 2026-10-20
Prérequis : identité utilisateur, tenant/membership, permissions et RLS opérationnels.

## 1. Objectif MVP
Fournir un centre de notifications persistantes pour signaler les événements utiles de Finance : demande d'organisation reçue/approuvée/rejetée, facture émise/échue, paiement confirmé/échoué, remboursement, échec d'intégration et alertes de sécurité pertinentes.

Le module interne ne dépend pas d'abord d'un fournisseur d'e-mail ou SMS. Les notifications externes seront ajoutées via un mécanisme extensible d'outbox après que la persistance et les autorisations internes sont fiables.

## 2. Modèle proposé — à comparer au schéma existant
- finance_notifications : id, tenant_id nullable seulement pour les événements réellement plateforme, recipient identity/membership, type, titre court, corps sûr, ressource typée/id, created_at, read_at, expires_at nullable et métadonnées minimales.
- finance_notification_preferences : préférences par identité/tenant/type si elles sont nécessaires au MVP; ne pas introduire de réglages inutiles avant la politique produit.
- finance_notification_outbox : événement à distribuer de façon fiable si le modèle outbox n'existe pas déjà; état, tentatives, prochaine tentative, dernier code d'erreur sûr, created_at/processed_at.
- Une contrainte d'idempotence métier empêche de créer plusieurs notifications identiques pour le même événement/recipient lorsque c'est requis.
- Avant toute migration, rechercher les tables existantes et réutiliser l'architecture outbox/inbox si elle existe déjà.

## 3. Contrat API proposé
- GET /api/v1/user/notifications?limit=&cursor=&unreadOnly= : liste tenant-scoped ou identité-scoped selon le modèle validé, pagination bornée.
- GET /api/v1/user/notifications/unread-count : compteur non lu du destinataire authentifié.
- POST /api/v1/user/notifications/:notificationId/read : marquer comme lu seulement si le destinataire a accès.
- POST /api/v1/user/notifications/read-all : marquer les notifications accessibles comme lues de manière bornée/transactionnelle.
- Aucune route publique ne doit permettre au client de créer une notification arbitraire ou de choisir recipient, tenant, type privilégié ou ressource non autorisée.
- Réponses avec enveloppe d'erreur stable, correlation ID et pas de données personnelles inutiles.

## 4. Sécurité et isolation
- L'identité destinataire vient de la session vérifiée; l'identité/tenant ne vient jamais de filtres libres envoyés par le navigateur.
- Toutes les lectures/écritures sont filtrées côté serveur par destinataire et contexte tenant.
- RLS/FORCE RLS et permissions runtime doivent être testés pour SELECT, UPDATE et INSERT; aucun grant global de contournement.
- Ne pas inclure des détails fiscaux, données de paiement, jetons ou contenu privé complet dans le titre/corps de notification.
- Une notification peut pointer vers une ressource, mais l'accès à la ressource doit être réautorisé au clic; l'identifiant seul n'accorde aucun droit.
- Le marquage lu ne doit pas permettre de modifier le contenu, destinataire ou tenant.

## 5. Événements initiaux
- RegistrationSubmitted / RegistrationApproved / RegistrationRejected.
- InvoiceIssued / CreditNoteIssued / InvoiceOverdue (après définition fiable de l'échéance).
- PaymentConfirmed / PaymentFailed / RefundUpdated (après réalisation du module Paiements).
- IntegrationDeliveryFailed / SecurityNotice, avec throttling pour éviter les tempêtes de notifications.
- Les producteurs doivent appeler un service central ou écrire dans une outbox transactionnelle; ne pas faire de requêtes réseau externes dans la transaction métier.

## 6. UX
- Centre accessible depuis l'en-tête, badge du nombre non lu et état vide explicite.
- Liste paginée, date/heure locale, état lu/non lu, catégorie et lien interne autorisé.
- Actions « marquer comme lu » et « tout marquer comme lu » avec retour de réussite/erreur.
- États chargement, absence de connexion, erreur récupérable et aucun faux événement en production.
- Les notifications de démonstration doivent être clairement étiquetées ou absentes.

## 7. Tests requis
- Utilisateur A ne lit ni ne marque comme lu les notifications de B.
- Une notification d'un tenant n'est pas visible par un autre tenant.
- Les ressources liées sont réautorisées au moment de l'accès.
- Pagination/cursor stable et bornée; unread-count exact.
- read-all n'affecte que les notifications accessibles et utilise une transaction sûre.
- Les événements dupliqués ne créent pas de doublons si la clé d'idempotence métier s'applique.
- Échec de transaction et outbox n'entraînent pas de notification perdue ou non traçable.
- Les messages ne divulguent pas de données sensibles et les tests RLS passent sur PostgreSQL jetable.

## 8. Ordre de réalisation
1. [A FAIRE] Auditer tables, migrations, routes, services, UI et tests déjà présents.
2. [A FAIRE] Valider identité destinataire, modèle tenant/platform et politique de rétention.
3. [A FAIRE] Implémenter schéma, RLS/grants et repository tenant-scoped.
4. [A FAIRE] Implémenter service producteur, API paginée, compteur non lu et mutations read/read-all.
5. [A FAIRE] Connecter le centre UI aux routes utilisateur authentifiées.
6. [A FAIRE] Ajouter événements depuis les modules existants uniquement après confirmation de leurs transactions/états.
7. [A FAIRE] Ajouter tests unitaires, API et PostgreSQL jetable, vérifier CI sur le SHA exact.
8. [A FAIRE] Garder les livraisons e-mail/SMS hors de la première tranche; ajouter ultérieurement un adaptateur asynchrone.

## 9. Critères d'acceptation
[A FAIRE] Les notifications persistantes sont visibles uniquement par leurs destinataires autorisés.
[A FAIRE] Le badge unread-count correspond à l'état persistant.
[A FAIRE] Lecture, marquage individuel et read-all sont sûrs et testés.
[A FAIRE] Les événements métier produisent des notifications de façon fiable et idempotente.
[A FAIRE] Pas de fuite cross-tenant, secret, donnée fiscale ou donnée de paiement sensible.
[A FAIRE] RLS, tests et CI validés sur le HEAD exact.
[A FAIRE] Aucune migration persistante non autorisée et aucun accès à zenoxfret_v2.