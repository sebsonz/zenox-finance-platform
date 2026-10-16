import { createHash, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { integrationPrincipalRepository } from "../modules/integration-auth/repositories/integration-principal.repository.js";
import { tenantRepository } from "../modules/tenants/repositories/tenant.repository.js";
import type { FinanceRequestContext } from "../modules/integration-auth/types/authenticated-principal.js";

declare global {
  namespace Express {
    interface Request {
      financeContext?: FinanceRequestContext;
    }
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function unauthorized(res: Response): void {
  res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Valid service credentials are required." } });
}

export function requireIntegrationAuth(requiredScopes: readonly string[] = []) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const principalCode = req.header("x-finance-client-id");
    const authorization = req.header("authorization");
    const match = authorization?.match(/^Bearer ([A-Za-z0-9._~-]{32,512})$/);

    if (!principalCode || !/^[a-z0-9][a-z0-9._-]{2,79}$/.test(principalCode) || !match?.[1]) {
      unauthorized(res);
      return;
    }

    try {
      const principal = await integrationPrincipalRepository.findByCode(principalCode);
      if (!principal || principal.status !== "ACTIVE") {
        unauthorized(res);
        return;
      }

      const presentedHash = createHash("sha256").update(match[1], "utf8").digest("hex");
      const expectedHash = principal.credential_hash.toLowerCase();
      const presentedBuffer = Buffer.from(presentedHash, "hex");
      const expectedBuffer = /^[a-f0-9]{64}$/.test(expectedHash)
        ? Buffer.from(expectedHash, "hex")
        : Buffer.alloc(32);
      if (!timingSafeEqual(presentedBuffer, expectedBuffer) || !/^[a-f0-9]{64}$/.test(expectedHash)) {
        unauthorized(res);
        return;
      }

      if (!requiredScopes.every((scope) => principal.allowed_scopes.includes(scope))) {
        res.status(403).json({ error: { code: "INSUFFICIENT_SCOPE", message: "The service is not authorized for this operation." } });
        return;
      }

      const tenantId = req.header("x-finance-tenant-id");
      if (!tenantId || !UUID_PATTERN.test(tenantId) || !principal.allowed_tenant_ids.includes(tenantId)) {
        res.status(403).json({ error: { code: "TENANT_ACCESS_DENIED", message: "The service is not authorized for this tenant." } });
        return;
      }

      const tenant = await tenantRepository.findActiveById(tenantId);
      if (!tenant) {
        res.status(403).json({ error: { code: "TENANT_INACTIVE_OR_UNKNOWN", message: "The requested tenant is unavailable." } });
        return;
      }

      req.financeContext = {
        principal: {
          id: principal.id,
          principalCode: principal.principal_code,
          displayName: principal.display_name,
          scopes: principal.allowed_scopes,
          allowedTenantIds: principal.allowed_tenant_ids,
        },
        tenantId: tenant.id,
        correlationId: String(res.locals.correlationId ?? ""),
      };
      next();
    } catch (error) {
      next(error);
    }
  };
}
