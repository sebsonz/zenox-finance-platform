# M02 — Parcours frontend Onboarding

Le composant `OrganizationOnboardingWizard` est intégré au parcours d'inscription existant `RegistrationWorkspace`. Il ne remplace pas les fonctions d'authentification, confirmation d'e-mail, récupération ou réinitialisation du mot de passe.

## Parcours

1. Identité légale de l'organisation et devise issue du référentiel Finance.
2. Adresse déclarée.
3. Représentant et coordonnées professionnelles.
4. Récapitulatif et consentements distincts aux conditions et à la politique de confidentialité.

Le brouillon est sauvegardé à chaque étape, récupéré au retour sur la page et soumis uniquement à la confirmation finale. Les appels passent par l'API same-origin ; aucun accès direct à Supabase n'est ajouté.

## Limites explicites

Le dépôt de pièces justificatives et l'affichage des exigences par pays ne sont pas simulés. Ils seront intégrés lorsque les contrats backend M11 Documents et M22 Compliance seront effectivement disponibles. Les textes de consentement restent des versions de travail tant que leur validation juridique n'est pas effectuée.

## Validation

Le parcours n'est complet qu'après tests navigateur, contrôle responsive/accessibilité, tests API/PostgreSQL et CI verte sur le SHA livré.
