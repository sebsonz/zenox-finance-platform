import { createHash } from "node:crypto";

export interface LocalMigration {
  name: string;
  sql: string;
}

export interface AppliedMigration {
  name: string;
  checksum: string;
  applied_at?: string;
}

export interface MigrationInventoryIssue {
  code: "DUPLICATE_TIMESTAMP" | "APPLIED_MISSING_LOCALLY" | "CHECKSUM_MISMATCH" | "INVALID_NAME" | "DUPLICATE_NAME" | "INVALID_CHECKSUM";
  message: string;
}

export interface MigrationInventoryReport {
  localCount: number;
  appliedCount: number;
  pending: string[];
  issues: MigrationInventoryIssue[];
}

const MIGRATION_NAME = /^(\d{14})_[a-z0-9_-]+\.sql$/;

export function sha256(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

/**
 * Compare local migration sources with the database's migration ledger.
 * Pending local migrations are reported, not applied. Unknown or changed
 * already-applied migrations are drift and should fail the audit.
 */
export function compareMigrationInventory(
  localMigrations: LocalMigration[],
  appliedMigrations: AppliedMigration[],
): MigrationInventoryReport {
  const issues: MigrationInventoryIssue[] = [];
  const localByName = new Map<string, LocalMigration>();
  const timestampOwner = new Map<string, string>();

  for (const migration of localMigrations) {
    const match = MIGRATION_NAME.exec(migration.name);
    if (!match) {
      issues.push({
        code: "INVALID_NAME",
        message: `Migration filename does not match the required 14-digit timestamp convention: ${migration.name}`,
      });
      continue;
    }
    if (localByName.has(migration.name)) {
      issues.push({
        code: "DUPLICATE_NAME",
        message: `Duplicate local migration filename: ${migration.name}`,
      });
      continue;
    }
    const timestamp = match[1]!;
    const previous = timestampOwner.get(timestamp);
    if (previous) {
      issues.push({
        code: "DUPLICATE_TIMESTAMP",
        message: `Migrations ${previous} and ${migration.name} share timestamp ${timestamp}`,
      });
    } else {
      timestampOwner.set(timestamp, migration.name);
    }
    localByName.set(migration.name, migration);
  }

  const appliedByName = new Map<string, AppliedMigration>();
  for (const applied of appliedMigrations) {
    if (appliedByName.has(applied.name)) {
      issues.push({
        code: "DUPLICATE_NAME",
        message: `Migration ledger contains duplicate entry: ${applied.name}`,
      });
      continue;
    }
    if (!/^[a-f0-9]{64}$/.test(applied.checksum)) {
      issues.push({
        code: "INVALID_CHECKSUM",
        message: `Migration ledger checksum is not a SHA-256 hex digest: ${applied.name}`,
      });
    }
    appliedByName.set(applied.name, applied);
    const local = localByName.get(applied.name);
    if (!local) {
      issues.push({
        code: "APPLIED_MISSING_LOCALLY",
        message: `Database records applied migration ${applied.name}, but that file is absent from the repository`,
      });
      continue;
    }

    const localChecksum = sha256(local.sql);
    if (localChecksum !== applied.checksum) {
      issues.push({
        code: "CHECKSUM_MISMATCH",
        message: `Applied migration source has changed: ${applied.name} (database ${applied.checksum}, repository ${localChecksum})`,
      });
    }
  }

  const pending = [...localByName.keys()]
    .filter((name) => !appliedByName.has(name))
    .sort();

  return {
    localCount: localByName.size,
    appliedCount: appliedByName.size,
    pending,
    issues,
  };
}
