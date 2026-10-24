# ZENOX Finance — sprint de recherche internationale 01
**Date de recherche :** 2026-10-19  
**Branche de travail :** `feature/tax-rule-extensibility`  
**Statut :** synthèse de recherche officielle initiale — non équivalente à un avis juridique ni à une homologation.

## 1. Décision de cadrage proposée

Construire le cœur universel du SaaS, puis activer uniquement des **profils juridictionnels limités et explicitement validés**. Pour la première phase d'étude et de validation métier, retenir :

1. **Bénin** — profil pilote prioritaire, car le dispositif de facture normalisée et MECeF/e-MECeF impose de traiter l'authentification réglementaire et l'approbation du système comme des capacités distinctes de la génération PDF.
2. **France** — profil de comparaison européen, en intégrant le fait que la transmission réglementaire passe par une plateforme agréée. Le lancement du profil ne doit pas laisser entendre que ZENOX Finance est lui-même une plateforme agréée.
3. **Peppol BIS Billing / EN 16931** — socle technique structuré, non une juridiction autonome ni une preuve d'autorisation nationale.
4. **Singapour** — référence comparative ultérieure pour un déploiement progressif d'InvoiceNow et la transmission des données GST.

Ce classement est une priorité de recherche et de produit, pas une déclaration que ces profils sont prêts pour la production.

## 2. Registre des sources consultées et conséquences produit

### RS-01 — Bénin : Code général des impôts 2026

- **Source primaire :** DGI, *Code Général des Impôts 2026*, version officielle : https://api.impots.bj/media/6984ebbbb7bc0_B%C3%A9nin-Code%20G%C3%A9n%C3%A9ral%20des%20Imp%C3%B4ts%202026.pdf
- **Constat :** une édition officielle 2026 du CGI est publiée sur le domaine de la DGI. Le PDF n'a pas pu être intégralement consulté au cours de ce sprint ; les articles précis doivent donc être extraits et vérifiés avant de convertir les règles en paramètres.
- **Statut :** SOURCE_OFFICIELLE ; contenu détaillé À_CONFIRMER.
- **Action :** vérifier les articles sur TVA, factures normalisées, MECeF/e-MECeF, retenues et acomptes, AIB, exemptions, mentions obligatoires, sanctions, archivage et dates d'effet. Enregistrer numéro d'article, texte, source, date de contrôle et tests.
- **Interdiction :** ne pas coder ni activer un taux AIB ou une règle fiscale en se basant sur un exemple, un ancien taux ou une source secondaire non confirmée.

### RS-02 — Bénin : facture normalisée et SFE/e-MECeF

- **Sources primaires :**
  - Guide DGI de facturation normalisée : https://api.impots.bj/media/62b9ccd77489a_GUIDE%20DE%20FACTURATION%20NORMALIS%C3%89E.pdf
  - Portail officiel e-MECeF : https://e-mecef.impots.bj/
  - Portail DGI de vérification des factures : https://sygmef.impots.bj/verification
  - Portail d'assistance MECeF : https://supportmecef.impots.bj/mecef/index.xhtml
- **Constats documentés :** la DGI décrit la facture normalisée et le dispositif MECeF/e-MECeF. Le portail e-MECeF indique qu'un système de facturation d'entreprise (SFE) doit être approuvé avant son utilisation avec e-MECeF, avec accès à une plateforme de test, documentation/API/SDK, jeton et cas de tests. Le guide officiel liste des données d'identification et de transaction et des éléments d'authentification propres à la facture normalisée.
- **Conséquences produit :**
  - séparer le document commercial interne, le PDF rendu, le document fiscal normalisé et la réponse/identifiant de la DGI ;
  - concevoir un adaptateur MECeF isolé, avec environnement de test/production, credentials secrets, appels idempotents, corrélation, réponses, erreurs, reprise et journal d'audit ;
  - modéliser un cycle de vie d'émission réglementaire : préparé → soumis → accepté/rejeté/en attente, sans inventer un statut d'acceptation ;
  - conserver les identifiants et preuves retournés par le système officiel, si le flux approuvé le permet ;
  - ne jamais afficher « conforme Bénin » avant la validation réglementaire du périmètre réellement pris en charge.
- **Limites :** vérifier les spécifications API et le processus de validation à jour auprès de la DGI. Le guide disponible peut être ancien ; le CGI 2026 et les textes ultérieurs priment pour l'état du droit.
- **Statut :** SOURCE_OFFICIELLE ; intégration et périmètre applicables À_CONFIRMER ; AVIS_LOCAL_REQUIS.

### RS-03 — Bénin : évolution des instructions administratives

