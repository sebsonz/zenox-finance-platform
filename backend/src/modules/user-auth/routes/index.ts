import { Router } from "express";
import { userTenantDirectoryRouter } from "./user-tenant-directory.routes.js";
import { userTenantAccessRouter } from "./user-tenant-access.routes.js";
import { userTenantMembersRouter } from "./user-tenant-members.routes.js";
import { userTenantMemberManagementRouter } from "./user-tenant-member-management.routes.js";
import { userSessionRouter } from "./user-session.routes.js";
import { userInvoiceRouter } from "./user-invoice.routes.js";
import { userCustomerRouter } from "./user-customer.routes.js";
import { userTenantTaxRouter } from "./user-tenant-tax.routes.js";
import { userTenantProfileRouter } from "../../tenants/routes/user-tenant-profile.routes.js";
import { registrationRouter } from "../../registration/routes/registration.routes.js";
import { platformRegistrationRouter } from "../../registration/routes/platform-registration.routes.js";
import { onboardingRouter } from "../../onboarding/routes/onboarding.routes.js";
import { registrationDocumentRouter } from "../../documents/routes/registration-document.routes.js";
import { registrationRequirementsRouter } from "../../compliance/routes/registration-requirements.routes.js";
import { platformOrganizationLifecycleRouter } from "../../platform-admin/routes/organization-lifecycle.routes.js";

/** Composes authenticated user, tenant and platform-registration endpoints. */
export const userAuthRouter = Router();

userAuthRouter.use("/", userTenantDirectoryRouter);
userAuthRouter.use("/", userTenantAccessRouter);
userAuthRouter.use("/", userTenantMembersRouter);
userAuthRouter.use("/", userTenantMemberManagementRouter);
userAuthRouter.use("/", userSessionRouter);
userAuthRouter.use("/registration", registrationRouter);
userAuthRouter.use("/registration", onboardingRouter);
userAuthRouter.use("/registration/drafts/:draftId/documents", registrationDocumentRouter);
userAuthRouter.use("/registration/requirements", registrationRequirementsRouter);
userAuthRouter.use("/platform", platformRegistrationRouter);
userAuthRouter.use("/platform", platformOrganizationLifecycleRouter);
userAuthRouter.use("/tenants", userInvoiceRouter);
userAuthRouter.use("/tenants", userCustomerRouter);
userAuthRouter.use("/tenants", userTenantProfileRouter);
userAuthRouter.use("/tenants", userTenantTaxRouter);
