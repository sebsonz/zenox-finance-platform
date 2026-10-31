# M11 — Documents : justificatifs privés d'inscription

## Implémenté dans la branche

- Métadonnées PostgreSQL liées à un brouillon et à l'identité authentifiée.
- Bucket Supabase Storage privé `zenox-registration-documents`, limité aux PDF/JPEG/PNG et 10 Mo.
- Dépôt par l'API Finance, calcul SHA-256, nom de fichier assaini et compensation du fichier Storage si l'écriture des métadonnées échoue.
- Liste, téléchargement en proxy par l'API (aucune URL Storage exposée) et suppression avant soumission.
- Vérification de la propriété du brouillon pour chaque opération.
- La clé de service Storage est une configuration serveur facultative et ne doit jamais être injectée dans le frontend.

## Configuration

Définir `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` uniquement dans l'environnement serveur Finance. Ne jamais les publier dans une variable VITE_ ou dans le navigateur.

La migration `20261031000300_registration_private_documents.sql` suppose que le schéma Storage Supabase est installé. Elle crée le bucket privé et la table de métadonnées sans accorder d'accès direct aux rôles navigateur.

## Reste à finaliser avant production

- Tests d'intégration Storage sur un projet Supabase de test isolé (les tests PostgreSQL purs ne valident pas le service Storage).
- Liaison des pièces au dossier de demande après soumission et affichage dans la revue M20.
- Contrôle antivirus/quarantaine avant validation d'un justificatif.
- Politique de conservation, suppression et accès opérateur.
- Intégration du moteur M22 pour déterminer les pièces requises par juridiction.

Aucune conformité juridique n'est déduite du seul dépôt d'un document.