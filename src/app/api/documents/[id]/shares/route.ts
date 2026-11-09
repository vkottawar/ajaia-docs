import { getDb } from "@/db/client";
import { listShares, shareDocument } from "@/lib/documents";
import { parseJson, route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { shareSchema } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(async (_request, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  return Response.json({ shares: await listShares(await getDb(), user.id, id) });
});

export const POST = route<Ctx>(async (request, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const input = await parseJson(request, shareSchema);
  const db = await getDb();
  await shareDocument(db, user.id, id, input);
  return Response.json({ shares: await listShares(db, user.id, id) });
});
