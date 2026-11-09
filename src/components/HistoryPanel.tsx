"use client";

import { useEffect, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { api, errorMessage } from "@/lib/api";
import { editorExtensions } from "@/lib/editor-extensions";
import type { DocContent } from "@/lib/validation";
import type { VersionSummary } from "@/lib/versions";
import { formatTimestamp, SidePanel } from "./SidePanel";

type VersionDetail = { id: string; title: string; savedAt: number; content: DocContent };

/** Read-only render of a snapshot, using the same schema as the editor. */
function VersionPreview({ version }: { version: VersionDetail }) {
  const editor = useEditor({
    extensions: editorExtensions,
    content: version.content,
    editable: false,
    immediatelyRender: false,
  });
  return (
    <div className="version-preview rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
      <p className="mb-2 font-semibold">{version.title}</p>
      <EditorContent editor={editor} />
    </div>
  );
}

export function HistoryPanel({
  documentId,
  onRestored,
  onClose,
}: {
  documentId: string;
  onRestored: () => Promise<void>;
  onClose: () => void;
}) {
  const [versions, setVersions] = useState<VersionSummary[] | null>(null);
  const [selected, setSelected] = useState<VersionDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const base = `/api/documents/${documentId}/versions`;

  useEffect(() => {
    api<{ versions: VersionSummary[] }>(base)
      .then((result) => setVersions(result.versions))
      .catch((e) => setError(errorMessage(e)));
  }, [base]);

  async function select(id: string) {
    setError(null);
    try {
      setSelected(await api<VersionDetail>(`${base}/${id}`));
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function restore() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      await api(`${base}/${selected.id}/restore`, { method: "POST" });
      await onRestored();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  return (
    <SidePanel title="Version history" onClose={onClose}>
      <div className="flex-1 overflow-y-auto px-4 py-3">
        <p className="mb-3 text-xs text-slate-500">
          A version is saved for each editing session. Restoring one keeps the current state in
          history, so it can be undone.
        </p>
        {error && (
          <p role="alert" className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        {versions === null && !error && <p className="text-sm text-slate-500">Loading…</p>}
        {versions?.length === 0 && (
          <p className="text-sm text-slate-500">No versions yet. They appear once you start editing.</p>
        )}
        <ul className="space-y-1">
          {versions?.map((version, index) => (
            <li key={version.id}>
              <button
                type="button"
                onClick={() => select(version.id)}
                aria-current={selected?.id === version.id}
                className={`w-full rounded-md px-3 py-2 text-left text-sm hover:bg-slate-100 ${
                  selected?.id === version.id ? "bg-blue-50 ring-1 ring-blue-300" : ""
                }`}
              >
                <span className="block font-medium">
                  {formatTimestamp(version.savedAt)}
                  {index === 0 && <span className="ml-2 text-xs font-normal text-slate-500">Current</span>}
                </span>
                <span className="block text-xs text-slate-500">{version.authorName}</span>
              </button>
            </li>
          ))}
        </ul>
        {selected && (
          <div className="mt-4">
            {/* key: a fresh read-only editor per version, since content is set on mount */}
            <VersionPreview key={selected.id} version={selected} />
          </div>
        )}
      </div>
      {selected && selected.id !== versions?.[0]?.id && (
        <div className="border-t border-slate-200 p-4">
          <button
            type="button"
            onClick={restore}
            disabled={busy}
            className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {busy ? "Restoring…" : "Restore this version"}
          </button>
        </div>
      )}
    </SidePanel>
  );
}
