# ZENOX Finance — préparation de l'authentification réelle

Ce runbook prépare les vrais comptes utilisateurs dans le projet Supabase **dédié à ZENOX Finance**. Il ne demande pas de migrer une base persistante et ne doit jamais être exécuté sur ZENOX FRET V2.

## 1. Identifier le projet correct

Dans Supabase Dashboard, ouvrir le projet Finance dédié et vérifier son Project Ref et son URL. Ne pas utiliser le projet de ZENOX FRET. Si aucun projet Finance dédié n'existe encore, arrêter ici et en créer un avant de continuer.

## 2. Configurer les variables du backend

Dans l'environnement local privé, copier `.env.example` vers `.env`, puis définir :
- `DATABASE_URL` : uniquement la base PostgreSQL dédiée à ZENOX Finance ;
- `FINANCE_SERVICE_TOKEN` : valeur aléatoire secrète d'au moins 32 caractères ;
- `SUPABASE_URL` : URL du projet Finance, sans chemin, par exemple `https://<project-ref>.supabase.co` ;
- `SUPABASE_ANON_KEY` : clé publishable/anon du même projet Finance.

Ne jamais mettre une clé `service_role`, une clé secrète Supabase ou un vrai `DATABASE_URL` dans le frontend, dans Git ou dans un message. Utiliser les secrets gérés par l'hébergeur en production. Ne jamais imprimer le contenu du fichier `.env`.

## 3. Auth — réglages à contrôler dans Supabase

Dans Authentication / URL Configuration :
- Site URL = origine HTTPS réelle de l'application Finance ;
- Redirect URLs incluent exactement l'origine de test et les URLs de confirmation/récupération réellement utilisées ;
- pas de wildcard large en production ; autoriser uniquement les domaines contrôlés ;
- tester que les liens de confirmation et de récupération reviennent vers l'application Finance, et non vers ZENOX FRET.

Dans Authentication / Email :
- confirmation d'adresse activée ;
- modèles de confirmation et de récupération vérifiés ;
- expéditeur configuré pour la livraison réelle ; surveiller spam, délais et limites du fournisseur ;
- tester les liens depuis une boîte e-mail de test contrôlée.

Le frontend utilise le hash du lien Supabase pour détecter `type=signup` et `type=recovery`. Il échange le jeton de session avec le backend et retire le hash de l'URL. Vérifier les deux parcours dans un navigateur réel.

## 4. Vérifier la configuration sans afficher de secrets

Depuis la racine du dépôt, exécuter :
```powershell
Test-Path .env
node -e "const fs=require('fs');const s=fs.readFileSync('.env','utf8');for(const k of ['DATABASE_URL','FINANCE_SERVICE_TOKEN','SUPABASE_URL','SUPABASE_ANON_KEY']){const m=s.match(new RegExp('^'+k+'=(.*)$','m'));console.log(k+': '+(m&&m[1].trim()?'défini':'MANQUANT'))}"
```

Cette commande n'affiche que la présence des variables, jamais leurs valeurs. Vérifier séparément dans le Dashboard que `SUPABASE_URL` et la clé proviennent bien du même projet Finance. Ne pas lancer `db:migrate` dans le cadre de ce contrôle.

## 5. Contrôles HTTP de préproduction

Une fois le backend local lancé avec une base de test Finance jetable et les variables correctes :
- `GET /api/v1/user/session/config` doit retourner `200` avec l'URL et la clé publishable/anon attendues ;
- `GET /api/v1/user/session` sans session doit retourner `401` ;
- une session invalide doit être refusée ;
- aucun secret service-role ne doit apparaître dans le frontend, les réponses HTTP ou les journaux.

Ne pas publier de jeton d'accès ni copier la réponse complète d'une session dans les logs.

## 6. Tester le parcours réel avec des identités contrôlées

Utiliser au minimum deux adresses de test différentes :
1. utilisateur standard : inscription → confirmation → connexion → soumission de l'organisation → statut PENDING ;
2. opérateur : compte distinct, confirmation, puis autorisation par le DBA via le runbook `bootstrap-first-platform-operator.md` ;
3. opérateur : approuver une demande de test ; vérifier que tenant et adhésion OWNER deviennent ACTIVE ;
4. opérateur : refuser une autre demande avec un motif ; vérifier le statut REJECTED et l'absence d'accès au workspace ;
5. utilisateur standard : confirmer qu'il reçoit `403` sur les endpoints d'administration et ne peut lire que ses propres demandes.

Ne jamais utiliser une vraie identité client sans consentement. Aucun utilisateur ne doit être activé automatiquement sur la seule base de la confirmation e-mail.

## 7. Conditions avant activation de production

- [ ] URL et clé publishable/anon vérifiées comme appartenant au projet Finance.
- [ ] URL de site et allowlist de redirection exactes.
- [ ] E-mails de confirmation/récupération livrés et liens testés.
- [ ] Domaine HTTPS de production contrôlé.
- [ ] Base Finance isolée, sauvegardes et accès DBA vérifiés.
- [ ] Rôle PostgreSQL de runtime et privilèges validés sur cette base dédiée.
- [ ] Premier opérateur provisionné avec subject confirmé, jamais deviné.
- [ ] Tests d'accès en attente/approuvé/refusé réussis.
- [ ] Conditions d'utilisation et politique de confidentialité approuvées.
- [ ] Limitation de débit et stratégie de renouvellement de session validées.

Tant que ces contrôles ne sont pas passés, l'application n'est pas déclarée prête pour une ouverture publique.
