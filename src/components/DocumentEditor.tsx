"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import { canEdit } from "@/lib/access";
import { api, ApiError } from "@/lib/api";
import type { DocumentDetail } from "@/lib/documents";
import { editorExtensions } from "@/lib/editor-extensions";
import type { Heartbeat } from "@/lib/presence";
import {
  editCount,
  mapAcrossReplace,
  rebaseAfterSave,
  RemoteCursors,
  resetToSaved,
  setRemoteCursors,
  toSavedPosition,
  type RemoteCursor,
} from "@/lib/remote-cursors";
import { colorFor } from "@/lib/user-colors";
import { MAX_QUOTE_LENGTH, MAX_TITLE_LENGTH, type DocContent } from "@/lib/validation";
import { CommentsPanel } from "./CommentsPanel";
import { HistoryPanel } from "./HistoryPanel";
import { ShareDialog } from "./ShareDialog";
import { Toolbar } from "./Toolbar";

const AUTOSAVE_DELAY_MS = 800;
/** Heartbeat interval when nobody else has the document open. */
const HEARTBEAT_ALONE_MS = 5000;
/** Faster when others are here, so their cursors and edits keep up. */
const HEARTBEAT_TOGETHER_MS = 1500;
/** After the cursor moves, send it this soon (but no more often). */
const CURSOR_SEND_DELAY_MS = 300;

type SaveStatus = "saved" | "dirty" | "saving" | "error" | "conflict";
type PendingChanges = {
  title?: string;
  content?: DocContent;
  /** Local edit count when `content` was captured (see remote-cursors.ts). */
  editCount?: number;
};
type Panel = "comments" | "history" | null;

const STATUS_TEXT: Record<SaveStatus, string> = {
  saved: "All changes saved",
  dirty: "Unsaved changes…",
  saving: "Saving…",
  error: "Couldn't save",
  conflict: "Out of date",
};

const secondaryButton =
  "rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50";

