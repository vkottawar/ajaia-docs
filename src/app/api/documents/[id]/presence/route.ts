import { getDb } from "@/db/client";
import { badRequest } from "@/lib/errors";
import { route } from "@/lib/http";
import { heartbeat, leave } from "@/lib/presence";
import { requireUser } from "@/lib/session";
import { heartbeatSchema } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Heartbeat: "I have this document open, and my cursor is here".
 * The body is optional; `{ cursor: null }` or no body means no cursor to show.
 * Returns who else has the document open.
 */
export const POST = route<Ctx>(async (request, { params }) => {
  const user = await requireUser();
  const { id } = await params;

  const text = await request.text();
  let body: unknown = {};
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      throw badRequest("Request body must be valid JSON.");
    }
  }
  const { cursor } = heartbeatSchema.parse(body);

  return Response.json(await heartbeat(await getDb(), user.id, id, { cursor }));
});

export const DELETE = route<Ctx>(async (_request, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  await leave(await getDb(), user.id, id);
  return new Response(null, { status: 204 });
});
