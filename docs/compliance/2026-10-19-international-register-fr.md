# ZENOX Finance — registre international de conformité (initial)

**État :** étude initiale, non exhaustive, à poursuivre  
**Date de vérification documentaire :** 2026-10-19  
**Objectif :** construire le registre des sources primaires et des travaux de validation, et non certifier la conformité du produit.

## 1. Méthode

Chaque entrée réglementaire doit préciser :
- pays/territoire et opération couverte ;
- autorité ou propriétaire du standard ;
- référence primaire et version ;
- date de publication, date d'effet et dernière vérification ;
- entités et transactions concernées ;
- mentions documentaires, fiscalité, format, transmission, archivage et autorisation ;
- hypothèses/interprétation séparées du texte officiel ;
- statut de revue locale et jeux de tests liés ;
- responsable et prochaine date de contrôle.

Les sources officielles sont privilégiées. Les guides de fournisseurs logiciels peuvent éclairer les parcours produit, mais ne sont pas suffisants pour conclure à une obligation légale. Les fiches synthétiques d'une organisation supranationale doivent être lues avec leurs labels de vérification.

## 2. Registre initial des sources

### INT-STD-001 — Peppol BIS Billing 3.0

- **Type :** spécification technique officielle du réseau.
- **Source :** https://docs.peppol.eu/poacc/billing/3.0/
- **Éléments confirmés :** règles de factures et avoirs, profils, code lists, validation et artefacts Schematron.
- **Version consultée :** release 3.0.21, mai 2026.
- **Date de publication et effet :** les notes de version indiquent publication le 20 mai 2026 et usage obligatoire à partir du 17 août 2026.
- **Conséquence produit :** versionner les règles de validation, schémas, code lists et profils ; conserver la version validée de chaque document.
- **Limite :** être capable de produire UBL/PENPOL BIS valide ne donne pas de statut de participant ou de prestataire agréé.
- **Statut :** SOURCE_OFFICIELLE ; applicability par juridiction à analyser.
- **Référence complémentaire :** https://docs.peppol.eu/poacc/billing/3.0/release-notes/

### INT-STD-002 — EN 16931 et migration de standard

- **Type :** norme européenne et référentiels d'implémentation.
- **Source :** https://ec.europa.eu/digital-building-blocks/sites/spaces/DIGITAL/pages/467108661/European%2BStandard%2Band%2BSpecifications
- **Éléments confirmés :** la page de la Commission indique qu'une édition EN 16931-1:2026 a été publiée en mai 2026 ; l'édition 2017 est retirée formellement mais demeure conforme pendant la migration prévue.
- **Conséquence produit :** ne pas intégrer les contraintes dans le seul code applicatif ; versionner le standard, les règles et les artefacts de validation, et planifier la migration.
- **Limite :** calendrier concret de migration et effet par pays à confirmer auprès des organismes nationaux/autorités compétentes.
- **Statut :** SOURCE_OFFICIELLE ; migration à confirmer par juridiction.

### INT-REG-EU-001 — Directive 2014/55/UE et eInvoicing public

- **Type :** droit européen sur la facturation électronique dans les marchés publics.
- **Source :** https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32014L0055
- **Éléments confirmés :** obligation européenne de prise en charge de la norme dans le champ de la directive sur les marchés publics.
- **Conséquence produit :** séparer B2G et B2B ; ne pas supposer qu'un profil destiné aux marchés publics couvre toutes les règles B2B d'un État.
- **Statut :** SOURCE_OFFICIELLE ; transposition et périmètre national à étudier.

### INT-REG-EU-002 — VAT in the Digital Age (ViDA)

- **Type :** paquet réglementaire européen TVA.
- **Sources :** https://taxation-customs.ec.europa.eu/taxation/vat/vat-digital-age-vida_en ; actes https://eur-lex.europa.eu/
- **Éléments confirmés :** adoption le 11 mars 2025 ; mise en œuvre progressive jusqu'en janvier 2035. Déclaration numérique des opérations B2B transfrontalières à partir du 1er juillet 2030 ; deadline du 1er janvier 2035 pour aligner certains systèmes domestiques de déclaration numérique en temps réel.
- **Conséquence produit :** prévoir événements de données, conservation des attributs nécessaires et connecteurs/reporting versionnés.
- **Limite :** identifier les actes et mesures nationales exactes avant de spécifier les obligations d'un utilisateur.
- **Statut :** SOURCE_OFFICIELLE ; calendrier général vérifié.

### INT-REG-FR-001 — France : facturation électronique et plateformes agréées

