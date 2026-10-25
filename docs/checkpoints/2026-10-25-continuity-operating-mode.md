# ZENOX Finance — checkpoint de continuité et mode de fonctionnement

Date : 2026-10-25  
Dépôt : https://github.com/sebsonz/zenox-finance-platform  
Branche documentaire : `docs/international-mvp-and-requirements`  
Objet : règles permanentes de reprise, méthode de travail et état de continuité.

## 1. Mode de fonctionnement convenu — obligatoire à chaque reprise

1. **Lire le checkpoint avant toute action.** Le checkpoint est la mémoire de continuité produit/architecture; GitHub reste la source de vérité du code, des branches, commits, PR et CI.
2. **Commencer par GitHub, pas par demander à l’utilisateur de renvoyer des fichiers.** Lire l’état réel du dépôt, la branche et le commit concernés, les PR ouvertes, leurs dépendances, les workflows/CI, les migrations et la documentation disponibles. Utiliser les fichiers déjà présents dans le dépôt.
3. **Récupérer le travail existant avant de coder.** Comparer les branches/PR GitHub à l’état local et aux sauvegardes connues; établir ce qui existe réellement et où. Ne pas créer de travail parallèle ou de branche de convenance qui détourne le plan sans nécessité démontrée.
4. **Ne pas repartir de zéro et ne pas refaire les validations acquises.** Réutiliser les preuves de CI/tests et les décisions déjà verrouillées. Ne recontrôler que si le code, la branche, les dépendances ou le contexte ont changé, ou si une preuve manque/est périmée.
5. **Distinguer clairement les statuts :** implémenté dans le code; tests locaux exécutés; CI passée sur un commit précis; vérifié sur PostgreSQL jetable; vérifié sur environnement persistant; vérification manuelle/visuelle; non vérifié. Une description de PR ou un statut de conception ne vaut pas preuve d’implémentation complète. Ne jamais annoncer un test réussi sans résultat observable.
6. **Comparer le code réel au MVP international et au cahier des charges complet** avant de choisir la suite. Maintenir une matrice « validé / partiel / manquant / à vérifier », avec preuve GitHub et critères d’acceptation; définir ensuite l’ordre des tâches selon les dépendances produit.
7. **Terminer un module avant de passer au suivant.** Pour chaque module : inspecter les implémentations existantes; corriger la cause minimale; couvrir les cas nominaux, erreurs, permissions/tenant isolation, idempotence et concurrence quand applicables; exécuter typecheck, build, tests, migrations/drift sur PostgreSQL jetable et CI pertinente; faire les vérifications UI/E2E applicables; mettre à jour le checkpoint. Ne pas élargir le périmètre sans raison.
8. **Travailler sur une branche de fonctionnalité/PR brouillon**, préserver `main` et les changements existants. Faire des changements petits, ciblés, traçables, avec checkpoints/sauvegardes. Ne jamais effectuer d’opération Git destructive ou ambiguë pour « débloquer » le travail.
9. **Pas de fusion sans autorisation explicite de l’utilisateur.** Ne pas merger de PR, pousser des changements non approuvés sur `main`, réécrire l’historique ou supprimer branches/commits/sauvegardes. Ne pas faire de reset destructif, force-push, abort d’un merge en cours, pop de stash ou remplacement silencieux du travail local.
10. **Base de données : CI/PostgreSQL jetable uniquement par défaut.** Aucune migration Finance sur une base Supabase persistante, aucun changement de schéma persistant et aucune action destructive sans plan, preuve de sauvegarde et autorisation explicite. La base ZENOX FRET V2 `zenoxfret_v2` est strictement hors limites : ne jamais la modifier ni y exécuter les migrations Finance.
11. **Sécurité financière et multi-tenant non négociable.** Ne pas contourner RLS, affaiblir les tests, élargir les permissions, utiliser un rôle superuser comme runtime, exposer les secrets côté frontend ou stocker des secrets dans Git. Toute correction doit conserver le moindre privilège, l’isolation tenant, l’audit, l’idempotence et la sûreté transactionnelle.
12. **Checkpoint à chaque étape significative et avant un changement de chat.** Noter la branche/commit, les PR, résultats réels des tests/CI et leurs SHAs, fichiers/migrations concernés, décisions verrouillées, problèmes connus, sauvegardes/état Git, ce qui reste non vérifié et la prochaine action exacte. Ne pas présenter une étape comme faite si elle n’a pas été réalisée.
13. **Communication :** rester sur le plan convenu; expliquer brièvement toute déviation et son motif avant de l’engager. Ne pas remplacer l’action demandée par des suggestions génériques, ne pas redemander ce qui est accessible sur GitHub, et ne pas faire d’audit répétitif sans besoin. En cas de blocage, exposer les faits constatés et proposer la correction minimale et sûre.

