"use client";

import { useCallback, useEffect, useState } from "react";
import { canEdit, canManage, type Access } from "@/lib/access";
import { api, errorMessage } from "@/lib/api";
import type { CommentEntry } from "@/lib/comments";
import { MAX_COMMENT_LENGTH } from "@/lib/validation";
import { formatTimestamp, SidePanel } from "./SidePanel";

const REFRESH_MS = 5000;

export function CommentsPanel({
  documentId,
  currentUserId,
  access,
  getSelectedText,
  onOpenCountChange,
  onClose,
}: {
  documentId: string;
  currentUserId: string;
  access: Access;
  getSelectedText: () => string;
  onOpenCountChange: (count: number) => void;
  onClose: () => void;
}) {
  const [comments, setComments] = useState<CommentEntry[] | null>(null);
  const [body, setBody] = useState("");
  // Whatever was selected in the document when the panel opened is offered as a quote.
  const [quote, setQuote] = useState(getSelectedText);
  const [showResolved, setShowResolved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const base = `/api/documents/${documentId}/comments`;

  const accept = useCallback(
    (next: CommentEntry[]) => {
      setComments(next);
      onOpenCountChange(next.filter((comment) => !comment.resolved).length);
    },
    [onOpenCountChange],
  );

  // Load now, then poll while the panel is open so other people's comments appear.
  useEffect(() => {
    let cancelled = false;
    const load = () =>
      api<{ comments: CommentEntry[] }>(base)
        .then((result) => !cancelled && accept(result.comments))
        .catch((e) => !cancelled && setError(errorMessage(e)));
    load();
    const interval = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [base, accept]);

  async function mutate(request: () => Promise<{ comments: CommentEntry[] }>) {
    setBusy(true);
    setError(null);
    try {
      accept((await request()).comments);
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const posted = await mutate(() =>
      api(base, { method: "POST", body: JSON.stringify({ body, quote: quote || undefined }) }),
    );
    if (posted) {
      setBody("");
      setQuote("");
    }
  }

  const visible = comments?.filter((comment) => showResolved || !comment.resolved) ?? [];
  const resolvedCount = comments?.filter((comment) => comment.resolved).length ?? 0;

  return (
    <SidePanel title="Comments" onClose={onClose}>
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {comments === null && !error && <p className="text-sm text-slate-500">Loading…</p>}
        {comments !== null && visible.length === 0 && (
          <p className="text-sm text-slate-500">
            No open comments. Select some text in the document before opening this panel to
            quote it in a comment.
          </p>
        )}
        <ul className="space-y-3">
          {visible.map((comment) => {
            const mine = comment.authorId === currentUserId;
            return (
              <li
                key={comment.id}
                className={`rounded-lg border border-slate-200 p-3 ${comment.resolved ? "opacity-60" : ""}`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-medium">{mine ? "You" : comment.authorName}</span>
                  <span className="text-xs text-slate-500">{formatTimestamp(comment.createdAt)}</span>
                </div>
                {comment.quote && (
                  <blockquote className="mt-2 border-l-2 border-amber-400 bg-amber-50 px-2 py-1 text-xs text-slate-600">
                    {comment.quote}
                  </blockquote>
                )}
                <p className="mt-2 text-sm whitespace-pre-wrap break-words">{comment.body}</p>
                <div className="mt-2 flex gap-3 text-xs">
                  {(mine || canEdit(access)) && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        mutate(() =>
                          api(`${base}/${comment.id}`, {
                            method: "PATCH",
                            body: JSON.stringify({ resolved: !comment.resolved }),
                          }),
                        )
                      }
                      className="text-blue-700 hover:underline"
                    >
                      {comment.resolved ? "Reopen" : "Resolve"}
                    </button>
                  )}
                  {(mine || canManage(access)) && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => mutate(() => api(`${base}/${comment.id}`, { method: "DELETE" }))}
                      className="text-slate-500 hover:text-red-700 hover:underline"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        {resolvedCount > 0 && (
          <button
            type="button"
            onClick={() => setShowResolved((value) => !value)}
            className="mt-3 text-xs text-blue-700 hover:underline"
          >
            {showResolved ? "Hide" : "Show"} resolved ({resolvedCount})
          </button>
        )}
      </div>

      <form onSubmit={onSubmit} className="border-t border-slate-200 p-4">
        {error && (
          <p role="alert" className="mb-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        {quote && (
          <div className="mb-2 flex items-start gap-2 border-l-2 border-amber-400 bg-amber-50 px-2 py-1 text-xs text-slate-600">
            <span className="flex-1">{quote}</span>
            <button type="button" onClick={() => setQuote("")} aria-label="Remove quote">
              ✕
            </button>
          </div>
        )}
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          maxLength={MAX_COMMENT_LENGTH}
          required
          rows={3}
          placeholder="Add a comment"
          aria-label="Add a comment"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <div className="mt-2 flex justify-end">
          <button
            type="submit"
            disabled={busy || !body.trim()}
            className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
          >
            Comment
          </button>
        </div>
      </form>
    </SidePanel>
  );
}
