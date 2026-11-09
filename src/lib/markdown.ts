import type { DocContent } from "./validation";

/**
 * Serializes an editor document to Markdown. Hand-written for the small node
 * set this editor produces, which is less code than configuring a general
 * converter and keeps the output predictable. Underline has no Markdown
 * syntax, so it is written as <u> (which most renderers accept).
 */

type Mark = { type: string; attrs?: Record<string, unknown> };
type Node = {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: Mark[];
  content?: Node[];
};

const escapeText = (text: string) => text.replace(/([\\`*_\[\]<>])/g, "\\$1");

function inline(nodes: Node[] = []): string {
  return nodes
    .map((node) => {
      if (node.type === "hardBreak") return "  \n";
      if (node.type !== "text" || !node.text) return "";
      const marks = new Set(node.marks?.map((mark) => mark.type));
      if (marks.has("code")) return "`" + node.text + "`";

      // Emphasis markers must hug the text, so keep outer whitespace outside them.
      const [, lead, core, trail] = /^(\s*)([\s\S]*?)(\s*)$/.exec(node.text)!;
      if (!core) return node.text;
      let out = escapeText(core);
      if (marks.has("bold")) out = `**${out}**`;
      if (marks.has("italic")) out = `*${out}*`;
      if (marks.has("strike")) out = `~~${out}~~`;
      if (marks.has("underline")) out = `<u>${out}</u>`;
      const link = node.marks?.find((mark) => mark.type === "link");
      if (link?.attrs?.href) out = `[${out}](${String(link.attrs.href)})`;
      return lead + out + trail;
    })
    .join("");
}

const indent = (text: string, prefix: string) =>
  text
    .split("\n")
    .map((line) => (line ? prefix + line : line))
    .join("\n");

function list(node: Node, ordered: boolean): string {
  const start = ordered ? Number(node.attrs?.start ?? 1) : 0;
  return (node.content ?? [])
    .map((item, index) => {
      const marker = ordered ? `${start + index}. ` : "- ";
      const body = blocks(item.content ?? [], "\n");
      // Continuation lines and nested lists align under the item's text.
      const [first, ...rest] = body.split("\n");
      const tail = rest.length ? "\n" + indent(rest.join("\n"), " ".repeat(marker.length)) : "";
      return marker + first + tail;
    })
    .join("\n");
}

function block(node: Node): string {
  switch (node.type) {
    case "heading":
      return "#".repeat(Number(node.attrs?.level ?? 1)) + " " + inline(node.content);
    case "paragraph":
      return inline(node.content);
    case "bulletList":
      return list(node, false);
    case "orderedList":
      return list(node, true);
    case "blockquote":
      return indent(blocks(node.content ?? []), "> ").replace(/^$/gm, ">");
    case "codeBlock":
      return "```\n" + (node.content ?? []).map((n) => n.text ?? "").join("") + "\n```";
    case "horizontalRule":
      return "---";
    default:
      return node.content ? blocks(node.content) : "";
  }
}

function blocks(nodes: Node[], separator = "\n\n"): string {
  return nodes.map(block).join(separator);
}

export function toMarkdown(title: string, content: DocContent): string {
  const body = blocks((content.content ?? []) as Node[])
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return `# ${title}\n\n${body}\n`;
}

/** A filename that is safe in a Content-Disposition header on any OS. */
export function exportFilename(title: string, extension: string) {
  const base = title.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") || "document";
  return `${base.slice(0, 80)}.${extension}`;
}
