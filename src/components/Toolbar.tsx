"use client";

import { useEditorState, type Editor } from "@tiptap/react";

type Level = 1 | 2 | 3;

function ToolbarButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      // Keep the text selection when the button is clicked.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={`min-w-8 rounded px-2 py-1 text-sm ${
        active ? "bg-blue-100 text-blue-800" : "text-slate-700 hover:bg-slate-100"
      }`}
    >
      {children}
    </button>
  );
}

const Divider = () => <span className="mx-1 h-5 w-px bg-slate-200" aria-hidden />;

export function Toolbar({ editor }: { editor: Editor }) {
  // Subscribes to just the formatting state, so the toolbar re-renders when
  // the selection's marks change rather than on every transaction.
  const state = useEditorState({
    editor,
    selector: ({ editor }) => ({
      bold: editor.isActive("bold"),
      italic: editor.isActive("italic"),
      underline: editor.isActive("underline"),
      heading: ([1, 2, 3] as Level[]).find((level) => editor.isActive("heading", { level })) ?? 0,
      bulletList: editor.isActive("bulletList"),
      orderedList: editor.isActive("orderedList"),
    }),
  });

  const chain = () => editor.chain().focus();

  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      className="sticky top-0 z-10 flex flex-wrap items-center gap-0.5 border-b border-slate-200 bg-white px-4 py-1.5 sm:px-10"
    >
      <ToolbarButton label="Bold (⌘B)" active={state.bold} onClick={() => chain().toggleBold().run()}>
        <span className="font-bold">B</span>
      </ToolbarButton>
      <ToolbarButton label="Italic (⌘I)" active={state.italic} onClick={() => chain().toggleItalic().run()}>
        <span className="italic">I</span>
      </ToolbarButton>
      <ToolbarButton
        label="Underline (⌘U)"
        active={state.underline}
        onClick={() => chain().toggleUnderline().run()}
      >
        <span className="underline">U</span>
      </ToolbarButton>
      <Divider />
      <ToolbarButton
        label="Normal text"
        active={state.heading === 0}
        onClick={() => chain().setParagraph().run()}
      >
        Text
      </ToolbarButton>
      {([1, 2, 3] as Level[]).map((level) => (
        <ToolbarButton
          key={level}
          label={`Heading ${level}`}
          active={state.heading === level}
          onClick={() => chain().toggleHeading({ level }).run()}
        >
          H{level}
        </ToolbarButton>
      ))}
      <Divider />
      <ToolbarButton
        label="Bulleted list"
        active={state.bulletList}
        onClick={() => chain().toggleBulletList().run()}
      >
        • List
      </ToolbarButton>
      <ToolbarButton
        label="Numbered list"
        active={state.orderedList}
        onClick={() => chain().toggleOrderedList().run()}
      >
        1. List
      </ToolbarButton>
    </div>
  );
}
