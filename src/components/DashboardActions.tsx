"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, errorMessage } from "@/lib/api";

const ACCEPT = ".txt,.md,.docx";

export function DashboardActions() {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"create" | "import" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(kind: "create" | "import", request: () => Promise<{ id: string }>) {
    setBusy(kind);
    setError(null);
    try {
      const { id } = await request();
      router.push(`/documents/${id}`);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(null);
    }
  }

  function onFileChosen(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // allow choosing the same file again after an error
    if (!file) return;
    const body = new FormData();
    body.append("file", file);
    run("import", () => api("/api/documents/import", { method: "POST", body }));
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy !== null}
          onClick={() =>
            run("create", () => api("/api/documents", { method: "POST", body: "{}" }))
          }
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {busy === "create" ? "Creating…" : "New document"}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => fileInput.current?.click()}
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-60"
        >
          {busy === "import" ? "Importing…" : "Import file"}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept={ACCEPT}
          onChange={onFileChosen}
          className="hidden"
          aria-label="Import a file as a new document"
        />
        <span className="text-xs text-slate-500">
          Imports .txt, .md or .docx (up to 2 MB) as a new document.
        </span>
      </div>
      {error && (
        <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
