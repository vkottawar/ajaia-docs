"use client";

import { useEffect, useRef, useState } from "react";
import type { ShareRole } from "@/db/schema";
import { api, errorMessage } from "@/lib/api";
import type { ShareEntry } from "@/lib/documents";

const ROLE_OPTIONS: { value: ShareRole; label: string }[] = [
  { value: "viewer", label: "Can view" },
  { value: "editor", label: "Can edit" },
];

function RoleSelect({
  value,
  onChange,
  label,
  disabled,
}: {
  value: ShareRole;
  onChange: (role: ShareRole) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <select
      value={value}
      aria-label={label}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value as ShareRole)}
      className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
    >
      {ROLE_OPTIONS.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

export function ShareDialog({
  documentId,
  suggestions,
  onClose,
}: {
  documentId: string;
  suggestions: { name: string; email: string }[];
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [shares, setShares] = useState<ShareEntry[] | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<ShareRole>("viewer");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const base = `/api/documents/${documentId}/shares`;

  useEffect(() => {
    dialog.current?.showModal();
    api<{ shares: ShareEntry[] }>(base)
      .then((result) => setShares(result.shares))
      .catch((e) => setError(errorMessage(e)));
  }, [base]);

  /** Every share endpoint returns the updated list, so one helper covers them all. */
  async function mutate(request: () => Promise<{ shares: ShareEntry[] }>) {
    setBusy(true);
    setError(null);
    try {
      setShares((await request()).shares);
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    } finally {
      setBusy(false);
    }
  }

  const grant = (targetEmail: string, targetRole: ShareRole) =>
    mutate(() =>
      api(base, { method: "POST", body: JSON.stringify({ email: targetEmail, role: targetRole }) }),
    );

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (await grant(email, role)) setEmail("");
  }

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      aria-labelledby="share-title"
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-xl p-0 shadow-xl backdrop:bg-slate-900/40"
    >
      <div className="p-6">
        <h2 id="share-title" className="text-lg font-semibold">
          Share document
        </h2>

        <form onSubmit={onSubmit} className="mt-4 flex flex-wrap gap-2">
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            list="share-suggestions"
            placeholder="Email address"
            aria-label="Email address to share with"
            className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          />
          <datalist id="share-suggestions">
            {suggestions.map((user) => (
              <option key={user.email} value={user.email}>
                {user.name}
              </option>
            ))}
          </datalist>
          <RoleSelect value={role} onChange={setRole} label="Access level" />
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
          >
            Share
          </button>
        </form>
        <p className="mt-2 text-xs text-slate-500">
          Demo accounts: {suggestions.map((user) => user.email).join(", ")}
        </p>

        {error && (
          <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <h3 className="mt-6 text-sm font-semibold text-slate-600">People with access</h3>
        {shares === null && !error && <p className="mt-2 text-sm text-slate-500">Loading…</p>}
        {shares?.length === 0 && (
          <p className="mt-2 text-sm text-slate-500">Only you can open this document.</p>
        )}
        <ul className="mt-2 divide-y divide-slate-100">
          {shares?.map((share) => (
            <li key={share.userId} className="flex items-center gap-2 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{share.name}</span>
                <span className="block truncate text-xs text-slate-500">{share.email}</span>
              </span>
              <RoleSelect
                value={share.role}
                disabled={busy}
                label={`Access level for ${share.name}`}
                onChange={(next) => grant(share.email, next)}
              />
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  mutate(() => api(`${base}/${share.userId}`, { method: "DELETE" }))
                }
                className="rounded-md px-2 py-1 text-sm text-slate-500 hover:bg-red-50 hover:text-red-700"
                aria-label={`Remove access for ${share.name}`}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={() => dialog.current?.close()}
            className="rounded-md border border-slate-300 px-4 py-1.5 text-sm hover:bg-slate-50"
          >
            Done
          </button>
        </div>
      </div>
    </dialog>
  );
}
