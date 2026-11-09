import { getDb } from "@/db/client";
import { route } from "@/lib/http";
import { heartbeat, leave } from "@/lib/presence";
import { requireUser } from "@/lib/session";

type Ctx = { params: Promise<{ id: string }> };

/** Heartbeat: "I have this document open". Returns who else does. */
export const POST = route<Ctx>(async (_request, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  return Response.json(await heartbeat(await getDb(), user.id, id));
});

export const DELETE = route<Ctx>(async (_request, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  await leave(await getDb(), user.id, id);
  return new Response(null, { status: 204 });
});
