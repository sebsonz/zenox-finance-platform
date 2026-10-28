# Checkpoint — ZENOX Finance : routage modulaire et architecture complète
Date de mise à jour : 2026-10-29

## 1. Source de vérité et documents

- Dépôt : https://github.com/sebsonz/zenox-finance-platform
- Branche de travail GitHub : `feat/modular-routing-architecture`
- PR #19 : https://github.com/sebsonz/zenox-finance-platform/pull/19
- Base de la PR : `feat/platform-admin-dashboard-v3`
- **La PR #19 reste ouverte/en brouillon et n'est pas fusionnée. Ne pas la fusionner sans accord explicite.**
- Architecture modulaire complète : [docs/architecture/2026-10-29-complete-modular-architecture-fr.md](../architecture/2026-10-29-complete-modular-architecture-fr.md)
- Vision et continuité produit : [checkpoint maître international MVP](2026-10-19-master-continuity-international-mvp.md)
- Feuille de route de couverture et critères d'acceptation : [roadmap couverture](../product/2026-10-19-coverage-acceptance-roadmap-fr.md)

## 2. État GitHub vérifié

Le commit de la branche utilisé pour la validation du routage était `5c52b681d4e9a0a86faecad91226980e050d5daf`. Les deux exécutions GitHub Actions précédemment relevées pour ce SHA (`40741454735` et `40741450407`) étaient en succès. Cette preuve porte sur ce commit et sur les jobs de CI exécutés ; elle ne signifie ni que tous les modules fonctionnels sont terminés, ni que le produit est prêt pour la production.

Le présent checkpoint et le document d'architecture sont des mises à jour documentaires postérieures à ce SHA. La CI doit être confirmée sur le nouveau HEAD documentaire avant de considérer ce HEAD comme validé.

## 3. Fondations de routage déjà présentes sur la branche

- Dépendance React Router 7 ajoutée au frontend et lockfile associé.
- `frontend/src/main.tsx` ramené au bootstrap React et au `RouterProvider`.
- Shell applicatif déplacé dans `frontend/src/app/App.tsx`.
- Routes et chemins centralisés dans `frontend/src/app/router.tsx` et `frontend/src/app/navigation.ts`.
- Extraction de Dashboard, TaxWorkspace et ComingSoon dans des modules dédiés/partagés.
- Redirection frontend pour les utilisateurs non opérateurs plateforme qui ouvrent `/platform` ; l'autorisation backend demeure la source d'autorité.
- Agrégateurs de routes pour les factures et l'authentification utilisateur ; le routeur API v1 monte des routeurs par module en préservant les préfixes existants.
- Dépendance de workspace `@zenox/finance-workspace` préservée.

## 4. Architecture modulaire ajoutée

Le document d'architecture fixe une cible de **monolithe modulaire**, à appliquer progressivement sans réécriture mécanique de tout le dépôt. Il décrit :

- couches frontend, backend, API, application, domaine, persistance et adaptateurs ;
- limites de responsabilité, règles de dépendance et contrats entre modules ;
- isolation multi-tenant, PostgreSQL/RLS, sécurité, audit, idempotence et calcul monétaire exact ;
- intégration de ZENOX FRET exclusivement par API versionnée, sans SQL direct dans la base Finance ;
- tests unitaires, intégration PostgreSQL jetable, API, sécurité, concurrence, contrats et E2E ;
- critères explicites pour qu'un module puisse être déclaré complet ;
- stratégie de livraison et décisions réglementaires/produit qui restent ouvertes.

Le catalogue architectural comporte les domaines suivants : identité et accès, onboarding/tenants, isolation multi-tenant, clients, catalogue produits/services, devises, devis, factures/avoirs, calcul monétaire, fiscalité, documents, paiements, allocations/soldes, comptabilité générale, dépenses/fournisseurs, banque/rapprochement, portail client, notifications, rapports/exports, administration plateforme, API/intégrations, conformité internationale, abonnements/quotas, audit, sécurité/opérations, internationalisation UX, tâches fiables et contrats API.

**Important :** cette liste est la cible complète et la structure de travail ; elle ne déclare pas tous ces domaines implémentés. L'état de chaque module doit être confirmé par le code, les tests et une preuve associée à un SHA.

