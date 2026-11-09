import { randomUUID } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import {
  comments,
  documents,
  documentShares,
  documentVersions,
  presence,
  users,
  type ShareRole,
} from "@/db/schema";
import { canEdit, canManage, resolveAccess, type Access } from "./access";
import { badRequest, conflict, forbidden, notFound } from "./errors";
import { EMPTY_DOC, type DocContent } from "./validation";

/**
 * Document service. All access rules live here (not in route handlers), so
 * they can be tested without HTTP and can't be skipped by a new endpoint.
 * Every function takes the acting user's id and checks their access first.
 */

export type DocumentSummary = {
  id: string;
  title: string;
  updatedAt: number;
  ownerName: string;
  access: Access;
};

export type DocumentDetail = {
  id: string;
  title: string;
  content: DocContent;
  version: number;
  updatedAt: number;
  access: Access;
  owner: { id: string; name: string; email: string };
};

export type ShareEntry = {
  userId: string;
  name: string;
  email: string;
  role: ShareRole;
};

/** Loads a document plus the acting user's access, or throws 404. */
export async function loadWithAccess(db: Db, userId: string, documentId: string) {
  const [doc] = await db
    .select()
    .from(documents)
    .where(eq(documents.id, documentId))
    .limit(1);
  if (!doc) throw notFound();

  const [share] = await db
    .select({ role: documentShares.role })
    .from(documentShares)
    .where(
      and(
        eq(documentShares.documentId, documentId),
        eq(documentShares.userId, userId),
      ),
    )
    .limit(1);

  const access = resolveAccess(userId, doc, share);
  if (!access) throw notFound();
  return { doc, access };
}

/** Saves by the same person within this window overwrite one snapshot. */
export const VERSION_SESSION_MS = 2 * 60 * 1000;
export const MAX_VERSIONS_PER_DOCUMENT = 50;

/**
 * Writes a history snapshot of the document as it is after a save. Autosave
 * fires every second or so, so consecutive saves by one person are folded into
 * a single "session" snapshot instead of producing hundreds of versions.
 */
export async function recordVersion(
  db: Db,
  snapshot: { documentId: string; title: string; content: string; userId: string },
  options: { forceNew?: boolean; now?: number } = {},
) {
  const now = options.now ?? Date.now();
  const [latest] = await db
    .select()
    .from(documentVersions)
    .where(eq(documentVersions.documentId, snapshot.documentId))
    .orderBy(desc(documentVersions.savedAt), sql`rowid DESC`)
    .limit(1);

  const sameSession =
    !options.forceNew &&
    latest?.createdBy === snapshot.userId &&
    now - latest.createdAt < VERSION_SESSION_MS;

  if (sameSession) {
    await db
      .update(documentVersions)
      .set({ title: snapshot.title, content: snapshot.content, savedAt: now })
      .where(eq(documentVersions.id, latest.id));
    return;
  }

  await db.insert(documentVersions).values({
    id: randomUUID(),
    documentId: snapshot.documentId,
    title: snapshot.title,
    content: snapshot.content,
    createdBy: snapshot.userId,
    createdAt: now,
    savedAt: now,
  });
  // Keep history bounded.
  await db.run(sql`
    DELETE FROM document_versions
    WHERE document_id = ${snapshot.documentId}
      AND id NOT IN (
        SELECT id FROM document_versions
        WHERE document_id = ${snapshot.documentId}
        ORDER BY saved_at DESC, rowid DESC
        LIMIT ${MAX_VERSIONS_PER_DOCUMENT}
      )`);
}

export async function listDocuments(db: Db, userId: string) {
  const owned = await db
    .select({
      id: documents.id,
      title: documents.title,
      updatedAt: documents.updatedAt,
      ownerName: users.name,
    })
    .from(documents)
    .innerJoin(users, eq(users.id, documents.ownerId))
    .where(eq(documents.ownerId, userId))
    .orderBy(desc(documents.updatedAt));

  const shared = await db
    .select({
      id: documents.id,
      title: documents.title,
      updatedAt: documents.updatedAt,
      ownerName: users.name,
      access: documentShares.role,
    })
    .from(documentShares)
    .innerJoin(documents, eq(documents.id, documentShares.documentId))
    .innerJoin(users, eq(users.id, documents.ownerId))
    .where(eq(documentShares.userId, userId))
    .orderBy(desc(documents.updatedAt));

  return {
    owned: owned.map((d): DocumentSummary => ({ ...d, access: "owner" })),
    shared: shared as DocumentSummary[],
  };
}

