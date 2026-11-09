import { and, desc, eq, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { documents, documentVersions, users } from "@/db/schema";
import { canEdit } from "./access";
import { forbidden, notFound } from "./errors";
import { loadWithAccess, recordVersion } from "./documents";
import type { DocContent } from "./validation";

/**
 * Version history. Snapshots are written by `recordVersion` on every save;
 * this module reads them and restores one. History is limited to people who
 * can edit, since restoring is an edit.
 */

export type VersionSummary = {
  id: string;
  title: string;
  savedAt: number;
  authorName: string;
};

async function requireEditor(db: Db, userId: string, documentId: string) {
  const loaded = await loadWithAccess(db, userId, documentId);
  if (!canEdit(loaded.access)) {
    throw forbidden("Only people who can edit can see version history.");
  }
  return loaded;
}

export async function listVersions(
  db: Db,
  userId: string,
  documentId: string,
): Promise<VersionSummary[]> {
  await requireEditor(db, userId, documentId);
  return db
    .select({
      id: documentVersions.id,
      title: documentVersions.title,
      savedAt: documentVersions.savedAt,
      authorName: users.name,
    })
    .from(documentVersions)
    .innerJoin(users, eq(users.id, documentVersions.createdBy))
    .where(eq(documentVersions.documentId, documentId))
    // rowid breaks ties between versions saved in the same millisecond.
    .orderBy(desc(documentVersions.savedAt), sql`${documentVersions}.rowid DESC`);
}

async function loadVersion(db: Db, documentId: string, versionId: string) {
  const [version] = await db
    .select()
    .from(documentVersions)
    .where(
      // Scoped to the document so a version id from another document can't be used.
      and(eq(documentVersions.id, versionId), eq(documentVersions.documentId, documentId)),
    )
    .limit(1);
  if (!version) throw notFound();
  return version;
}

export async function getVersion(db: Db, userId: string, documentId: string, versionId: string) {
  await requireEditor(db, userId, documentId);
  const version = await loadVersion(db, documentId, versionId);
  return {
    id: version.id,
    title: version.title,
    savedAt: version.savedAt,
    content: JSON.parse(version.content) as DocContent,
  };
}

/**
 * Makes an old snapshot the current document. Nothing is lost: the state
 * being replaced is already in history, and the restore itself is recorded as
 * a new version, so a restore can always be undone by restoring again.
 */
export async function restoreVersion(
  db: Db,
  userId: string,
  documentId: string,
  versionId: string,
) {
  await requireEditor(db, userId, documentId);
  const version = await loadVersion(db, documentId, versionId);
  const [updated] = await db
    .update(documents)
    .set({
      title: version.title,
      content: version.content,
      version: sql`${documents.version} + 1`,
      updatedAt: Date.now(),
    })
    .where(eq(documents.id, documentId))
    .returning({ version: documents.version });
  await recordVersion(
    db,
    { documentId, title: version.title, content: version.content, userId },
    { forceNew: true },
  );
  return { version: updated.version };
}
