# ZENOX Finance — Référence visuelle validée du module Facturation

Date de référence : 2026-11-07  
Source : visuel fourni et validé par l'utilisateur « Proposition premium ZENOX Finance Facturation ».

## Décision de conception

Ce visuel est la référence UX/UI à respecter pendant l'implémentation des Lots 1 à 6. Il ne s'agit pas d'une inspiration facultative : les écrans et parcours de facturation doivent converger vers cette organisation, ce niveau de finition et cette identité Premium Enterprise. Les fonctionnalités métier ne doivent pas être sacrifiées pour reproduire uniquement l'apparence.

## Identité visuelle

- En-tête et navigation avec bleu nuit profond, surfaces blanches et dégradés bleus réservés aux accents de marque.
- Logo et lockup ZENOX Finance cohérents dans les espaces authentifiés et les documents.
- Typographie nette et hiérarchie dense mais lisible ; titres structurés, libellés compacts, tableaux professionnels.
- Cartes à rayons modérés, bordures discrètes, ombres légères, statuts colorés et contrastés.
- Actions principales bleues, actions secondaires sobres, alertes sémantiques.
- Responsive : tableaux et formulaires doivent rester utilisables sur petit écran.

## Écrans représentés dans le visuel

1. **Tableau de bord de facturation** : chiffre d'affaires HT, total encaissé, reste à payer, factures en retard, évolution du chiffre d'affaires, répartition des statuts, dernières factures.
2. **Création d'une facture** : navigation par sections Informations, Lignes, Conditions, Aperçu ; type de document, client, numéro, devise, dates, conditions de paiement, lignes détaillées, remise globale, notes et total recalculé.
3. **Aperçu et impression PDF** : identité complète de l'émetteur et du client, identifiants, adresses, dates, références, lignes, détails des taxes, totaux, modalités et coordonnées de paiement, QR de vérification.
4. **Gestion des factures** : recherche, filtres par statut/type/période, liste et actions contextualisées.
5. **Centre fiscal** : juridictions, taxes et taux, règles fiscales, exonérations, historique et versions.
6. **Types de documents** : facture standard, pro forma, facture d'acompte, facture de situation, facture de solde, facture récurrente, facture d'exportation, avoir/correction, facture complémentaire, devis, bon de commande et reçu de paiement.
7. **Juridictions et règles fiscales** : pays/territoires, devises, régimes fiscaux, statuts actifs, configuration et règles par juridiction.

## Exigences fonctionnelles issues du visuel

- Le tableau de bord doit être alimenté par les données réelles du tenant, jamais par les valeurs d'exemple du visuel.
- Le formulaire est un véritable espace de travail avec sections/étapes, lignes multiples, remise globale, conditions de paiement et aperçu avant émission.
- L'aperçu HTML/PDF doit être fidèle aux informations enregistrées et aux snapshots immuables de l'émetteur, du client et de la fiscalité.
- Les documents de nature différente ont des agrégats, états et règles distincts ; un simple sélecteur de type ne suffit pas.
- La gestion de factures doit proposer recherche, filtres, détail, historique, artefacts, paiements et actions autorisées.
- Le centre fiscal doit être administrable selon les permissions et les juridictions configurées.
- Les coordonnées bancaires et QR ne doivent être affichés que si configurés et vérifiés ; aucune donnée fictive ne doit être imprimée comme réelle.

## Séparation entre visuel et conformité légale

Les montants, numéros, clients, taux, banques, juridictions et mentions figurant dans le visuel sont des données de démonstration. Ils ne constituent ni des données de production, ni des règles fiscales validées, ni une preuve de conformité légale. Les exigences fiscales doivent être paramétrées et vérifiées juridiction par juridiction avant d'activer l'émission correspondante.

## Règle de livraison

L'implémentation doit conserver simultanément :
- l'identité visuelle validée ;
- des workflows complets, avec droits et audit ;
- des calculs financiers et fiscaux déterministes ;
- des documents émis immuables et vérifiables ;
- l'isolation stricte des tenants ;
- des migrations additives et une campagne finale unique de tests, conformément à la consigne utilisateur.
