import { generateJSON } from "@tiptap/html/server";
import { marked } from "marked";
import mammoth from "mammoth";
import { editorExtensions } from "./editor-extensions";
import { badRequest } from "./errors";
import { MAX_TITLE_LENGTH, type DocContent } from "./validation";

export const IMPORT_EXTENSIONS = [".txt", ".md", ".docx"] as const;
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

type ImportExtension = (typeof IMPORT_EXTENSIONS)[number];

function extensionOf(filename: string): ImportExtension | null {
  const lower = filename.toLowerCase();
  return IMPORT_EXTENSIONS.find((ext) => lower.endsWith(ext)) ?? null;
}

/** "Q3 Plan.final.md" -> "Q3 Plan.final" */
export function titleFromFilename(filename: string) {
  const base = filename.replace(/\.[^.]+$/, "").trim();
  return (base || "Imported document").slice(0, MAX_TITLE_LENGTH);
}

function textToDoc(text: string): DocContent {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  return {
    type: "doc",
    content: lines.map((line) =>
      line ? { type: "paragraph", content: [{ type: "text", text: line }] } : { type: "paragraph" },
    ),
  };
}

/** Parses HTML through the editor schema, which discards anything it doesn't know. */
function htmlToDoc(html: string): DocContent {
  return generateJSON(html, editorExtensions) as DocContent;
}

/**
 * Converts an uploaded file into an editor document. Validation is by
 * extension and size; the content itself is parsed, never trusted as HTML.
 */
export async function importFile(file: {
  name: string;
  size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}): Promise<{ title: string; content: DocContent }> {
  const extension = extensionOf(file.name);
  if (!extension) {
    throw badRequest(
      `Unsupported file type. Upload a ${IMPORT_EXTENSIONS.join(", ")} file.`,
    );
  }
  if (file.size === 0) throw badRequest("That file is empty.");
  if (file.size > MAX_IMPORT_BYTES) {
    throw badRequest("File is too large. The limit is 2 MB.");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  let content: DocContent;
  try {
    if (extension === ".txt") {
      content = textToDoc(buffer.toString("utf8"));
    } else if (extension === ".md") {
      content = htmlToDoc(await marked.parse(buffer.toString("utf8")));
    } else {
      const { value } = await mammoth.convertToHtml({ buffer });
      content = htmlToDoc(value);
    }
  } catch {
    throw badRequest("We couldn't read that file. It may be corrupted.");
  }

  if (!content.content?.length) content = { type: "doc", content: [{ type: "paragraph" }] };
  return { title: titleFromFilename(file.name), content };
}
