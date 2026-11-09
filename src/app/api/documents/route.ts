import { getDb } from "@/db/client";
import { createDocument, listDocuments } from "@/lib/documents";
import { parseJson, route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { createDocumentSchema } from "@/lib/validation";

export const GET = route(async () => {
  const user = await requireUser();
  return Response.json(await listDocuments(await getDb(), user.id));
});

export const POST = route(async (request) => {
  const user = await requireUser();
  const input = await parseJson(request, createDocumentSchema);
  const created = await createDocument(await getDb(), user.id, input);
  return Response.json(created, { status: 201 });
});
