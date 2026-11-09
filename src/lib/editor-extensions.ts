import StarterKit from "@tiptap/starter-kit";

/**
 * The one schema shared by the browser editor and the server-side importer.
 * Tiptap 3's StarterKit already covers bold, italic, underline, headings,
 * bullet and numbered lists, links, blockquote and code. Anything outside
 * this schema (images, tables, scripts) is dropped on import.
 */
export const editorExtensions = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
    link: { openOnClick: false },
  }),
];
