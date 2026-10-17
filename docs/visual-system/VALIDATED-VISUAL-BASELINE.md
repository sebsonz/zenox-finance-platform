# ZENOX Finance — référence visuelle verrouillée

**Statut : BASELINE À PRÉSERVER — toute modification visuelle nécessite une validation explicite.**  
**Branche de référence :** `feature/zenox-brand-identity`  
**PR :** [#8 — identité de marque et site public](https://github.com/sebsonz/zenox-finance-platform/pull/8)

Ce document est la mémoire durable du projet pour préserver la direction visuelle retenue. Il complète le guide de marque `docs/brand/zenox-brand-guidelines.md`. Il ne constitue pas une autorisation de redesign.

## 1. Règle impérative de continuité

- Ne pas redessiner, remplacer, simplifier ni « moderniser » les visuels validés sans demande explicite.
- Toute correction doit être minimale et ciblée : corriger un défaut de fonctionnement ou d'accessibilité sans changer l'identité, la composition, les couleurs, la hiérarchie ou le ton visuel.
- Si une correction impose de modifier l'apparence, documenter le problème et demander validation avant de l'appliquer.
- Avant chaque intervention frontend, lire ce document et le guide de marque.
- Après chaque intervention, vérifier le diff visuel et la CI. Ne pas présenter une vérification de compilation comme une validation visuelle.
- Garder les écrans de démonstration explicitement identifiés comme illustratifs ; ne pas inventer de données, prix, fonctionnalités disponibles ou promesses de mise en production.

## 2. Identité de marque retenue

- Marque principale : **ZENOX**. Le nom du produit est une déclinaison, ici **Finance**.
- Symbole : forme géométrique inspirée de l'infini, exprimant continuité et connexion.
- Fichiers canoniques :
  - `frontend/public/brand/zenox-symbol.svg` — symbole seul.
  - `frontend/public/brand/zenox-finance-logo.svg` — logo horizontal.
- Palette de référence :
  - Bleu nuit `#0B2D6B`
  - Bleu principal `#2563EB`
  - Bleu lumineux `#2F80FF`
  - Cyan `#06B6D4`
  - Vert `#10B981`
  - Orange `#F59E0B`
  - Rouge `#EF4444`
- Typographie de référence : Inter dans le guide de marque, avec une sans-serif système en secours. Le frontend actuel importe DM Sans et Manrope ; ne pas changer les polices existantes dans le cadre d'un simple correctif sans examiner et valider l'impact visuel.

## 3. Écrans publics à préserver

Source de vérité de l'implémentation : `frontend/src/main.tsx` et `frontend/src/styles.css`.

### Accueil — `/`

Conserver la composition existante :
1. En-tête de marque avec navigation Accueil, Fonctionnalités, Secteurs et Sécurité.
2. Hero avec promesse « Votre gestion financière. Plus claire. Plus simple. », description, appels à l'action et éléments de confiance.
3. Maquette de tableau de bord illustrative avec valeurs indisponibles et mention explicite qu'aucune donnée financière réelle n'est affichée.
4. Bandeau de domaines : facturation, paiements, pilotage et intégrations.
5. Présentation des fonctionnalités.
6. Secteurs : transport/logistique, commerce/distribution, services/entreprises.
7. Section sécurité et isolation par organisation, avec formulation de capacité conçue/prévue plutôt que garantie non vérifiée.
8. Appel à l'action et pied de page.

### Fonctionnalités — `/fonctionnalites`

Conserver la page dédiée, ses groupes de capacités et ses descriptions prudentes. Distinguer ce qui est prévu de ce qui est effectivement opérationnel. Ne pas ajouter de tarifs, essais gratuits, dates de disponibilité ou intégrations présentées comme déjà actives sans validation produit.

### Espace de démonstration — `/app`

Préserver l'espace existant : navigation latérale, barre supérieure, tableaux de bord et écrans d'aperçu. Ne pas remplacer cet espace par une nouvelle maquette ni le confondre avec le site public.

## 4. Comportements à préserver

- Navigation publique entre Accueil et Fonctionnalités.
- Liens d'accès à la plateforme pointant vers `/app`.
- Navigation mobile avec ouverture/fermeture du menu.
- Liens Secteurs et Sécurité ramenant à l'accueil et à la section correspondante.
- Boutons Précédent/Suivant du navigateur synchronisés avec l'URL grâce à `popstate`.
- Mise en page responsive, sans débordement horizontal à 320 px.
- Contrastes lisibles, libellés accessibles et focus clavier visibles.

## 5. Checklist obligatoire avant de déclarer le visuel validé

- [ ] CI verte sur le commit exact à examiner.
- [ ] Accueil vérifié à 320–390 px, tablette et desktop.
- [ ] Fonctionnalités vérifiée aux mêmes tailles.
- [ ] Espace `/app` toujours accessible et non cassé.
- [ ] Menu mobile, liens, historique précédent/suivant testés.
- [ ] Logos SVG, chargement des polices, images et favicon vérifiés.
- [ ] Aucun débordement horizontal, texte coupé ou bouton inaccessible.
- [ ] Captures avant/après conservées lors d'une modification visuelle.
- [ ] Diff comparé à la baseline ; toute modification esthétique non demandée est retirée.
- [ ] Les données de démonstration sont clairement étiquetées et aucun calcul financier réel n'est simulé comme s'il avait été exécuté.
- [ ] Validation explicite du propriétaire du projet avant de verrouiller une nouvelle apparence.

## 6. État de validation au 18 octobre 2026

- CI du commit `4ecc116690f29935655b1dea0159ef53f7e01213` : **réussie**.
- Correction de navigation arrière/avant ajoutée au même commit.
- PR #8 : ouverte, en brouillon, non fusionnée.
- Le succès de CI confirme les contrôles automatisés, pas un contrôle visuel manuel sur navigateur.
- Le guide de marque confirme la direction du symbole infini et du bleu nuit/bleu. Une validation pixel-par-pixel de captures desktop/mobile n'est pas enregistrée ici ; ne pas la prétendre accomplie.
- Aucune base de données ne doit être modifiée dans le cadre de cette tâche.

## 7. Procédure pour les prochains travaux

1. Lire cette référence et `docs/brand/zenox-brand-guidelines.md`.
2. Identifier le problème exact et les fichiers minimaux à modifier.
3. Préserver tous les éléments visuels sans lien avec ce problème.
4. Effectuer un changement ciblé sur la branche de travail.
5. Vérifier le diff, la CI et les tailles d'écran concernées.
6. Mettre à jour ce document seulement si une nouvelle décision visuelle est explicitement approuvée.
7. Ne pas fusionner la PR sans autorisation explicite.
