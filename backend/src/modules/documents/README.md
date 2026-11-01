# M11 — Documents : justificatifs privés d'inscription

## Fonctions préparées sur la branche

- Métadonnées PostgreSQL liées au brouillon et à l'identité authentifiée.
- Bucket Supabase Storage privé `zenox-registration-documents`, limité aux PDF/JPEG/PNG et 10 Mo.
- Dépôt via l'API Finance, calcul SHA-256, nom assaini et contrôle des signatures de fichiers.
- Liste, téléchargement en proxy sans URL Storage exposée et suppression logique avant soumission.
- Accès aux métadonnées par fonctions SQL SECURITY DEFINER à périmètre limité.
- Interface candidat : dépôt, liste et suppression des justificatifs depuis l'étape de vérification.
- Revue opérateur M20 : liste, téléchargement proxy, acceptation ou rejet avec motif.
- L'accès opérateur est revérifié par SQL contre `finance_is_active_platform_operator`; l'identité du déposant ne peut pas examiner ses propres pièces.

## Routes

Candidat, sous `/api/v1/user/registration/drafts/:draftId/documents` :
- `GET /` liste les pièces du brouillon.
- `POST /` reçoit le fichier brut, avec `x-document-type` et `x-file-name`.
- `GET /:documentId/content` télécharge le fichier par proxy.
- `DELETE /:documentId` marque la pièce supprimée puis nettoie Storage.

Opérateur, sous `/api/v1/user/platform/registration-requests/:requestId/documents` :
- `GET /` liste les pièces du dossier soumis.
- `GET /:documentId/content` télécharge une pièce.
- `POST /:documentId/review` accepte ou rejette une pièce ; le rejet exige un motif.

## Configuration

Définir `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` uniquement dans l'environnement serveur Finance. Ne jamais les publier dans une variable VITE_ ou dans le navigateur.

La migration de bucket détecte le schéma `storage.buckets` : sur Supabase elle crée/met à jour le bucket privé ; sur PostgreSQL CI sans Storage elle laisse le provisioning du bucket à l'environnement Supabase.

## Limites avant production

- Vérification antivirus/quarantaine avant acceptation opérateur.
- Politique de conservation, effacement légal, accès et purge des fichiers supprimés.
- Tests end-to-end avec un projet Supabase Storage de test isolé.
- Interface opérateur visuelle intégrée à la page de détail M20 (les routes API sont présentes, mais cette page n'est pas encore raccordée).
- Audit formel de chaque décision de revue de pièce dans le journal d'audit plateforme.
- Politique de révision après soumission et règles de pièces obligatoires M22 entièrement intégrées.

Aucune conformité juridique n'est déduite du seul dépôt d'un document. Les fonctions et migrations de cette branche ne sont pas encore déployées.