- **Type :** règles fiscales/documentaires nationales.
- **Sources :** https://www.impots.gouv.fr/facturation-electronique-et-plateformes-agreees ; https://www.impots.gouv.fr/facturation-electronique-qu-est-ce-que-ca-change-pour-moi
- **Éléments confirmés :** au 1er septembre 2026, les grandes entreprises et ETI doivent émettre via une plateforme agréée ; toutes les entreprises concernées doivent être capables de recevoir des factures électroniques. Le calendrier d'émission est échelonné selon la taille, et l'e-reporting comprend des obligations distinctes.
- **Conséquence produit :** le PDF seul n'est pas une preuve suffisante ; définir réception/émission structurées, e-reporting, statuts et connexion à une plateforme agréée si la juridiction est activée.
- **Limite :** scope entreprise, cas d'exemption, opérations domestiques/transfrontalières et calendrier précis à vérifier individuellement.
- **Statut :** SOURCE_OFFICIELLE ; revue du profil client requise avant activation.

### INT-REG-UK-001 — Royaume-Uni : facture TVA et conservation

- **Type :** règles documentaires TVA.
- **Sources :** https://www.gov.uk/guidance/vat-guide-notice-700 ; https://www.gov.uk/guidance/electronic-invoicing-notice-70063
- **Éléments confirmés :** la documentation HMRC couvre numéro unique séquentiel, date d'émission, date de livraison/prestation, identité et numéro TVA du vendeur, client, description, quantité/étendue, valeurs et taxe avec règles de devise spécifiques.
- **Conséquence produit :** le pack UK doit couvrir les mentions, montants par devise, cas spécifiques et conservation.
- **Limite :** règles précises selon type de facture et transaction à confirmer.
- **Statut :** SOURCE_OFFICIELLE ; matrice transactionnelle à compléter.

### INT-REG-BJ-001 — Bénin : facturation normalisée/MECeF

- **Type :** fiscalité et facturation nationale.
- **Sources :** guide officiel DGI https://api.impots.bj/media/62b9ccd77489a_GUIDE%20DE%20FACTURATION%20NORMALIS%C3%89E.pdf ; Code général des impôts 2025 publié par DGI https://api.impots.bj/media/677eb4aa60935_B%C3%A9nin-Code%20G%C3%A9n%C3%A9ral%20des%20Imp%C3%B4ts%202025.pdf
- **Éléments confirmés :** le guide décrit l'usage de MECEf/e-MECEf et des mentions de facture, dont numéro/date, informations du vendeur/acheteur, IFU, lignes, montant, identifiant de l'équipement et code/signature électronique. La publication CGI 2025 comporte des dispositions relatives aux factures normalisées et à l'acompte sur impôt.
- **Conséquence produit :** le pack Bénin doit établir si le logiciel nécessite une homologation, un opérateur certifié, une connexion/transmission à un système de l'autorité ou une procédure spécifique ; la simple génération d'un PDF ne doit pas être présentée comme une facture normalisée.
- **Limite critique :** vérifier texte consolidé applicable en 2026, arrêtés/circulaires en vigueur, cas et taux de l'AIB, périmètre des utilisateurs et procédures techniques auprès de la DGI ou d'un conseil fiscal local. Ne pas calculer/activer un taux AIB au seul motif qu'un chiffre apparaît dans une édition antérieure du CGI.
- **Statut :** SOURCE_OFFICIELLE identifiée ; AVIS_LOCAL_REQUIS avant activation.

### INT-REG-AE-001 — Émirats arabes unis : e-invoicing

- **Type :** cadre fiscal et accréditation des prestataires.
- **Source :** https://www.tax.gov.ae/en/taxes/Vat/uae.einvoicing.aspx
- **Éléments confirmés :** l'autorité définit l'e-invoice comme échange structuré et transmission électronique à l'autorité ; PDF, Word, image ou scan seuls ne sont pas considérés comme e-invoices. La page renvoie notamment aux décisions ministérielles 243/2025 et 244/2025 ainsi qu'à la liste de prestataires préapprouvés.
- **Conséquence produit :** modèle structuré et adaptateur/service provider conformes au programme ; suivi de transmission.
- **Limite :** dates, phases, exemptions, éléments de données et rôle du prestataire à vérifier dans les décisions applicables.
- **Statut :** SOURCE_OFFICIELLE ; analyse juridique/technique locale requise.

### INT-REG-SG-001 — Singapour : GST InvoiceNow

