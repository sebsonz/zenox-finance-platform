# ZENOX Finance — référentiel produit

Date de référence : 2026-10-19  
Branche de travail : `feature/tax-rule-extensibility`  
Checkpoint maître : [2026-10-19](../checkpoints/2026-10-19-master-continuity-international-mvp.md)

## Documents de référence

1. [Périmètre MVP et vision produit](2026-10-19-mvp-scope-fr.md)
2. [Cahier des charges fonctionnel et technique](2026-10-19-functional-technical-spec-fr.md)
3. [Référentiel international initial](../compliance/2026-10-19-international-register-fr.md)
4. [Couverture, critères d'acceptation et feuille de route](2026-10-19-coverage-acceptance-roadmap-fr.md)
5. [Sprint 01 — recherche internationale et juridictions pilotes](../compliance/2026-10-19-research-sprint-01-pilot-jurisdictions-fr.md)

## Règles de lecture

Ces documents constituent une base produit versionnée à examiner avant l'audit des écarts. Ils ne prouvent pas que les exigences sont déjà implémentées. Les statuts de conformité décrivent la qualité de la preuve documentaire et réglementaire, pas une homologation.

### Étiquettes de preuve

- **SOURCE_OFFICIELLE** : document émis par une autorité, un organisme de normalisation ou le propriétaire du standard.
- **TEST_CI** : test automatisé réussi sur un SHA explicitement identifié.
- **IMPLÉMENTÉ_NON_VÉRIFIÉ** : le code semble présent, mais une preuve appropriée du commit courant manque.
- **PROPOSÉ** : décision produit recommandée à valider.
- **À_CONFIRMER** : source, portée, date ou interprétation à vérifier.
- **AVIS_LOCAL_REQUIS** : la validation doit être faite par un professionnel ou organisme compétent dans la juridiction.

## Ordre de travail

1. Rechercher les exigences internationales et tenir le registre des sources.
2. Stabiliser le MVP et le cahier des charges.
3. Vérifier et approuver les critères d'acceptation.
4. Auditer le dépôt, les branches/PR et les preuves CI en fonction des exigences.
5. Prioriser les écarts et mettre à jour ce référentiel.

Aucune PR ne doit être fusionnée, aucun déploiement lancé et aucune migration ne doit être appliquée à une base persistante sans autorisation explicite. Les tests de migration utilisent PostgreSQL jetable. La base `zenoxfret_v2` est hors périmètre et ne doit pas être touchée.
