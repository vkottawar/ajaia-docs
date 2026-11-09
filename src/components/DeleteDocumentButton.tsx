"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, errorMessage } from "@/lib/api";

export function DeleteDocumentButton({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onDelete() {
    if (!window.confirm(`Delete "${title}"? This can't be undone.`)) return;
    setBusy(true);
    try {
      await api(`/api/documents/${id}`, { method: "DELETE" });
      router.refresh();
    } catch (e) {
      window.alert(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={onDelete}
      disabled={busy}
      className="rounded-md px-2 py-1 text-sm text-slate-500 hover:bg-red-50 hover:text-red-700 disabled:opacity-60"
      aria-label={`Delete ${title}`}
    >
      {busy ? "Deleting…" : "Delete"}
    </button>
  );
}
