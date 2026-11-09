# Architecture note

## What I prioritised

1. **A correct sharing model.** Access is the part of this product that is hardest to
   retrofit and easiest to get subtly wrong, so it has one implementation and most of the tests.
2. **An editing loop that doesn't lose work.** Autosave with a visible status, retry on
   failure, and a save on page exit.
3. **Zero-setup review.** `npm install && npm run dev` works with no database or env vars.

Everything else was kept deliberately thin. The brief's optional stretch items were added
last, after the core was working and tested, and each was built in its smallest useful form
(see "Stretch features" below).

## Shape of the system

```
Browser (React, Tiptap editor)
   │  fetch JSON / multipart
   ▼
Next.js route handlers  src/app/api/**      thin: session → validate (Zod) → call service
   ▼
Document service        src/lib/documents.ts   all access rules and persistence logic
   ▼
Drizzle ORM → libSQL    src/db/**           SQLite file locally, Turso in production
```

Pages (`/login`, `/`, `/documents/[id]`) are server components that read the session and
load data directly through the same service, then hand off to client components.

## Data model

| Table | Columns |
|---|---|
| `users` | id, name, email |
| `documents` | id, owner_id, title, content (Tiptap JSON), version, created_at, updated_at |
| `document_shares` | document_id, user_id, role (`viewer` \| `editor`), created_at; PK (document_id, user_id) |
| `document_versions` | id, document_id, title, content, created_by, created_at, saved_at |
| `comments` | id, document_id, author_id, body, quote, created_at, resolved_at |
| `presence` | document_id, user_id, last_seen; PK (document_id, user_id) |

## Key decisions

**One access function.** `resolveAccess()` in `src/lib/access.ts` returns `owner`, `editor`,
`viewer` or `null`. Every service function loads the document through `loadWithAccess()`
first. Route handlers contain no permission logic, so a new endpoint can't forget a check.
A user with no access gets a 404, not a 403, so document ids can't be probed.

**Content stored as Tiptap JSON, not HTML.** The structure survives round trips exactly,
and the server never stores or serves user-authored HTML, which removes the main XSS
route. Imports go file → HTML → the editor's schema → JSON, so anything the schema
doesn't know (scripts, images, event handlers) is dropped. There is a test for this.

**Optimistic concurrency instead of real-time sync.** Each save sends the `version` it was
based on; the update is a compare-and-swap in SQL. A stale save gets a 409 and the client
stops autosaving and asks the user to reload. This is far less than collaborative editing,
but it is an honest guarantee: two editors can't silently overwrite each other.

**Mock auth with a signed cookie.** Login is "pick a seeded user". The cookie is
HMAC-signed, so the sharing rules can't be bypassed by editing it. `src/lib/session.ts`
is the only file a real auth provider would replace.

**libSQL for storage.** The same driver reads a local SQLite file in development and a
hosted Turso database in production, so reviewers need no setup and the deploy needs no
code changes. Tables are created idempotently on first use; for three tables this is
simpler than a migrations folder, and it is the first thing I'd replace as the schema grows.

**Next.js Cache Components turned off.** The scaffold enables it, but every page here
depends on the signed-in user, so there is nothing static to prerender.

## Stretch features

All five optional items are present. Each reuses `loadWithAccess()`, so none adds a new
permission path.

| Feature | How it works | What it deliberately isn't |
|---|---|---|
| Role-based sharing | `viewer` / `editor` on the share row. | No per-section or link-based permissions. |
| Collaboration indicators | Each open tab posts a heartbeat (`src/lib/presence.ts`) with its cursor: every 5 s when alone, every 1.5 s when others are present, and within 300 ms of a cursor move. The reply lists other people seen in the last 15 s with their cursors, the saved version and the open comment count. Other people's carets and selections are drawn as editor decorations (`src/lib/remote-cursors.ts`). A tab with no unsaved work pulls in a newer version automatically. | Not merged simultaneous typing. Polling was chosen because serverless hosting can't hold WebSockets open, and the version check already prevents overwrites. |
| Comments | Document-level thread with an optional quote of the selected text. Viewers can comment; author or editors resolve; author or owner delete. | Not anchored to a text range, so a quote doesn't follow later edits. No suggestion mode. |
| Version history | `recordVersion()` runs on every save. Saves by one person within two minutes overwrite one snapshot, so autosave doesn't create hundreds. Capped at 50 per document. Restore writes the old content as a new version, so it is itself undoable. | No diff view between versions. |
| Export | Markdown from a small hand-written serializer (`src/lib/markdown.ts`); PDF through a print stylesheet and the browser's print dialog. | No server-rendered PDF, which would need a headless browser. |

### Cursor positions

A cursor is just a number (an offset into the document), and two tabs only agree on those
numbers if they have the same text. Each tab can have up to a second of unsaved typing,
so positions are exchanged in the coordinates of the **last saved version**:

- The cursor plugin records the step map of every local edit since that version.
- Outgoing, our cursor is mapped backwards through those edits; incoming cursors are mapped
  forwards through them. So someone's caret stays on the same word while you type in front
  of it.
- When a save completes, the edits it covered are folded in; cursors from a different
  saved version are hidden until the next heartbeat.
- When someone else's save is pulled in, your own caret is kept on the same text by diffing
  the old and new documents (`mapAcrossReplace`).

The first version skipped this and showed cursors a few characters off during typing. It
was caught in browser testing and is now covered by `tests/remote-cursors.test.ts`.

## What I cut, on purpose

| Cut | Why |
|---|---|
| Character-level co-editing (CRDT/OT) | The largest feature in Google Docs; not achievable well in the timebox. Presence and cursors over polling, plus the version check, cover awareness and data loss. |
| Real authentication | Seeded users demonstrate sharing without account-creation friction for reviewers. |
| Suggestion mode, anchored comments, version diffs | Each needs editor-level work (decorations, position mapping) beyond the stretch scope. |
| Images, tables, attachments | Each needs storage and editor work; import drops them and the README says so. |
| Public link sharing, sharing by non-owners | Kept the model to "owner grants named users a role". |
| Database migrations tooling | See above. |

## With another 2–4 hours

1. Anchor comments to a text range with editor decorations, so they highlight in place and
   follow edits.
2. Merge-friendly conflict handling: show the other person's version beside yours instead
   of asking for a reload.
3. End-to-end browser test (Playwright) of the create → share → open-as-other-user flow.
4. A diff view in version history.

## Testing

`npm test` runs 40 Vitest tests against a real SQLite database (a temp file per test):

- `tests/documents.test.ts`: owner / editor / viewer / stranger permissions, revocation,
  owned-vs-shared listing, role changes, validation of share targets, and the stale-save conflict.
- `tests/stretch.test.ts`: version folding, restore and its permissions, comment
  permissions for each role, presence expiry and cursor sharing, upgrading an older
  database, cleanup on delete, and Markdown output.
- `tests/remote-cursors.test.ts`: cursor positions through unsaved typing, completed
  saves and documents replaced by someone else's save, run against the real editor schema.
- `tests/import.test.ts`: Markdown and Word conversion, stripping of unsafe content,
  and rejection of unsupported, empty and oversized files.

The UI was verified by hand in a browser; there are no automated UI tests.