## 5. État fonctionnel : règle de vérité

- **Facturation : fondation avancée existante, clôture à prouver.** Les checkpoints précédents décrivent brouillons, calcul serveur, révision optimiste, snapshots fiscaux, émission idempotente, numérotation par tenant/année, documents HTML/PDF et avoirs sur certaines branches. Il reste à confirmer les parcours E2E, les permissions/cas négatifs, les retries/concurrences, la stratégie de documents et les validations de juridiction sur le HEAD retenu.
- **Fiscalité : fondation technique partielle.** Les règles et snapshots versionnés ne prouvent pas à eux seuls une conformité nationale. Les sources officielles, les dates d'effet, l'approbation et les tests doivent être établis pour chaque périmètre activé.
- **Clients, devises, accès et onboarding : partiels selon les checkpoints précédents.** Les parcours complets, mise à jour/archivage, invitations/révocations et interface opérationnelle doivent être clôturés avec des critères d'acceptation.
- **Paiements, allocations, comptabilité générale, dépenses, rapprochement bancaire, portail, notifications, abonnements et certaines intégrations : à construire ou à confirmer module par module.** Ne pas inférer une implémentation complète à partir d'une route, d'un écran ou d'une table.
- **Administration plateforme et rapports : fondations visuelles/routage en cours ;** vérifier les opérations métier, autorisations, audit et données réelles.
- Aucun pourcentage d'avancement global ou de couverture internationale ne doit être annoncé sans inventaire approuvé, pondérations et preuves.

## 6. Environnement local et règles de continuité

Dossier local réel de l'utilisateur : `D:\Projets\zenox-finance-platform`.

Le dossier contient des modifications locales non encore intégrées/confirmées sur GitHub, notamment des changements frontend, des lockfiles et des fichiers non suivis. **Ne pas écraser ces changements et ne pas faire de reset/clean destructif.**

Règles de travail convenues :
1. Continuer d'abord sur GitHub, puis intégrer avec prudence dans le dossier local réel après validation.
2. Ne pas créer ni recommander un dossier local de test séparé comme méthode de travail par défaut.
3. Ne pas lancer de migration sur la base Supabase distante, ni modifier le schéma distant, sans autorisation explicite.
4. Les tests DB doivent utiliser PostgreSQL jetable ; ils ne doivent pas modifier la base Finance distante ou ZENOX FRET V2.
5. Ne pas fusionner la PR #19 ou toute autre PR sans accord explicite.
6. Ne pas refaire les validations déjà prouvées, sauf si le SHA, le code ou le périmètre a changé.
7. Terminer un module à la fois : exigences → code API/domaine/UI → tests de sécurité et de parcours → CI verte sur le SHA exact → documentation/checkpoint.
8. Distinguer clairement : implémenté et validé / implémenté mais non vérifié / partiel / à construire / exigeant une validation externe.

## 7. Prochaine étape recommandée

1. Laisser la PR #19 ouverte jusqu'à décision explicite.
2. Confirmer la CI sur le HEAD actuel après les mises à jour documentaires.
3. Sélectionner le premier module à **fermer complètement**, en privilégiant un domaine de base qui débloque les parcours métier (accès/onboarding et clients/référentiels), ou clôturer la facturation si ses critères restants peuvent être prouvés sur la branche cible.
4. Pour ce module, définir une checklist concrète, examiner le code existant sans refaire l'audit général, implémenter les manques, tester, puis mettre à jour ce checkpoint avec le SHA et les résultats exacts.
5. Ne pas passer au module suivant tant que les critères de complétude convenus ne sont pas satisfaits, sauf dépendance bloquante documentée.

## 8. Changements effectués lors de cette mise à jour

- Ajout de `docs/architecture/2026-10-29-complete-modular-architecture-fr.md`.
- Mise à jour de ce checkpoint pour remplacer les anciennes consignes devenues obsolètes, notamment l'usage d'un dossier local de test séparé.
- Aucun code applicatif modifié dans cette mise à jour documentaire.
- Aucune migration exécutée ; aucune base distante modifiée.
- Aucune PR fusionnée.
