# ZENOX Finance — Architecture cible

Date: 2026-10-28
Statut: architecture de référence proposée pour l'implémentation progressive.
Branche de travail: `feat/modular-routing-architecture` (PR #19, draft; ne pas fusionner avant validation).

## Principes non négociables

1. Une responsabilité claire par fichier; éviter les fichiers monolithiques.
2. Les pages sont des compositions de composants de module, pas des lieux où placer les règles métier.
3. Chaque module possède ses pages, composants, hooks, types, services/API et tests.
4. Les composants réellement partagés vivent dans `shared/`; ne pas partager prématurément du code spécifique à un seul domaine.
5. Les appels HTTP sont centralisés dans des clients/services typés; aucune règle métier ne doit être cachée dans le rendu JSX.
6. L'authentification et l'autorisation serveur restent la source de vérité. Les guards du frontend améliorent l'expérience mais ne remplacent jamais les contrôles backend.
7. Toute donnée d'entreprise doit être isolée par tenant; conserver les contrôles d'accès PostgreSQL/Supabase RLS.
8. Pas de migration Supabase ni de changement de schéma sans validation explicite.
9. Les pages non encore implémentées doivent utiliser des placeholders explicites, sans simuler des données métier comme si elles étaient réelles.
10. Avant toute intégration locale, préserver le working tree existant et tester la branche dans un dossier séparé.

## Arborescence frontend cible

```text
frontend/src/
  main.tsx                         # bootstrap React uniquement
  app/
    App.tsx                        # composition racine et états d'entrée
    router.tsx                     # déclaration des routes
    navigation.ts                  # chemins, noms et métadonnées de navigation
    route-guards/
      RequireSession.tsx
      RequireTenant.tsx
      RequirePlatformRole.tsx
    layouts/
      PublicLayout.tsx
      AuthLayout.tsx
      WorkspaceLayout.tsx
      PlatformLayout.tsx
    providers/
      AppProviders.tsx
    config/
      app-config.ts
    errors/
      RouteErrorBoundary.tsx
      NotFoundPage.tsx
  auth/
    pages/
      LoginPage.tsx
      RegistrationPage.tsx
      EmailConfirmationPage.tsx
      ForgotPasswordPage.tsx
      ResetPasswordPage.tsx
      AcceptInvitationPage.tsx
      PlatformEntryPage.tsx
    components/
    hooks/
    services/
    types/
    tests/
  tenants/
    pages/
      TenantSelectionPage.tsx
      TenantOnboardingPage.tsx
      TenantSettingsPage.tsx
      TenantMembersPage.tsx
    components/
    hooks/
    services/
    types/
    tests/
  dashboard/
    pages/
      DashboardPage.tsx
    components/
    hooks/
    services/
    types/
    tests/
  customers/
    pages/
      CustomerListPage.tsx
      CustomerDetailsPage.tsx
      CustomerCreatePage.tsx
      CustomerEditPage.tsx
    components/
    hooks/
    services/
    types/
    tests/
  suppliers/
    pages/
      SupplierListPage.tsx
      SupplierDetailsPage.tsx
      SupplierCreatePage.tsx
      SupplierEditPage.tsx
    components/
    hooks/
    services/
    types/
    tests/
  invoices/
    pages/
      InvoiceListPage.tsx
      InvoiceDetailsPage.tsx
      InvoiceCreatePage.tsx
      InvoiceEditPage.tsx
      InvoicePreviewPage.tsx
      CreditNoteListPage.tsx
      CreditNoteCreatePage.tsx
    components/
    hooks/
    services/
    types/
    tests/
  payments/
    pages/
      PaymentListPage.tsx
      PaymentDetailsPage.tsx
      PaymentCreatePage.tsx
      PaymentAllocationPage.tsx
      RefundsPage.tsx
    components/
    hooks/
    services/
    types/
    tests/
  taxes/
    pages/
      TaxOverviewPage.tsx
      TaxRulesPage.tsx
      TaxCalculationPage.tsx
      TaxReportsPage.tsx
    components/
    hooks/
    services/
    types/
    tests/
  accounting/
    pages/
      AccountingOverviewPage.tsx
      ChartOfAccountsPage.tsx
      JournalEntriesPage.tsx
      GeneralLedgerPage.tsx
      TrialBalancePage.tsx
      FiscalPeriodsPage.tsx
    components/
    hooks/
    services/
    types/
    tests/
  expenses/
    pages/
      ExpenseListPage.tsx
      ExpenseDetailsPage.tsx
      ExpenseCreatePage.tsx
      ExpenseCategoriesPage.tsx
    components/
    hooks/
    services/
    types/
    tests/
  quotes/
    pages/
      QuoteListPage.tsx
      QuoteDetailsPage.tsx
      QuoteCreatePage.tsx
    components/
    hooks/
    services/
    types/
    tests/
  reports/
    pages/
      ReportsOverviewPage.tsx
      RevenueReportPage.tsx
      TaxReportPage.tsx
      ReceivablesReportPage.tsx
      PaymentsReportPage.tsx
    components/
    hooks/
    services/
    types/
    tests/
  currencies/
    pages/
      CurrencySettingsPage.tsx
      ExchangeRatesPage.tsx
    components/
    hooks/
    services/
    types/
    tests/
  notifications/
    pages/
      NotificationsPage.tsx
      NotificationPreferencesPage.tsx
    components/
    hooks/
    services/
    types/
    tests/
  integrations/
    pages/
      IntegrationsPage.tsx
      IntegrationDetailsPage.tsx
      WebhooksPage.tsx
      ApiKeysPage.tsx
    components/
    hooks/
    services/
    types/
    tests/
  settings/
    pages/
      CompanyProfilePage.tsx
      UserProfilePage.tsx
      SecuritySettingsPage.tsx
      NumberingSettingsPage.tsx
      DocumentSettingsPage.tsx
      BillingPlanPage.tsx
    components/
    hooks/
    services/
    types/
    tests/
  platform/
    pages/
      PlatformDashboardPage.tsx
      RegistrationRequestsPage.tsx
      RegistrationRequestDetailsPage.tsx
      PlatformUsersPage.tsx
      PlatformTenantsPage.tsx
      PlatformAuditLogPage.tsx
      PlatformSettingsPage.tsx
    components/
    hooks/
    services/
    types/
    tests/
  shared/
    components/
      Button/
      DataTable/
      EmptyState/
      ErrorState/
      LoadingState/
      Modal/
      PageHeader/
      Pagination/
      SearchInput/
      StatusBadge/
      FormField/
    hooks/
    layouts/
    lib/
      currency.ts
      date.ts
      format.ts
      validation.ts
    types/
  services/
    api/
      api-client.ts
      api-error.ts
    auth/
    telemetry/
  styles/
    tokens.css
    global.css
  test/
    setup.ts
```

Les dossiers ne doivent être créés que lorsqu'un fichier utile y est ajouté. Cette arborescence décrit la cible, pas une obligation de produire immédiatement des dizaines de fichiers vides.

## Arborescence backend cible

```text
backend/src/
  app.ts                            # construction de l'application Express
  server.ts                         # démarrage du serveur
  config/
    env.ts
    cors.ts
  api/
    v1/
      index.ts                      # montage des routeurs de domaines
  middleware/
    authenticate.ts
    require-tenant.ts
    require-platform-role.ts
    validate-request.ts
    error-handler.ts
    request-id.ts
  modules/
    auth/
    registration/
    tenants/
    dashboard/
    customers/
    suppliers/
    invoices/
    payments/
    taxes/
    accounting/
    expenses/
    quotes/
    reports/
    currencies/
    notifications/
    integrations/
    platform/
  shared/
    database/
    errors/
    logging/
    validation/
    http/
  tests/
    unit/
    integration/
    e2e/
```

Chaque module backend suit autant que possible ce contrat:

```text
modules/<domain>/
  routes/
  controllers/
  services/
  repositories/
  schemas/
  types/
  tests/
```

Ne pas déplacer tous les fichiers existants en une seule opération. Le routage de domaines déjà présent est conservé et chaque extraction est validée séparément.

## Inventaire des pages et ordre de réalisation

### Phase 0 — Fondation
- Routeur, chemins nommés, layout public, layout authentifié, layout plateforme.
- Page 404 et états loading/error/empty communs.
- Session, tenant actif et rôle plateforme centralisés.
- Contrôle d'accès serveur confirmé pour chaque domaine.

### Phase 1 — Parcours déjà commencés
- Landing / connexion / inscription / confirmation e-mail.
- Onboarding et sélection de l'entreprise.
- Dashboard principal.
- Dashboard et demandes d'inscription de l'administration plateforme.
- Factures: liste, création/brouillon, détail, émission, aperçu, avoirs.
- Taxes: calcul et configuration existante.

### Phase 2 — Opérations financières
- Paiements, affectation aux factures, remboursements.
- Clients et fournisseurs.
- Devis.
- Dépenses et justificatifs.

### Phase 3 — Comptabilité et pilotage
- Plan comptable, journaux, grand livre, balance, périodes fiscales.
- Rapports de revenus, créances, taxes et paiements.

### Phase 4 — Configuration et plateforme
- Profil entreprise et utilisateurs.
- Sécurité, numérotation et documents.
- Devises et taux de change.
- Notifications et préférences.
- Intégrations, API keys et webhooks.
- Administration plateforme, audit et paramètres.

### Phase 5 — Stabilisation
- Responsive et accessibilité.
- Permissions par rôle et isolation tenant.
- Tests unitaires, intégration API/DB et parcours navigateur.
- Vérification build/typecheck/lint, performances et erreurs.
- Documentation et checkpoints de continuité.

## Convention d'implémentation d'une page

Une page doit rester courte et orchestrer:
- un en-tête de page;
- les composants du module;
- les hooks/services qui chargent les données;
- les états loading, empty, error et success.

Les validations de saisie vivent dans les schémas/types du module. Les règles métier vivent côté service backend. Les requêtes SQL restent dans les repositories ou les couches de données existantes. Ne pas ajouter de fausses données ou de nouvelles routes API sans documenter leur statut.

## Critères d'acceptation de chaque module

1. Les routes sont nommées et les liens fonctionnent directement par URL.
2. Les accès sont contrôlés côté serveur; un guard frontend seul ne suffit pas.
3. Les états loading, vide, erreur et succès sont traités.
4. Les types TypeScript sont explicites; éviter `any` non justifié.
5. Les appels API sont centralisés et gèrent les erreurs.
6. Les tests du module passent.
7. Le build et le typecheck passent.
8. Aucun changement de schéma/migration n'est exécuté sans accord explicite.
9. Aucun travail local non validé n'est écrasé.
10. Le checkpoint de continuité est mis à jour à la fin d'une étape validée.
