# Bootstrap du premier opérateur ZENOX Finance

**Opération privilégiée — à exécuter uniquement par un DBA autorisé sur la base dédiée ZENOX Finance.** Ne jamais exécuter sur la base ZENOX FRET V2 (zenoxfret_v2).

## Préconditions

1. Le projet Supabase Finance dédié est identifié et son URL a été vérifiée.
2. Le futur opérateur a créé son compte via l’interface ZENOX Finance et confirmé son adresse e-mail.
3. L’identité `sub` a été récupérée depuis la session Auth vérifiée / l’administration Auth du bon projet. Ne pas utiliser uniquement l’adresse e-mail, les métadonnées utilisateur ou un UUID deviné.
4. Une demande de changement est approuvée et le DBA a confirmé la base courante avant d’exécuter le SQL.

## SQL de bootstrap

Remplacer les deux valeurs de démonstration ci-dessous par l’issuer exact (l’origine de SUPABASE_URL, sans chemin) et le subject vérifié de l’utilisateur. Ne pas committer de valeurs réelles dans ce fichier.

```sql
BEGIN;

INSERT INTO public.finance_platform_operators
  (identity_issuer, identity_subject, role_code, status)
VALUES
  ('https://YOUR_FINANCE_PROJECT_REF.supabase.co', 'VERIFIED_AUTH_SUBJECT', 'PLATFORM_ADMIN', 'ACTIVE');

COMMIT;
```

Ne pas ajouter de `ON CONFLICT DO UPDATE` automatique : si l’identité existe déjà, arrêter et enquêter plutôt que réactiver silencieusement un opérateur suspendu.

## Vérification post-opération

1. Vérifier l’entrée par issuer + subject via une session DBA privilégiée.
2. Se connecter à l’interface avec le compte confirmé.
3. Vérifier que `GET /api/v1/user/platform/me` renvoie `isPlatformOperator: true`.
4. Vérifier qu’un utilisateur ordinaire reçoit 403 et ne peut ni lister ni décider les demandes.
5. Inscrire l’opération dans le journal de changements, sans copier de jeton, mot de passe ou clé secrète.

## Révocation

Pour suspendre un opérateur, utiliser une opération DBA approuvée qui met son statut à `SUSPENDED`, puis vérifier que les endpoints de revue répondent 403. Ne jamais supprimer l’audit historique.
