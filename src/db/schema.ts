import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
});

export const documents = sqliteTable("documents", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id")
    .notNull()
    .references(() => users.id),
  title: text("title").notNull(),
  /** Tiptap/ProseMirror document, stored as a JSON string. */
  content: text("content").notNull(),
  /** Incremented on every save; used for optimistic concurrency. */
  version: integer("version").notNull().default(1),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const documentShares = sqliteTable(
  "document_shares",
  {
    documentId: text("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    role: text("role", { enum: ["viewer", "editor"] }).notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.documentId, t.userId] })],
);

/** Snapshots of a document, written on save (see recordVersion). */
export const documentVersions = sqliteTable("document_versions", {
  id: text("id").primaryKey(),
  documentId: text("document_id").notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  createdBy: text("created_by").notNull(),
  /** When this editing session's snapshot was started. */
  createdAt: integer("created_at").notNull(),
  /** When it was last overwritten by a later save in the same session. */
  savedAt: integer("saved_at").notNull(),
});

export const comments = sqliteTable("comments", {
  id: text("id").primaryKey(),
  documentId: text("document_id").notNull(),
  authorId: text("author_id").notNull(),
  body: text("body").notNull(),
  /** The text that was selected when the comment was written, if any. */
  quote: text("quote"),
  createdAt: integer("created_at").notNull(),
  resolvedAt: integer("resolved_at"),
});

/** One row per user per open document, refreshed by a heartbeat. */
export const presence = sqliteTable(
  "presence",
  {
    documentId: text("document_id").notNull(),
    userId: text("user_id").notNull(),
    lastSeen: integer("last_seen").notNull(),
  },
  (t) => [primaryKey({ columns: [t.documentId, t.userId] })],
);

export type User = typeof users.$inferSelect;
export type DocumentRow = typeof documents.$inferSelect;
export type ShareRole = "viewer" | "editor";
