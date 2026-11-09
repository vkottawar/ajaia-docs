import { and, eq, gt, isNull, ne, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { comments, presence, users } from "@/db/schema";
import type { Access } from "./access";
import { loadWithAccess } from "./documents";

/** A user counts as present if they sent a heartbeat this recently. */
export const PRESENCE_TTL_MS = 15_000;

export type Heartbeat = {
  /** Other people who currently have the document open. */
  viewers: { userId: string; name: string }[];
  /** Current saved version, so an open tab can notice it is behind. */
  version: number;
  openComments: number;
  access: Access;
};

/**
 * Records that the user has the document open and returns who else does.
 * This is polled every few seconds: it gives "who's here" and near-live
 * updates without a WebSocket server, which serverless hosting can't hold open.
 */
export async function heartbeat(
  db: Db,
  userId: string,
  documentId: string,
  now = Date.now(),
): Promise<Heartbeat> {
  const { doc, access } = await loadWithAccess(db, userId, documentId);

  await db
    .insert(presence)
    .values({ documentId, userId, lastSeen: now })
    .onConflictDoUpdate({
      target: [presence.documentId, presence.userId],
      set: { lastSeen: now },
    });

  const viewers = await db
    .select({ userId: users.id, name: users.name })
    .from(presence)
    .innerJoin(users, eq(users.id, presence.userId))
    .where(
      and(
        eq(presence.documentId, documentId),
        ne(presence.userId, userId),
        gt(presence.lastSeen, now - PRESENCE_TTL_MS),
      ),
    )
    .orderBy(users.name);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(comments)
    .where(and(eq(comments.documentId, documentId), isNull(comments.resolvedAt)));

  return { viewers, version: doc.version, openComments: count, access };
}

/** Called when a tab closes, so the user disappears without waiting for the TTL. */
export async function leave(db: Db, userId: string, documentId: string) {
  await db
    .delete(presence)
    .where(and(eq(presence.documentId, documentId), eq(presence.userId, userId)));
}