- **Source primaire :** rescrits/questions-réponses DGI, entrée sur la facturation normalisée et biens de faible valeur : https://rescrits.impots.bj/questionreponse.php?categorie=OBLIGATIONS+DES+CONTRIBUABLES&nature=OBLIGATIONS+DES+CONTRIBUABLES&rescrit=D%C3%A9rogation+%C3%A0+l%27obligation+de+d%C3%A9livrance+de+facture+normalis%C3%A9e+et+biens+de+faible+valeur
- **Constat :** la réponse publiée indique que la note circulaire n° 1260 de 2021 a été remplacée en 2025 par la note circulaire n° 1742 du 28 août 2025 ; elle cite également une lettre du 7 janvier 2026.
- **Conséquence produit :** le registre ne doit pas figer une ancienne circulaire. Les exceptions doivent être des règles avec source, période d'effet, champ d'application et approbation.
- **Statut :** SOURCE_OFFICIELLE pour l'information affichée ; texte intégral et portée juridique À_CONFIRMER.

### RS-04 — France : calendrier et rôle des plateformes agréées

- **Sources primaires :**
  - DGFiP, facturation électronique et plateformes agréées : https://www.impots.gouv.fr/facturation-electronique-et-plateformes-agreees
  - DGFiP, question sur le circuit de facturation et d'e-reporting, mise à jour du 16 janvier 2026 : https://www.impots.gouv.fr/professionnel/questions/dans-le-cadre-de-la-reforme-de-la-facturation-electronique-comment-devrais
  - Fiche calendrier officielle : https://www.impots.gouv.fr/sites/default/files/media/1_metier/2_professionnel/EV/2_gestion/290_facturation_electronique/fiche-1_que-va-t-il-se-passer-pour-mon-entreprise.pdf
- **Constats :** toutes les entreprises assujetties concernées doivent être capables de recevoir des factures électroniques à compter du 1er septembre 2026. L'émission démarre à cette date pour les grandes entreprises et ETI ; les microentreprises et PME suivent au 1er septembre 2027. Le dispositif distingue e-invoicing et e-reporting. Une plateforme agréée immatriculée par l'administration assure les fonctions réglementaires correspondantes ; un logiciel compatible n'a pas automatiquement ce statut.
- **Conséquences produit :**
  - modéliser la réception, l'émission structurée, les statuts d'échange, les données de transaction/paiement et l'e-reporting comme fonctions séparées ;
  - prévoir un connecteur vers une plateforme agréée et son contrat/version d'API, plutôt que déclarer ZENOX lui-même agréé ;
  - calculer l'éligibilité selon l'entité, son statut, la nature de l'opération et le calendrier ; traiter les exceptions uniquement après vérification officielle ;
  - archiver la preuve de transmission, les accusés, rejets et événements.
- **Statut :** SOURCE_OFFICIELLE ; règles détaillées par opération, taille et exemption À_CONFIRMER avant activation.

### RS-05 — Union européenne : socle commun de facturation TVA

- **Source primaire :** Commission européenne, VAT Invoicing : https://taxation-customs.ec.europa.eu/taxation/vat/vat-businesses/invoicing_en
- **Constats :** les règles communes européennes coexistent avec des règles nationales. Les exigences de facture couvrent notamment date, numéro séquentiel, identités, lignes, prix hors taxe, taux et montant de TVA et ventilations ; certaines mentions dépendent du contexte, par exemple l'exonération ou l'autoliquidation.
- **Conséquences produit :**
  - séparer les exigences communes des variantes nationales et des cas B2B/B2C/B2G ;
  - construire des tests de validation sur les mentions obligatoires et conditionnelles ;
  - ne pas déduire d'une conformité à la norme européenne que toutes les règles nationales sont satisfaites.
- **Statut :** SOURCE_OFFICIELLE ; exigences nationales à étudier pour chaque pays activé.

### RS-06 — Peppol BIS Billing 3.0

- **Sources primaires :**
  - Spécification : https://docs.peppol.eu/poacc/billing/3.0/bis/
  - Notes de version : https://docs.peppol.eu/poacc/billing/3.0/release-notes/
- **Constats :** la version 3.0.21 a été publiée le 20 mai 2026 et est indiquée comme obligatoire à partir du 17 août 2026 dans le cadre Peppol. La spécification traite des factures et avoirs, règles de calcul/arrondi, listes de codes et validations.
- **Conséquences produit :** versionner le format, les listes de codes et artefacts de validation ; conserver pour chaque document la version effectivement appliquée et le résultat de validation.
- **Limite :** un fichier valide ne donne pas, à lui seul, accès au réseau ni droit d'émettre en tant que participant/prestataire.
- **Statut :** SOURCE_OFFICIELLE ; applicabilité et conditions d'accès à vérifier pour chaque connecteur.

### RS-07 — Union européenne : ViDA

