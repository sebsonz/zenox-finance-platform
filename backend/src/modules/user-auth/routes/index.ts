import { Router } from "express";
import { userTenantDirectoryRouter } from "./user-tenant-directory.routes.js";
import { userTenantAccessRouter } from "./user-tenant-access.routes.js";
import { userSessionRouter } from "./user-session.routes.js";
import { userInvoiceRouter } from "./user-invoice.routes.js";
import { registrationRouter } from "../../registration/routes/registration.routes.js";
import { platformRegistrationRouter } from "../../registration/routes/platform-registration.routes.js";

/** Composes authenticated user, tenant and platform-registration endpoints. */
export const userAuthRouter = Router();

userAuthRouter.use("/", userTenantDirectoryRouter);
userAuthRouter.use("/", userTenantAccessRouter);
userAuthRouter.use("/", userSessionRouter);
userAuthRouter.use("/registration", registrationRouter);
userAuthRouter.use("/platform", platformRegistrationRouter);
userAuthRouter.use("/tenants", userInvoiceRouter);
