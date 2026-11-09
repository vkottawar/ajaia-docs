import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDb } from "@/db/client";

/** A fresh, seeded SQLite database in a temp file, one per test. */
export function createTestDb() {
  const dir = mkdtempSync(join(tmpdir(), "ajaia-docs-test-"));
  return createDb(`file:${join(dir, "test.db")}`);
}

export const ALICE = "u_alice";
export const BOB = "u_bob";
export const CAROL = "u_carol";