## 2. Contraintes de sécurité et de continuité locales connues

- Le dépôt local `D:/Projets/zenox-finance-platform` était rapporté en état de **merge en cours** sur `chore/monorepo-frontend-backend-structure`, avec tous les conflits résolus mais merge non finalisé, 79 fichiers indexés (environ 6 635 insertions / 184 suppressions), `MERGE_HEAD=c1765a477585a3aed95172ce2764aa98dabff0a9` et fichiers non suivis `frontend/tsconfig.tsbuildinfo`, `supabase/.temp/`. **À re-vérifier avant toute opération locale.** Ne pas commit, abort ou changer de branche sans inspection et accord explicite.
- Branche de sauvegarde signalée : `safety/pre-integration-20261024`. Un `stash@{0}` de sauvegarde a aussi été signalé. Ne pas supprimer ni pop ce stash.
- Worktrees signalés : `D:/Projets/zenox-finance-platform` sur `a34e22d`; `D:/Projets/zenox-finance-onboarding-test` sur HEAD détaché `c1765a4`. Un worktree homepage-test avait seulement été proposé; sa création n’est pas confirmée.
- Une branche `feature/zenox-finance-public-homepage` a été créée sur GitHub au commit `17251db5659b0082b8e0aefbb8a901e6e35cc094`, basée sur `feature/tenant-registration-onboarding`. Elle n’est pas fusionnée. Ne pas laisser cette branche détourner l’ordre MVP; réévaluer son utilité dans la matrice de conformité.
- Un mot de passe de base distant a été exposé dans des logs de terminal. Ne jamais le recopier; prévoir sa rotation et la mise à jour des variables locales quand cela sera approprié.
- Aucun résultat de build local ne doit être attribué à une branche différente de celle réellement testée.

## 3. État GitHub rapporté au 2026-10-24 — à confirmer sur les commits actuels

Les PR suivantes étaient ouvertes/en brouillon, sans autorisation de fusion :

- **PR #11 — documentation MVP international et exigences complètes.** Référence fonctionnelle et technique, critères d’acceptation et matrice d’audit préliminaire. Prochaine utilisation : comparer le code/migrations/routes/permissions/tests/CI au cahier des charges, sans prendre les statuts documentaires pour une preuve d’implémentation.
- **PR #14 — inscription utilisateur et onboarding organisation.** Description indiquant CI réussie sur le commit `e6acdc87e1cfe0acbe9793bb5876f064c68c41e2` : typecheck/build backend, 21 migrations sur PostgreSQL jetable, 0 en attente, 0 drift, 44 fichiers de test / 205 tests, typecheck/build frontend. Points de production non prouvés : référence exhaustive des pays, droits du rôle runtime, limitation de débit distribuée, configuration email/redirections Supabase, rafraîchissement de session et conditions légales.
- **PR #12 — registre de paiements et allocations résistantes à la concurrence.** Description indiquant CI réussie sur `52c3294815cc307b3ceb70931146dc344cff7e2d`, 43 fichiers / 200 tests, contrôles backend/frontend et migrations/drift PostgreSQL jetable. Les paiements réels via prestataire, tentatives, webhooks signés, exécution des remboursements, rapprochement bancaire et certaines APIs d’événements restent incomplets.
- **PR #10 — extensibilité des règles fiscales et sémantique comptable.** Les données fiscales juridictionnelles et leur validation juridique restent à confirmer; migration non appliquée à une base persistante selon le dernier état connu.
- **PR #9 — workflow authentifié de facturation.** Description indiquant CI réussie sur `bcec8a9de0df49e61f5fc14acd291e7724e8877e`, builds/typechecks, migrations/drift sur PostgreSQL jetable et tests. Inclut brouillons, édition/émission, attribution/audit, snapshot fiscal, HTML/PDF et avoirs; contrôle manuel navigateur/visuel encore requis.
- **PR #8 — identité de marque et site public.** SVG de marque, landing page responsive, page fonctionnalités, navigation mobile et SEO; CI et QA visuelle desktop/mobile à confirmer.
- **PR #13 — isolation de la découverte Vitest sur branche de correction locale.** Brouillon de validation CI; vérifier son rôle réel dans l’intégration.
- **PR #7 et #5 — endpoints/workflows de facturation antérieurs; PR #6 — structure monorepo.** Inspecter leur statut et leur dépendance réelle, ne pas supposer qu’ils sont fusionnés.
- Les requêtes de statut de commit ont précédemment renvoyé des résultats vides; les mentions de CI ci-dessus proviennent des descriptions de PR et doivent être qualifiées comme telles jusqu’à vérification des checks GitHub actuels.

