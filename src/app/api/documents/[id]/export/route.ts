import { getDb } from "@/db/client";
import { getDocument } from "@/lib/documents";
import { badRequest } from "@/lib/errors";
import { route } from "@/lib/http";
import { exportFilename, toMarkdown } from "@/lib/markdown";
import { requireUser } from "@/lib/session";

type Ctx = { params: Promise<{ id: string }> };

/** Downloads the document as Markdown. PDF export is the browser's print dialog. */
export const GET = route<Ctx>(async (request, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const format = new URL(request.url).searchParams.get("format") ?? "md";
  if (format !== "md") throw badRequest("Unsupported export format. Use format=md.");

  const doc = await getDocument(await getDb(), user.id, id);
  return new Response(toMarkdown(doc.title, doc.content), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${exportFilename(doc.title, "md")}"`,
    },
  });
});
