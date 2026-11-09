import { getDb } from "@/db/client";
import { route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { listVersions } from "@/lib/versions";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(async (_request, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  return Response.json({ versions: await listVersions(await getDb(), user.id, id) });
});
