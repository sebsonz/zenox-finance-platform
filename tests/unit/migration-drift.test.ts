import { describe, expect, it } from "vitest";
import {
  compareMigrationInventory,
  sha256,
  type AppliedMigration,
  type LocalMigration,
} from "../../scripts/lib/migration-drift.js";

const migrationA: LocalMigration = {
  name: "20261016000100_finance_foundation.sql",
  sql: "CREATE TABLE finance_tenants (id uuid PRIMARY KEY);\n",
};
const migrationB: LocalMigration = {
  name: "20261016000200_customer_foundation.sql",
  sql: "CREATE TABLE finance_customers (id uuid PRIMARY KEY);\n",
};

describe("migration inventory drift comparator", () => {
  it("accepts matching applied migration checksums and reports new files as pending", () => {
    const applied: AppliedMigration[] = [
      {
        name: migrationA.name,
        checksum: sha256(migrationA.sql),
      },
    ];
    const report = compareMigrationInventory([migrationA, migrationB], applied);

    expect(report.issues).toEqual([]);
    expect(report.pending).toEqual([migrationB.name]);
    expect(report.localCount).toBe(2);
    expect(report.appliedCount).toBe(1);
  });

  it("detects any content change to an already-applied migration", () => {
    const applied: AppliedMigration[] = [
      {
        name: migrationA.name,
        checksum: sha256(migrationA.sql),
      },
    ];
    const changed: LocalMigration = {
      ...migrationA,
      sql: `${migrationA.sql}-- changed after application\n`,
    };

    const report = compareMigrationInventory([changed], applied);
    expect(report.issues.map((issue) => issue.code)).toContain("CHECKSUM_MISMATCH");
    expect(report.pending).toEqual([]);
  });

  it("detects applied migrations that disappeared from source control", () => {
    const applied: AppliedMigration[] = [
      {
        name: migrationA.name,
        checksum: sha256(migrationA.sql),
      },
    ];
    const report = compareMigrationInventory([], applied);
    expect(report.issues.map((issue) => issue.code)).toContain("APPLIED_MISSING_LOCALLY");
  });

  it("rejects duplicate migration timestamps", () => {
    const duplicateTimestamp: LocalMigration = {
      name: "20261016000100_another_migration.sql",
      sql: "SELECT 1;\n",
    };
    const report = compareMigrationInventory([migrationA, duplicateTimestamp], []);
    expect(report.issues.map((issue) => issue.code)).toContain("DUPLICATE_TIMESTAMP");
  });

  it("rejects migration names that do not follow the timestamp convention", () => {
    const invalidName: LocalMigration = {
      name: "initial_schema.sql",
      sql: "SELECT 1;\n",
    };
    const report = compareMigrationInventory([invalidName], []);
    expect(report.issues.map((issue) => issue.code)).toContain("INVALID_NAME");
  });
});