export function DocumentEditor({
  doc,
  currentUserId,
  shareSuggestions,
}: {
  doc: DocumentDetail;
  currentUserId: string;
  shareSuggestions: { name: string; email: string }[];
}) {
  const editable = canEdit(doc.access);
  const [title, setTitle] = useState(doc.title);
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [errorText, setErrorText] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [viewers, setViewers] = useState<Heartbeat["viewers"]>([]);
  const [openComments, setOpenComments] = useState(0);
  /** Set when the heartbeat finds this tab can't continue as it is. */
  const [accessNotice, setAccessNotice] = useState<string | null>(null);

  // Autosave state lives in refs so the save loop always sees current values
  // without re-creating callbacks on every keystroke.
  const version = useRef(doc.version);
  const pending = useRef<PendingChanges | null>(null);
  const saving = useRef(false);
  const stopped = useRef(false); // set after a conflict; no further saves
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Only share a cursor once the user has actually clicked into the text. */
  const hasFocused = useRef(false);
  /** Set by the heartbeat effect: send a heartbeat soon because the cursor moved. */
  const requestBeat = useRef<() => void>(() => {});
  /** The editor, for callbacks created before it exists. */
  const editorRef = useRef<Editor | null>(null);

  const url = `/api/documents/${doc.id}`;

  /**
   * Sends whatever is pending. Only one request is in flight at a time, so
   * each save is based on the version the previous one returned.
   */
  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    if (saving.current || stopped.current) return;
    saving.current = true;
    try {
      // Loop rather than fire once: edits made during a save are sent next.
      while (pending.current) {
        const changes = pending.current;
        pending.current = null;
        setStatus("saving");
        const { editCount: savedEdits, ...fields } = changes;
        try {
          const saved = await api<{ version: number }>(url, {
            method: "PATCH",
            body: JSON.stringify({ ...fields, baseVersion: version.current }),
          });
          version.current = saved.version;
          // The saved version now includes these edits; other people's cursors
          // are measured against it from here on.
          const editor = editorRef.current;
          if (savedEdits !== undefined && editor && !editor.isDestroyed) {
            editor.view.dispatch(rebaseAfterSave(editor.state, savedEdits));
          }
          setErrorText(null);
        } catch (error) {
          if (error instanceof ApiError && error.status === 409) {
            stopped.current = true;
            setStatus("conflict");
          } else {
            // Keep the failed changes (newer edits win) so a retry sends them.
            pending.current = Object.assign({}, changes, pending.current);
            setErrorText(error instanceof Error ? error.message : null);
            setStatus("error");
          }
          return;
        }
      }
      setStatus("saved");
    } finally {
      saving.current = false;
    }
  }, [url]);

  const queue = useCallback(
    (changes: PendingChanges) => {
      if (stopped.current) return;
      pending.current = { ...pending.current, ...changes };
      setStatus((current) => (current === "saving" ? current : "dirty"));
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, AUTOSAVE_DELAY_MS);
    },
    [flush],
  );

  const editor = useEditor({
    extensions: [...editorExtensions, RemoteCursors],
    content: doc.content,
    editable,
    immediatelyRender: false, // required for server-rendered pages
    editorProps: { attributes: { "aria-label": "Document content" } },
    onUpdate: ({ editor }) =>
      queue({ content: editor.getJSON() as DocContent, editCount: editCount(editor.state) }),
    onFocus: () => {
      hasFocused.current = true;
      requestBeat.current();
    },
    onSelectionUpdate: () => requestBeat.current(),
  });

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  /**
   * Replaces what's on screen with the server's copy. Used when someone else
   * saved while this tab had nothing unsaved, and after a version restore.
   */
  const applyRemote = useCallback(
    (fresh: Pick<DocumentDetail, "title" | "content" | "version">) => {
      if (!editor) return;
      version.current = fresh.version;
      const before = editor.state;
      editor.commands.setContent(fresh.content, { emitUpdate: false });
      editor.view.dispatch(resetToSaved(editor.state)); // nothing unsaved now
      // Keep our own caret on the same text, rather than at the same number,
      // when someone else's edit is pulled in.
      const map = mapAcrossReplace(before.doc, editor.state.doc);
      const max = editor.state.doc.content.size;
      editor.commands.setTextSelection({
        from: Math.min(map(before.selection.from), max),
        to: Math.min(map(before.selection.to), max),
      });
      setTitle(fresh.title);
      stopped.current = false;
      setStatus("saved");
    },
    [editor],
  );

  // Presence heartbeat. A poll every 1.5-5 seconds tells the server this tab
  // is open and where its cursor is, and brings back who else is here (with
  // their cursors), the open comment count and the saved version. If the saved
  // version is ahead and this tab has no unsaved work, the new content is
  // pulled in, so others see edits within a couple of seconds.
  useEffect(() => {
    if (!editor) return;
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let nextAt = Infinity;
    let inFlight = false;
    let resendAfter = false;
    let othersHere = false;

    const idle = () => !pending.current && !saving.current && !stopped.current;

    /**
     * Cursor positions only mean something against the same document. A
     * cursor taken against a different saved version (because one side
     * hasn't caught up yet) is hidden until the next heartbeat.
     */
    const showCursors = (hb: Heartbeat) => {
      if (editor.isDestroyed) return;
      const cursors: RemoteCursor[] = hb.viewers.flatMap((viewer) =>
        viewer.cursor && viewer.cursor.version === version.current
          ? [
              {
                userId: viewer.userId,
                name: viewer.name,
                color: colorFor(viewer.userId),
                anchor: viewer.cursor.anchor,
                head: viewer.cursor.head,
              },
            ]
          : [],
      );
      editor.view.dispatch(setRemoteCursors(editor.state, cursors));
    };

    const beat = async () => {
      if (document.hidden) return;
      // Sent in the saved version's coordinates, so it lines up for others
      // even while this tab has unsaved typing.
      const { state } = editor;
      const cursor = hasFocused.current
        ? {
            anchor: toSavedPosition(state, state.selection.anchor),
            head: toSavedPosition(state, state.selection.head),
            version: version.current,
          }
        : null;
      try {
        const hb = await api<Heartbeat>(`${url}/presence`, {
          method: "POST",
          body: JSON.stringify({ cursor }),
        });
        if (cancelled) return;
        othersHere = hb.viewers.length > 0;
        setViewers(hb.viewers);
        setOpenComments(hb.openComments);
        if (hb.access !== doc.access) {
          setAccessNotice("Your access to this document has changed. Reload to continue.");
          return;
        }
        if (hb.version > version.current && idle()) {
          const fresh = await api<DocumentDetail>(url);
          // Re-check: the user may have started typing while this was loading.
          if (!cancelled && idle() && fresh.version > version.current) applyRemote(fresh);
        }
        if (!cancelled) showCursors(hb);
      } catch (error) {
        if (!cancelled && error instanceof ApiError && error.status === 404) {
          stopped.current = true;
          setAccessNotice("You no longer have access to this document.");
        }
        // Anything else (offline, server restart) is retried on the next beat.
      }
    };

    const schedule = (ms: number) => {
      clearTimeout(timeoutId);
      nextAt = Date.now() + ms;
      timeoutId = setTimeout(run, ms);
    };

    // One heartbeat in flight at a time; the next is scheduled when it returns.
    const run = async () => {
      if (cancelled) return;
      inFlight = true;
      await beat();
      inFlight = false;
      if (cancelled) return;
      if (resendAfter) {
        resendAfter = false;
        schedule(CURSOR_SEND_DELAY_MS);
      } else {
        schedule(othersHere ? HEARTBEAT_TOGETHER_MS : HEARTBEAT_ALONE_MS);
      }
    };

    // Cursor moved: bring the next heartbeat forward, but only when someone is
    // here to see it, and never more often than CURSOR_SEND_DELAY_MS.
    requestBeat.current = () => {
      if (!othersHere) return;
      if (inFlight) resendAfter = true;
      else if (nextAt - Date.now() > CURSOR_SEND_DELAY_MS) schedule(CURSOR_SEND_DELAY_MS);
    };

    const onVisibilityChange = () => {
      if (!document.hidden && !inFlight) schedule(0);
    };
    const leave = () => {
      fetch(`${url}/presence`, { method: "DELETE", keepalive: true }).catch(() => {});
    };

    run();
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", leave);
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      requestBeat.current = () => {};
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", leave);
      leave();
    };
  }, [editor, url, doc.access, applyRemote]);

  // Don't lose the last few keystrokes: save on tab close and on leaving the page.
  useEffect(() => {
    const saveNow = () => {
      if (!pending.current || stopped.current) return;
      const body = JSON.stringify({ ...pending.current, baseVersion: version.current });
      pending.current = null;
      fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => {});
    };
    window.addEventListener("pagehide", saveNow);
    return () => {
      window.removeEventListener("pagehide", saveNow);
      if (!saving.current) saveNow();
    };
  }, [url]);

  function onTitleChange(value: string) {
    setTitle(value);
    const trimmed = value.trim();
    if (trimmed) queue({ title: trimmed }); // an empty title is never sent
  }

  function onTitleBlur() {
    if (!title.trim()) {
      setTitle("Untitled document");
      queue({ title: "Untitled document" });
    }
  }

  /** The text currently selected in the document, offered as a comment quote. */
  const getSelectedText = useCallback(() => {
    if (!editor) return "";
    const { from, to } = editor.state.selection;
    return editor.state.doc.textBetween(from, to, " ").trim().slice(0, MAX_QUOTE_LENGTH);
  }, [editor]);

  async function exportMarkdown() {
    await flush(); // the export is generated on the server, from the saved copy
    const link = document.createElement("a");
    link.href = `${url}/export?format=md`;
    link.download = ""; // the server's Content-Disposition names the file
    link.click();
  }

  async function onRestored() {
    pending.current = null; // the restore deliberately replaces local edits
    applyRemote(await api<DocumentDetail>(url));
    setPanel(null);
  }

  const togglePanel = (next: Exclude<Panel, null>) =>
    setPanel((current) => (current === next ? null : next));

  return (
    <main className="mx-auto max-w-4xl px-4 py-6 print:p-0">
      <div className="mb-4 flex flex-wrap items-center gap-2 print:hidden">
        <Link href="/" className="mr-auto text-sm text-blue-700 hover:underline">
          ← All documents
        </Link>

        {viewers.length > 0 && (
          <div
            className="flex items-center gap-1.5"
            role="status"
            aria-label={`Also here: ${viewers.map((v) => v.name).join(", ")}`}
          >
            <span className="flex -space-x-1.5">
              {viewers.map((viewer) => (
                <span
                  key={viewer.userId}
                  title={`${viewer.name} has this document open`}
                  style={{ backgroundColor: colorFor(viewer.userId) }}
                  className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold text-white ring-2 ring-white"
                >
                  {viewer.name[0]}
                </span>
              ))}
            </span>
            <span className="hidden text-xs text-slate-500 sm:inline">
              {viewers.length === 1 ? `${viewers[0].name.split(" ")[0]} is here` : `${viewers.length} others here`}
            </span>
          </div>
        )}

        <span
          role="status"
          className={`text-sm ${
            status === "error" || status === "conflict" ? "text-red-700" : "text-slate-500"
          }`}
        >
          {editable ? STATUS_TEXT[status] : "View only"}
        </span>
        {status === "error" && (
          <button type="button" onClick={flush} className={secondaryButton}>
            Retry
          </button>
        )}

        <button
          type="button"
          onClick={() => togglePanel("comments")}
          aria-expanded={panel === "comments"}
          className={secondaryButton}
        >
          Comments{openComments > 0 ? ` (${openComments})` : ""}
        </button>
        {editable && (
          <button
            type="button"
            onClick={() => togglePanel("history")}
            aria-expanded={panel === "history"}
            className={secondaryButton}
          >
            History
          </button>
        )}
        <details className="relative">
          <summary className={`${secondaryButton} cursor-pointer list-none`}>Export ▾</summary>
          <div className="absolute right-0 z-20 mt-1 w-52 rounded-md border border-slate-200 bg-white py-1 shadow-lg">
            <button
              type="button"
              onClick={exportMarkdown}
              className="block w-full px-3 py-1.5 text-left text-sm hover:bg-slate-50"
            >
              Download Markdown (.md)
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="block w-full px-3 py-1.5 text-left text-sm hover:bg-slate-50"
            >
              Print / Save as PDF
            </button>
          </div>
        </details>
        {doc.access === "owner" && (
          <button
            type="button"
            onClick={() => setShareOpen(true)}
            className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            Share
          </button>
        )}
      </div>

      <div className="print:hidden">
        {accessNotice && (
          <div role="alert" className="mb-4 flex flex-wrap items-center gap-3 rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <span className="flex-1">{accessNotice}</span>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-md bg-amber-600 px-3 py-1 font-medium text-white hover:bg-amber-700"
            >
              Reload
            </button>
          </div>
        )}
        {status === "conflict" && (
          <div role="alert" className="mb-4 flex flex-wrap items-center gap-3 rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <span className="flex-1">
              Someone else saved this document while you were editing, so your latest changes
              weren&apos;t saved. Copy anything you need, then reload to get the current version.
            </span>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-md bg-amber-600 px-3 py-1 font-medium text-white hover:bg-amber-700"
            >
              Reload
            </button>
          </div>
        )}
        {status === "error" && errorText && (
          <p role="alert" className="mb-4 rounded-md bg-red-50 px-4 py-2 text-sm text-red-700">
            {errorText} Your changes are kept in this tab; press Retry to try again.
          </p>
        )}
        {doc.access !== "owner" && (
          <p className="mb-4 rounded-md bg-slate-100 px-4 py-2 text-sm text-slate-700">
            Shared by {doc.owner.name}.{" "}
            {editable
              ? "You can edit this document."
              : "You have view-only access. You can still leave comments."}
          </p>
        )}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white shadow-sm print:border-0 print:shadow-none">
        <div className="border-b border-slate-200 px-6 pt-5 pb-3 sm:px-12 print:border-0 print:px-0">
          <input
            value={title}
            onChange={(event) => onTitleChange(event.target.value)}
            onBlur={onTitleBlur}
            readOnly={!editable}
            maxLength={MAX_TITLE_LENGTH}
            aria-label="Document title"
            placeholder="Untitled document"
            className="w-full bg-transparent text-2xl font-semibold outline-none placeholder:text-slate-400"
          />
        </div>
        {editable && editor && <Toolbar editor={editor} />}
        <div className="px-6 py-6 sm:px-12 sm:py-8 print:p-0">
          <EditorContent editor={editor} />
        </div>
      </div>

      {panel === "comments" && (
        <CommentsPanel
          documentId={doc.id}
          currentUserId={currentUserId}
          access={doc.access}
          getSelectedText={getSelectedText}
          onOpenCountChange={setOpenComments}
          onClose={() => setPanel(null)}
        />
      )}
      {panel === "history" && (
        <HistoryPanel documentId={doc.id} onRestored={onRestored} onClose={() => setPanel(null)} />
      )}
      {shareOpen && (
        <ShareDialog
          documentId={doc.id}
          suggestions={shareSuggestions}
          onClose={() => setShareOpen(false)}
        />
      )}
    </main>
  );
}
