import { getDb } from "@/db/client";
import { route } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { getVersion } from "@/lib/versions";

type Ctx = { params: Promise<{ id: string; versionId: string }> };

export const GET = route<Ctx>(async (_request, { params }) => {
  const user = await requireUser();
  const { id, versionId } = await params;
  return Response.json(await getVersion(await getDb(), user.id, id, versionId));
});