- **Type :** déclaration/transmission numérique et GST.
- **Source :** https://www.iras.gov.sg/taxes/goods-services-tax-(gst)/gst-invoicenow-requirement
- **Éléments confirmés :** IRAS décrit le GST InvoiceNow Requirement ; les dates applicables aux entreprises enregistrées à la GST peuvent être communiquées par catégorie et par date d'implémentation.
- **Conséquence produit :** représenter eligibility, dates d'entrée en vigueur, données exigées et statut de transmission par profil fiscal.
- **Limite :** calendrier détaillé et exigences techniques à confirmer dans les directives IRAS courantes.
- **Statut :** SOURCE_OFFICIELLE ; détails à confirmer avant activation.

### INT-REG-IN-001 — Inde : e-invoicing GST

- **Type :** déclaration/validation d'invoices dans le régime GST.
- **Source primaire :** notification CBIC No. 10/2023-Central Tax du 10 mai 2023 : https://einvoice6.gst.gov.in/content/wp-content/uploads/2023/05/GST-notification-10-central-tax-english-2023.pdf
- **Éléments confirmés :** la notification substitue le seuil de 5 crores de roupies au seuil de 10 crores dans la notification visée, à partir du 1er août 2023.
- **Conséquence produit :** règles de seuil/périmètre versionnées avec date d'effet ; identifiants de retour portail et validation avant distribution lorsque requis.
- **Limite :** seuil et règles applicables en 2026 doivent être vérifiés selon les notifications récentes, le type d'entité et les exceptions.
- **Statut :** SOURCE_OFFICIELLE historique ; À_CONFIRMER pour le périmètre actuel.

### INT-PRINC-001 — OCDE : International VAT/GST Guidelines

- **Type :** lignes directrices internationales, non loi nationale.
- **Sources :** https://www.oecd.org/en/publications/2017/04/international-vat-gst-guidelines_g1g75db4.html ; https://www.oecd.org/en/topics/vat-policy-and-administration.html
- **Éléments confirmés :** principes de traitement de la TVA/GST sur les opérations internationales, notamment les services et actifs incorporels, conçus comme référence pour les décideurs et non comme prescriptions détaillées nationales.
- **Conséquence produit :** utiliser comme aide de conception des faits et cas fiscaux transfrontaliers, puis appliquer les législations de chaque juridiction.
- **Statut :** SOURCE_OFFICIELLE ; doctrine de référence, pas règle exécutoire à elle seule.

### INT-STD-003 — Norme européenne et UBL/Peppol

- **Source :** Commission européenne, eInvoicing Standard and Specifications : https://ec.europa.eu/digital-building-blocks/sites/spaces/DIGITAL/pages/467108661/European%2BStandard%2Band%2BSpecifications
- **Point de vigilance :** la page indique une édition EN 16931-1:2026 publiée en mai 2026, tout en signalant que la page et les modalités détaillées de migration sont en cours de révision. L'équipe doit suivre les documents CEN et autorités nationales pour les dates opérationnelles exactes.
- **Statut :** SOURCE_OFFICIELLE ; migration technique à suivre.

## 3. Comparateurs produits — source secondaire, non source légale

- Zoho Invoice : https://www.zoho.com/sa/invoice/features/
- QuickBooks : https://quickbooks.intuit.com/learn-support/en-us/help-article/multicurrency/learn-multicurrency-quickbooks-online/L5krkKQi8_US_en_US?uid=lo95xcv
- Stripe Invoicing / API : https://docs.stripe.com/api/invoices
- Stripe idempotency : https://docs.stripe.com/api/idempotent_requests

À utiliser pour benchmark fonctionnel, pas pour déduire une obligation ou prouver la conformité d'une juridiction.

## 4. Contrôle de la qualité des sources

La Commission européenne précise que les fiches pays de facturation électronique 2026 sont en cours de mise à jour et n'ont pas toutes été validées par les représentants nationaux ; leur statut de vérification doit être respecté. Source : https://ec.europa.eu/digital-building-blocks/sites/spaces/einvoicingCFS/pages/956171270/2026%2BeInvoicing%2BCountry%2Bfactsheets (consultée 2026-10-19). Ne pas traiter une fiche marquée non vérifiée comme une confirmation officielle nationale.

## 5. Suivi des sources à compléter

1. Identifier pays pilotes et cas B2B/B2C/B2G.
2. Pour chaque pays pilote, collecter loi/texte consolidé, guides de l'autorité, schéma technique, listes de codes, API, processus d'enregistrement/agrément et calendrier.
3. Faire revue locale des points d'interprétation.
4. Créer des fixtures de conformité versionnées et des tests de non-régression.
5. Définir propriétaire de la source, date de revue périodique et alerte avant échéance.
6. Ne promouvoir un pack qu'après acceptation documentée de tous ses critères bloquants.