- **Source primaire :** Commission européenne : https://taxation-customs.ec.europa.eu/taxation/vat/vat-digital-age-vida_en
- **Constats :** le paquet ViDA a été adopté le 11 mars 2025 ; la Commission décrit une mise en œuvre progressive jusqu'en 2035, avec des exigences de déclaration numérique pour les transactions B2B transfrontalières à compter du 1er juillet 2030 et une échéance du 1er janvier 2035 pour aligner certains systèmes nationaux.
- **Conséquences produit :** préserver les données de transaction nécessaires au reporting, les identifiants des parties, les catégories de transaction, les dates fiscales, les montants et les références de facture ; concevoir des connecteurs et schémas versionnés.
- **Limite :** une échéance générale européenne ne suffit pas pour déterminer les obligations d'une entreprise ou d'un pays donné.
- **Statut :** SOURCE_OFFICIELLE ; analyse par acte et transposition nationale requise.

### RS-08 — Singapour : GST InvoiceNow

- **Sources primaires :**
  - IRAS, GST InvoiceNow Requirement : https://www.iras.gov.sg/taxes/goods-services-tax-%28gst%29/gst-invoicenow-requirement
  - Guide fiscal IRAS mis à jour en mars 2026 : https://www.iras.gov.sg/latest-updates/11
- **Constats :** InvoiceNow s'appuie sur Peppol ; l'IRAS décrit une adoption progressive du transfert des données de facturation pour les entreprises enregistrées à la GST. La page officielle présente plusieurs dates selon le type et la situation de l'entreprise, dont des échéances commençant en 2025 et 2026, puis une extension par phases jusqu'en 2031.
- **Conséquences produit :** les règles d'obligation doivent dépendre du profil d'entreprise et de la date applicable, et non d'un simple indicateur national « e-invoicing activé ».
- **Statut :** SOURCE_OFFICIELLE ; conditions d'éligibilité et phase applicable à vérifier pour chaque cas.

## 3. Exigences transversales à incorporer au cahier des charges

### REG-001 — Registre de sources
Chaque règle activable doit avoir une juridiction, un champ transactionnel, une autorité, une référence primaire, une version, une date de publication, une date d'effet, une date de fin si applicable, une date de vérification, un propriétaire, un approbateur et des tests reliés.

### REG-002 — Séparation des responsabilités
Séparer le moteur de calcul fiscal, la construction du document métier, le rendu PDF, la sérialisation structurée, la validation de format et la transmission réglementaire. Un succès à une étape ne doit jamais être assimilé au succès des autres.

### REG-003 — Version et snapshot immuables
À l'émission, conserver le snapshot des parties, lignes, bases, règles, taux, montants, arrondis, devise, format et version de règle/standard réellement appliqués. Une mise à jour ultérieure ne modifie pas silencieusement une facture déjà émise.

### REG-004 — Échec sûr
Bloquer l'émission marquée « conforme » lorsque la règle requise est absente, expirée, ambiguë, non approuvée ou non applicable. Offrir un brouillon/export non réglementaire seulement avec un statut explicite qui ne suggère pas une conformité officielle.

### REG-005 — Transmission fiable
Chaque adaptateur réglementaire doit gérer l'idempotence, les reprises contrôlées, les délais d'attente, les erreurs permanentes/transitoires, les accusés, les rejets, les événements dupliqués et les secrets. Les tentatives et réponses doivent être auditables.

### REG-006 — Activation par périmètre
Un profil ne devient « pris en charge » qu'après validation de son périmètre exact (type d'entreprise, opérations, taxes, format, canal de transmission, date d'effet), tests de non-régression et revue externe lorsqu'elle est requise. Afficher les limites de couverture.

### REG-007 — Changement réglementaire
Toute évolution de loi, circulaire, norme, code list ou API suit un workflow : détection → analyse d'impact → proposition versionnée → approbation → tests de référence → activation à la date prévue → surveillance et procédure de retour arrière compatible avec l'historique.

## 4. Décisions encore ouvertes

1. Confirmer le périmètre initial exact du pilote Bénin : facturation commerciale interne seule, génération assistée, intégration e-MECeF après validation, ou autre scénario.
2. Obtenir et analyser les spécifications développeur/API e-MECeF à jour, les conditions d'accès et les étapes d'approbation du SFE.
3. Extraire les articles pertinents du CGI béninois 2026 et vérifier l'AIB, les régimes/exemptions et les mentions selon les types de transaction.
4. Déterminer la stratégie France : connecteur à une plateforme agréée partenaire ou simple compatibilité logicielle ; ne pas revendiquer l'agrément de plateforme.
5. Définir la première liste de transactions et profils couverts (domestique B2B, B2C, B2G, export/import, services, avoirs, acomptes) par juridiction.
6. Désigner un valideur fiscal/juridique local pour le périmètre pilote avant toute promesse de conformité.

## 5. Prochaine étape recommandée

Poursuivre la recherche primaire **Bénin en profondeur** : extraire les articles du CGI 2026 et les textes d'application actuels, vérifier les règles AIB et la facture normalisée, puis convertir chaque règle en exigence traçable et en cas de test. Ensuite, effectuer le même travail ciblé pour la France, sans commencer l'audit de code avant la stabilisation du MVP et des critères d'acceptation.
