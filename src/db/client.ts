import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "./schema";

export type Db = LibSQLDatabase<typeof schema>;

/** Seeded demo accounts. Login is "pick a user"; there are no passwords. */
export const SEED_USERS = [
  { id: "u_alice", name: "Alice Chen", email: "alice@example.com" },
  { id: "u_bob", name: "Bob Martinez", email: "bob@example.com" },
  { id: "u_carol", name: "Carol Singh", email: "carol@example.com" },
] as const;

const SCHEMA_SQL = [
  `CREATE TABLE IF NOT EXISTS users (
     id TEXT PRIMARY KEY,
     name TEXT NOT NULL,
     email TEXT NOT NULL UNIQUE
   )`,
  `CREATE TABLE IF NOT EXISTS documents (
     id TEXT PRIMARY KEY,
     owner_id TEXT NOT NULL REFERENCES users(id),
     title TEXT NOT NULL,
     content TEXT NOT NULL,
     version INTEGER NOT NULL DEFAULT 1,
     created_at INTEGER NOT NULL,
     updated_at INTEGER NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS document_shares (
     document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
     user_id TEXT NOT NULL REFERENCES users(id),
     role TEXT NOT NULL CHECK (role IN ('viewer', 'editor')),
     created_at INTEGER NOT NULL,
     PRIMARY KEY (document_id, user_id)
   )`,
  `CREATE TABLE IF NOT EXISTS document_versions (
     id TEXT PRIMARY KEY,
     document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
     title TEXT NOT NULL,
     content TEXT NOT NULL,
     created_by TEXT NOT NULL REFERENCES users(id),
     created_at INTEGER NOT NULL,
     saved_at INTEGER NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS comments (
     id TEXT PRIMARY KEY,
     document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
     author_id TEXT NOT NULL REFERENCES users(id),
     body TEXT NOT NULL,
     quote TEXT,
     created_at INTEGER NOT NULL,
     resolved_at INTEGER
   )`,
  `CREATE TABLE IF NOT EXISTS presence (
     document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
     user_id TEXT NOT NULL REFERENCES users(id),
     last_seen INTEGER NOT NULL,
     cursor_anchor INTEGER,
     cursor_head INTEGER,
     cursor_version INTEGER,
     PRIMARY KEY (document_id, user_id)
   )`,
  `CREATE INDEX IF NOT EXISTS versions_doc_idx ON document_versions(document_id, saved_at)`,
  `CREATE INDEX IF NOT EXISTS comments_doc_idx ON comments(document_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS documents_owner_idx ON documents(owner_id)`,
  `CREATE INDEX IF NOT EXISTS shares_user_idx ON document_shares(user_id)`,
];

/** Columns added after the presence table first shipped. */
const ADDED_PRESENCE_COLUMNS = {
  cursor_anchor: "INTEGER",
  cursor_head: "INTEGER",
  cursor_version: "INTEGER",
};

/**
 * `CREATE TABLE IF NOT EXISTS` doesn't change a table that already exists, so
 * databases created before a column was added get it here.
 */
async function addMissingColumns(client: Client, table: string, columns: Record<string, string>) {
  const info = await client.execute(`PRAGMA table_info(${table})`);
  const existing = new Set(info.rows.map((row) => String(row.name)));
  for (const [name, type] of Object.entries(columns)) {
    if (!existing.has(name)) await client.execute(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`);
  }
}

/**
 * Creates tables if missing and seeds the demo users. Idempotent, so it runs
 * on first use instead of needing a separate migration step. With three tables
 * and a 4-6 hour timebox this beats maintaining a migrations folder.
 */
export async function initDb(client: Client): Promise<Db> {
  await client.execute("PRAGMA foreign_keys = ON");
  for (const sql of SCHEMA_SQL) await client.execute(sql);
  await addMissingColumns(client, "presence", ADDED_PRESENCE_COLUMNS);
  for (const u of SEED_USERS) {
    await client.execute({
      sql: "INSERT OR IGNORE INTO users (id, name, email) VALUES (?, ?, ?)",
      args: [u.id, u.name, u.email],
    });
  }
  return drizzle(client, { schema });
}

export function createDb(url: string, authToken?: string): Promise<Db> {
  return initDb(createClient({ url, authToken }));
}

// Cached on globalThis so dev hot-reloads reuse one connection.
const globalForDb = globalThis as unknown as { __db?: Promise<Db> };

export function getDb(): Promise<Db> {
  globalForDb.__db ??= createDb(
    process.env.DATABASE_URL ?? "file:local.db",
    process.env.DATABASE_AUTH_TOKEN,
  );
  return globalForDb.__db;
}