## 4. Prochaine séquence obligatoire

1. Ouvrir et lire le checkpoint, le MVP international et le cahier des charges dans GitHub.
2. Inspecter en lecture seule l’état GitHub actuel : branche par défaut, branches utiles, PR ouvertes/fermées/fusionnées, SHA de tête, checks CI actuels et dépendances. Retrouver le checkpoint maître s’il existe sous un autre chemin.
3. Reconstituer les changements existants depuis GitHub avant toute action locale; tenir compte du merge local signalé comme en cours et préserver les modifications.
4. Produire la matrice de conformité MVP basée sur preuves : **VALIDÉ / PARTIEL / MANQUANT / À VÉRIFIER**, en distinguant les résultats CI par SHA et les vérifications de production.
5. Choisir le prochain module à partir des dépendances et critères d’acceptation du MVP, puis compléter ce module de bout en bout sur une branche dédiée et une PR brouillon. Pas de travail homepage isolé avant d’avoir positionné cette tâche dans la feuille de route.
6. Exécuter les tests réels sur la bonne branche/commit, PostgreSQL jetable et CI; inspecter les résultats actuels. Pas de migration persistante.
7. Mettre à jour ce checkpoint avec le nouveau commit, les preuves de test, les écarts et la prochaine action exacte. Ne pas merger sans autorisation.

## 5. Définition d’une validation

Un point n’est « VALIDÉ » que lorsque ses critères d’acceptation sont définis, le code correspondant est présent sur le SHA indiqué, les tests pertinents ont été réellement exécutés et réussis, les protections sécurité/tenant sont couvertes et les limites restantes sont explicites. Une CI verte prouve seulement les contrôles qu’elle exécute; elle ne prouve pas à elle seule la conformité juridique, l’état d’une base persistante, la qualité visuelle ou la disponibilité en production.

**Prochaine action exacte :** reprendre par une lecture seule de GitHub et du MVP/cahier des charges, confirmer les PR et leurs CI au SHA actuel, puis construire la matrice de conformité sans modifier de code ni de base avant que l’ordre de travail soit établi.


## 6. Règle explicite de dossier local unique et intégration de la page d’accueil

- **Dossier local de travail unique et officiel :** `D:/Projets/zenox-finance-platform`. C’est dans ce dépôt que le produit réel doit être construit et testé.
- **Interdiction de multiplier les dossiers de test/worktrees comme environnement de développement courant.** Les dossiers `zenox-finance-homepage-test` et `zenox-finance-onboarding-test` ne doivent pas devenir des projets parallèles. Ne pas créer d’autre dossier de test ou worktree sans demande/accord explicite. Ne supprimer aucun de ces dossiers ni déplacer/écraser leur contenu sans inventaire et autorisation : ils peuvent contenir des changements à récupérer.
- **Intégration dans le dépôt principal :** les fonctionnalités déjà réalisées dans des branches, PR ou dossiers temporaires doivent être récupérées, comparées et intégrées dans `zenox-finance-platform` en préservant les changements existants. Avant toute opération locale, vérifier l’état réel du dépôt, car un merge local non finalisé était signalé; ne pas basculer de branche ou toucher au merge avant d’avoir sécurisé et compris son contenu.
- **Page d’accueil :** l’utilisateur confirme qu’elle fonctionne actuellement à `http://localhost:5173/#accueil`. La tâche consiste à conserver cette page et à l’intégrer au vrai frontend `frontend/` du dépôt principal, sans reconstruire une deuxième application parallèle. Préserver les liens Accueil, Fonctionnalités, Tarifs, À propos, Ressources, FR, Se connecter et Créer un compte ainsi que le contenu et la maquette existants.
- **Navbar :** rendre la barre de navigation publique persistante pendant le scroll (sticky ou fixed selon la structure réelle), avec un fond opaque, un `z-index` suffisant, aucune superposition du contenu, un décalage de contenu correct si `position: fixed` est choisi, et un comportement mobile cohérent. Vérifier les ancres pour qu’elles ne soient pas masquées sous la barre.
- **Ordre de travail de cette tâche :** (1) inventorier en lecture seule les fichiers de la page d’accueil dans la branche/état local qui fonctionne; (2) comparer avec `frontend/src/public/`, `frontend/src/main.tsx`, `frontend/src/styles.css` et les actifs déjà présents dans le dépôt principal; (3) intégrer uniquement les changements nécessaires dans le dossier unique; (4) corriger la navbar; (5) exécuter typecheck/build et vérifier manuellement les ancres, scroll et responsive; (6) noter les résultats réels dans le checkpoint. Ne pas merger une PR sans autorisation.
