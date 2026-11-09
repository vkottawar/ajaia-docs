import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { importFile, MAX_IMPORT_BYTES, titleFromFilename } from "@/lib/import";

const file = (name: string, body: string) => {
  const bytes = new TextEncoder().encode(body);
  return {
    name,
    size: bytes.byteLength,
    arrayBuffer: async () => bytes.buffer as ArrayBuffer,
  };
};

describe("importFile", () => {
  it("turns Markdown into structured editor content", async () => {
    const { title, content } = await importFile(
      file("Launch Plan.md", "# Goals\n\n**Ship** it\n\n- one\n- two\n"),
    );
    expect(title).toBe("Launch Plan");
    expect(content.content?.map((n) => n.type)).toEqual([
      "heading",
      "paragraph",
      "bulletList",
    ]);
    expect(JSON.stringify(content)).toContain('"type":"bold"');
  });

  it("drops scripts and other content outside the editor schema", async () => {
    const { content } = await importFile(
      file("x.md", "hello\n\n<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>"),
    );
    const json = JSON.stringify(content);
    expect(json).not.toContain("script");
    expect(json).not.toContain("onerror");
  });

  it("keeps plain-text line breaks as paragraphs", async () => {
    const { content } = await importFile(file("notes.txt", "first\r\n\r\nsecond"));
    expect(content.content).toHaveLength(3);
  });

  it("converts a Word document, keeping headings, bold and lists", async () => {
    const bytes = readFileSync(new URL("./fixtures/sample.docx", import.meta.url));
    const { title, content } = await importFile({
      name: "sample.docx",
      size: bytes.byteLength,
      arrayBuffer: async () =>
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
    });
    const json = JSON.stringify(content);
    expect(title).toBe("sample");
    expect(json).toContain('"type":"heading"');
    expect(json).toContain('"type":"bold"');
    expect(json).toContain('"type":"bulletList"');
  });

  it("rejects unsupported, empty and oversized files", async () => {
    await expect(importFile(file("deck.pdf", "x"))).rejects.toMatchObject({ status: 400 });
    await expect(importFile(file("empty.txt", ""))).rejects.toMatchObject({ status: 400 });
    await expect(
      importFile({ ...file("big.txt", "x"), size: MAX_IMPORT_BYTES + 1 }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("derives a title from the filename", () => {
    expect(titleFromFilename("Q3 Plan.final.docx")).toBe("Q3 Plan.final");
    expect(titleFromFilename(".md")).toBe("Imported document");
  });
});
