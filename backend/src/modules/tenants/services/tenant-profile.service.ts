import { withTenantTransaction } from "../../../db/transaction.js";
import type { TenantAddress, TenantProfile } from "../domain/tenant-profile.types.js";
import type { FinanceUserTenantContext } from "../application/tenant-profile-operation-context.js";
import type { TenantProfileCompletion, TenantProfilePort } from "../application/tenant-profile.port.js";
import type { CreateTenantAddressInput, UpdateTenantProfileInput } from "../schemas/tenant-profile.schema.js";
import { tenantProfileRepository } from "../repositories/tenant-profile.repository.js";
import { recordTenantProfileAudit } from "../repositories/tenant-profile-audit.repository.js";

export class TenantProfileServiceError extends Error {
  constructor(
    readonly code: "PRIMARY_ADDRESS_CONFLICT",
    message: string,
  ) {
    super(message);
    this.name = "TenantProfileServiceError";
  }
}

function mapDatabaseError(error: unknown): never {
  if (typeof error === "object" && error !== null && "code" in error) {
    const pgCode = String((error as { code: unknown }).code);
    const constraint = "constraint" in error
      ? String((error as { constraint?: unknown }).constraint ?? "")
      : "";
    if (pgCode === "23505" && constraint.includes("one_primary_active_type")) {
      throw new TenantProfileServiceError(
        "PRIMARY_ADDRESS_CONFLICT",
        "An active primary address of this type already exists for this tenant.",
      );
    }
  }
  throw error;
}

export const tenantProfileService: TenantProfilePort = {
  async getProfile(context: FinanceUserTenantContext): Promise<TenantProfile | null> {
    return withTenantTransaction(context.tenantId, (client) =>
      tenantProfileRepository.getProfile(client, context.tenantId),
    );
  },

  async updateProfile(
    context: FinanceUserTenantContext,
    input: UpdateTenantProfileInput,
  ): Promise<TenantProfile> {
    return withTenantTransaction(context.tenantId, async (client) => {
      const profile = await tenantProfileRepository.upsertProfile(client, context.tenantId, input);
      await recordTenantProfileAudit(
        client,
        context,
        "tenant.profile.updated",
        "TENANT_PROFILE",
        context.tenantId,
        { changedFields: Object.keys(input) },
      );
      return profile;
    });
  },

  async listActiveAddresses(
    context: FinanceUserTenantContext,
  ): Promise<readonly TenantAddress[]> {
    return withTenantTransaction(context.tenantId, (client) =>
      tenantProfileRepository.listActiveAddresses(client, context.tenantId),
    );
  },

  async createAddress(
    context: FinanceUserTenantContext,
    input: CreateTenantAddressInput,
  ): Promise<TenantAddress> {
    try {
      return await withTenantTransaction(context.tenantId, async (client) => {
        const address = await tenantProfileRepository.createAddress(client, context.tenantId, input);
        await recordTenantProfileAudit(
          client,
          context,
          "tenant.address.created",
          "TENANT_ADDRESS",
          address.id,
          { addressType: address.addressType, countryCode: address.countryCode },
        );
        return address;
      });
    } catch (error) {
      return mapDatabaseError(error);
    }
  },

  async checkProfileCompletion(
    context: FinanceUserTenantContext,
  ): Promise<TenantProfileCompletion> {
    return withTenantTransaction(context.tenantId, async (client) => {
      const profile = await tenantProfileRepository.getProfile(client, context.tenantId);
      const addresses = await tenantProfileRepository.listActiveAddresses(client, context.tenantId);
      const missingRequirements: string[] = [];
      if (!profile) missingRequirements.push("TENANT_PROFILE");
      if (!addresses.some((address) => address.addressType === "REGISTERED")) {
        missingRequirements.push("REGISTERED_ADDRESS");
      }
      return {
        complete: missingRequirements.length === 0,
        missingRequirements,
      };
    });
  },
};