export async function createDocument(
  db: Db,
  userId: string,
  input: { title?: string; content?: DocContent } = {},
) {
  const now = Date.now();
  const id = randomUUID();
  const title = input.title ?? "Untitled document";
  const content = JSON.stringify(input.content ?? EMPTY_DOC);
  await db.insert(documents).values({
    id,
    ownerId: userId,
    title,
    content,
    version: 1,
    createdAt: now,
    updatedAt: now,
  });
  // Imported documents start with real content, so keep that as version one.
  if (input.content) await recordVersion(db, { documentId: id, title, content, userId });
  return { id };
}

export async function getDocument(
  db: Db,
  userId: string,
  documentId: string,
): Promise<DocumentDetail> {
  const { doc, access } = await loadWithAccess(db, userId, documentId);
  const [owner] = await db
    .select()
    .from(users)
    .where(eq(users.id, doc.ownerId))
    .limit(1);
  return {
    id: doc.id,
    title: doc.title,
    content: JSON.parse(doc.content) as DocContent,
    version: doc.version,
    updatedAt: doc.updatedAt,
    access,
    owner,
  };
}

export async function updateDocument(
  db: Db,
  userId: string,
  documentId: string,
  input: { title?: string; content?: DocContent; baseVersion: number },
) {
  const { access } = await loadWithAccess(db, userId, documentId);
  if (!canEdit(access)) throw forbidden("You have view-only access to this document.");

  const now = Date.now();
  // Compare-and-swap on `version`: the write only lands if nobody else has
  // saved since this client last loaded. Without real-time sync this is what
  // stops two editors from silently overwriting each other.
  const updated = await db
    .update(documents)
    .set({
      ...(input.title !== undefined && { title: input.title }),
      ...(input.content !== undefined && { content: JSON.stringify(input.content) }),
      version: sql`${documents.version} + 1`,
      updatedAt: now,
    })
    .where(
      and(eq(documents.id, documentId), eq(documents.version, input.baseVersion)),
    )
    .returning({
      version: documents.version,
      title: documents.title,
      content: documents.content,
    });

  if (updated.length === 0) {
    throw conflict(
      "This document was changed somewhere else since you opened it. Reload to get the latest version.",
    );
  }
  const saved = updated[0];
  await recordVersion(db, {
    documentId,
    title: saved.title,
    content: saved.content,
    userId,
  });
  return { version: saved.version, title: saved.title, updatedAt: now };
}

export async function deleteDocument(db: Db, userId: string, documentId: string) {
  const { access } = await loadWithAccess(db, userId, documentId);
  if (!canManage(access)) throw forbidden("Only the owner can delete this document.");
  // Child rows are removed explicitly rather than relying on ON DELETE CASCADE,
  // which SQLite only honours when the foreign_keys pragma is on per connection.
  await db.delete(documentShares).where(eq(documentShares.documentId, documentId));
  await db.delete(documentVersions).where(eq(documentVersions.documentId, documentId));
  await db.delete(comments).where(eq(comments.documentId, documentId));
  await db.delete(presence).where(eq(presence.documentId, documentId));
  await db.delete(documents).where(eq(documents.id, documentId));
}

export async function listShares(
  db: Db,
  userId: string,
  documentId: string,
): Promise<ShareEntry[]> {
  const { access } = await loadWithAccess(db, userId, documentId);
  if (!canManage(access)) throw forbidden("Only the owner can manage sharing.");
  return db
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      role: documentShares.role,
    })
    .from(documentShares)
    .innerJoin(users, eq(users.id, documentShares.userId))
    .where(eq(documentShares.documentId, documentId))
    .orderBy(users.name);
}

/** Grants access, or changes the role if the user already has access. */
export async function shareDocument(
  db: Db,
  userId: string,
  documentId: string,
  input: { email: string; role: ShareRole },
) {
  const { doc, access } = await loadWithAccess(db, userId, documentId);
  if (!canManage(access)) throw forbidden("Only the owner can share this document.");

  const [target] = await db
    .select()
    .from(users)
    .where(eq(users.email, input.email.toLowerCase()))
    .limit(1);
  if (!target) throw badRequest(`No user found with the email ${input.email}.`);
  if (target.id === doc.ownerId) throw badRequest("You already own this document.");

  await db
    .insert(documentShares)
    .values({
      documentId,
      userId: target.id,
      role: input.role,
      createdAt: Date.now(),
    })
    .onConflictDoUpdate({
      target: [documentShares.documentId, documentShares.userId],
      set: { role: input.role },
    });
}

export async function removeShare(
  db: Db,
  userId: string,
  documentId: string,
  targetUserId: string,
) {
  const { access } = await loadWithAccess(db, userId, documentId);
  if (!canManage(access)) throw forbidden("Only the owner can manage sharing.");
  await db
    .delete(documentShares)
    .where(
      and(
        eq(documentShares.documentId, documentId),
        eq(documentShares.userId, targetUserId),
      ),
    );
}
