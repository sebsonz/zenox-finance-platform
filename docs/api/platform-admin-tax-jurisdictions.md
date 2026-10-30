# API — Consultation des juridictions fiscales par la plateforme

**Méthode :** `GET`  
**Chemin :** `/api/v1/user/platform/tax/jurisdictions`  
**Authentification :** session utilisateur Finance vérifiée  
**Autorisation :** opérateur plateforme actif, identité Supabase exacte (`issuer + subject`) et email confirmé.

## Query parameters

| Paramètre | Type | Règle |
|---|---|---|
| `countryCode` | string | ISO-3166 alpha-2 majuscules, optionnel |
| `level` | enum | `COUNTRY`, `STATE`, `PROVINCE`, `REGION`, `CITY`, `SPECIAL_ZONE` |
| `page` | integer | 1 à 10 000, défaut 1 |
| `pageSize` | integer | 1 à 100, défaut 25 |

Les paramètres inconnus ou invalides sont rejetés. Les filtres et limites sont passés par requête SQL paramétrée.

## Réponse

```json
{
  "data": {
    "items": [
      {
        "id": "uuid",
        "code": "BJ",
        "countryCode": "BJ",
        "name": "Bénin",
        "jurisdictionLevel": "COUNTRY",
        "parentId": null,
        "isActive": true,
        "createdAt": "2026-10-30T00:00:00.000Z",
        "updatedAt": "2026-10-30T00:00:00.000Z"
      }
    ],
    "page": 1,
    "pageSize": 25,
    "hasMore": false
  }
}
```

## Sécurité et limites

- La route vérifie l'opérateur côté backend ; aucun rôle du navigateur n'est accepté.
- Réponse `Cache-Control: no-store`.
- M10 Tax reste propriétaire du cas d'usage et de la persistance.
- La policy RLS existante n'expose que les juridictions actives.
- Le runtime a SELECT uniquement ; aucun droit d'écriture n'est accordé.
- Les rôles navigateur `anon`, `authenticated` et `service_role` n'ont pas de grant direct sur la table.
- Cette API ne permet ni de créer ni de modifier des juridictions et ne certifie aucune conformité fiscale.
