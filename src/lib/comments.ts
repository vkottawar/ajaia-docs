import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { comments, users } from "@/db/schema";
import { canEdit, canManage } from "./access";
import { forbidden, notFound } from "./errors";
import { loadWithAccess } from "./documents";

/**
 * Document comments. Anyone with access can read and add comments, including
 * viewers: giving feedback without edit rights is the main reason to share a
 * document view-only. Comments are attached to the document, optionally with
 * the text that was selected at the time, rather than anchored to a position.
 */

export type CommentEntry = {
  id: string;
  authorId: string;
  authorName: string;
  body: string;
  quote: string | null;
  createdAt: number;
  resolved: boolean;
};

export async function listComments(
  db: Db,
  userId: string,
  documentId: string,
): Promise<CommentEntry[]> {
  await loadWithAccess(db, userId, documentId);
  const rows = await db
    .select({
      id: comments.id,
      authorId: comments.authorId,
      authorName: users.name,
      body: comments.body,
      quote: comments.quote,
      createdAt: comments.createdAt,
      resolvedAt: comments.resolvedAt,
    })
    .from(comments)
    .innerJoin(users, eq(users.id, comments.authorId))
    .where(eq(comments.documentId, documentId))
    .orderBy(asc(comments.createdAt));
  return rows.map(({ resolvedAt, ...row }) => ({ ...row, resolved: resolvedAt !== null }));
}

export async function addComment(
  db: Db,
  userId: string,
  documentId: string,
  input: { body: string; quote?: string },
) {
  await loadWithAccess(db, userId, documentId);
  await db.insert(comments).values({
    id: randomUUID(),
    documentId,
    authorId: userId,
    body: input.body,
    quote: input.quote || null,
    createdAt: Date.now(),
  });
}

async function loadComment(db: Db, documentId: string, commentId: string) {
  const [comment] = await db
    .select()
    .from(comments)
    .where(and(eq(comments.id, commentId), eq(comments.documentId, documentId)))
    .limit(1);
  if (!comment) throw notFound();
  return comment;
}

/** Resolve or reopen: the comment's author, or anyone who can edit. */
export async function setCommentResolved(
  db: Db,
  userId: string,
  documentId: string,
  commentId: string,
  resolved: boolean,
) {
  const { access } = await loadWithAccess(db, userId, documentId);
  const comment = await loadComment(db, documentId, commentId);
  if (comment.authorId !== userId && !canEdit(access)) {
    throw forbidden("You can only resolve your own comments.");
  }
  await db
    .update(comments)
    .set({ resolvedAt: resolved ? Date.now() : null })
    .where(eq(comments.id, commentId));
}

/** Delete: the comment's author, or the document owner. */
export async function deleteComment(
  db: Db,
  userId: string,
  documentId: string,
  commentId: string,
) {
  const { access } = await loadWithAccess(db, userId, documentId);
  const comment = await loadComment(db, documentId, commentId);
  if (comment.authorId !== userId && !canManage(access)) {
    throw forbidden("You can only delete your own comments.");
  }
  await db.delete(comments).where(eq(comments.id, commentId));
}
