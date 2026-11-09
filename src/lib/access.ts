import type { ShareRole } from "@/db/schema";

/** What a user is to a document. `null` means no access at all. */
export type Access = "owner" | ShareRole;

/**
 * The single place that decides a user's access level. Every read and write
 * in `documents.ts` goes through this.
 */
export function resolveAccess(
  userId: string,
  doc: { ownerId: string },
  share: { role: ShareRole } | undefined,
): Access | null {
  if (doc.ownerId === userId) return "owner";
  return share?.role ?? null;
}

export const canEdit = (access: Access) =>
  access === "owner" || access === "editor";

/** Sharing, unsharing and deleting are owner-only. */
export const canManage = (access: Access) => access === "owner";
