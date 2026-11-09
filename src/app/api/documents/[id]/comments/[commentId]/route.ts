import { getDb } from "@/db/client";
import { deleteComment, listComments, setCommentResolved } from "@/lib/comments";
import { parseJson, route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { resolveCommentSchema } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string; commentId: string }> };

export const PATCH = route<Ctx>(async (request, { params }) => {
  const user = await requireUser();
  const { id, commentId } = await params;
  const { resolved } = await parseJson(request, resolveCommentSchema);
  const db = await getDb();
  await setCommentResolved(db, user.id, id, commentId, resolved);
  return Response.json({ comments: await listComments(db, user.id, id) });
});

export const DELETE = route<Ctx>(async (_request, { params }) => {
  const user = await requireUser();
  const { id, commentId } = await params;
  const db = await getDb();
  await deleteComment(db, user.id, id, commentId);
  return Response.json({ comments: await listComments(db, user.id, id) });
});
