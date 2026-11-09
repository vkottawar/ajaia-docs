import { getDb } from "@/db/client";
import { addComment, listComments } from "@/lib/comments";
import { parseJson, route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { commentSchema } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(async (_request, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  return Response.json({ comments: await listComments(await getDb(), user.id, id) });
});

export const POST = route<Ctx>(async (request, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const input = await parseJson(request, commentSchema);
  const db = await getDb();
  await addComment(db, user.id, id, input);
  return Response.json({ comments: await listComments(db, user.id, id) }, { status: 201 });
});
