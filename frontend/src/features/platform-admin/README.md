# Fonctionnalité frontend — Administration plateforme

La fonctionnalité `platform-admin` contient les vues de contrôle-plane réservées aux opérateurs de la plateforme Finance.

- Les pages et composants sont organisés ici, sans déplacer le shell global.
- `PlatformAdminDashboard` conserve la composition et la navigation de la console.
- Les appels HTTP sont regroupés dans des clients API typés.
- L'interface affiche uniquement des données réellement fournies par une API autorisée ; aucune métrique ou juridiction fictive n'est créée.
- Le masquage des éléments de navigation améliore l'expérience, mais ne remplace jamais l'autorisation backend.
- Les vues fiscales d'administration restent en lecture seule dans cette première tranche.

La fonctionnalité est en cours de construction et n'est pas déclarée complète.
