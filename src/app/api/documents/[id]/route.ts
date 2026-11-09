import { getDb } from "@/db/client";
import { deleteDocument, getDocument, updateDocument } from "@/lib/documents";
import { parseJson, route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { updateDocumentSchema } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(async (_request, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  return Response.json(await getDocument(await getDb(), user.id, id));
});

export const PATCH = route<Ctx>(async (request, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const input = await parseJson(request, updateDocumentSchema);
  return Response.json(await updateDocument(await getDb(), user.id, id, input));
});

export const DELETE = route<Ctx>(async (_request, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  await deleteDocument(await getDb(), user.id, id);
  return new Response(null, { status: 204 });
});
