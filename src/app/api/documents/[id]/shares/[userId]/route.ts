import { getDb } from "@/db/client";
import { listShares, removeShare } from "@/lib/documents";
import { route } from "@/lib/http";
import { requireUser } from "@/lib/session";

type Ctx = { params: Promise<{ id: string; userId: string }> };

export const DELETE = route<Ctx>(async (_request, { params }) => {
  const user = await requireUser();
  const { id, userId } = await params;
  const db = await getDb();
  await removeShare(db, user.id, id, userId);
  return Response.json({ shares: await listShares(db, user.id, id) });
});
