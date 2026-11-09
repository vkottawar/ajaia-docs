import { getDb } from "@/db/client";
import { createDocument } from "@/lib/documents";
import { badRequest } from "@/lib/errors";
import { route } from "@/lib/http";
import { importFile } from "@/lib/import";
import { requireUser } from "@/lib/session";
import { contentSchema } from "@/lib/validation";

/** Multipart upload of one .txt, .md or .docx file, which becomes a new document. */
export const POST = route(async (request) => {
  const user = await requireUser();

  let file: FormDataEntryValue | null;
  try {
    file = (await request.formData()).get("file");
  } catch {
    throw badRequest("Expected a file upload.");
  }
  if (!(file instanceof File)) throw badRequest("Choose a file to import.");

  const { title, content } = await importFile(file);
  const created = await createDocument(await getDb(), user.id, {
    title,
    content: contentSchema.parse(content),
  });
  return Response.json(created, { status: 201 });
});
