import { z } from "zod";

export const MAX_TITLE_LENGTH = 200;
/** Upper bound on a serialized document, to keep rows and requests sane. */
export const MAX_CONTENT_BYTES = 1_000_000;

export const titleSchema = z
  .string()
  .trim()
  .min(1, "Title can't be empty.")
  .max(MAX_TITLE_LENGTH, `Title must be ${MAX_TITLE_LENGTH} characters or fewer.`);

/**
 * A Tiptap document. We check the envelope and the size here; the editor's
 * own schema decides which nodes and marks are meaningful when it loads the
 * content, and unknown ones are dropped rather than rendered.
 */
export const contentSchema = z
  .object({
    type: z.literal("doc"),
    content: z.array(z.record(z.string(), z.unknown())).optional(),
  })
  .refine((doc) => JSON.stringify(doc).length <= MAX_CONTENT_BYTES, {
    message: "Document is too large.",
  });

export type DocContent = z.infer<typeof contentSchema>;

export const createDocumentSchema = z.object({
  title: titleSchema.optional(),
});

export const updateDocumentSchema = z
  .object({
    title: titleSchema.optional(),
    content: contentSchema.optional(),
    /** The version the client last loaded or saved. */
    baseVersion: z.number().int().positive(),
  })
  .refine((v) => v.title !== undefined || v.content !== undefined, {
    message: "Nothing to update.",
  });

export const shareSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  role: z.enum(["viewer", "editor"]),
});

export const MAX_COMMENT_LENGTH = 2000;
export const MAX_QUOTE_LENGTH = 300;

export const commentSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Comment can't be empty.")
    .max(MAX_COMMENT_LENGTH, `Comment must be ${MAX_COMMENT_LENGTH} characters or fewer.`),
  quote: z.string().trim().max(MAX_QUOTE_LENGTH).optional(),
});

export const resolveCommentSchema = z.object({ resolved: z.boolean() });

export const EMPTY_DOC: DocContent = { type: "doc", content: [{ type: "paragraph" }] };
