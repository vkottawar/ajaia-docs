# Submission contents

Ajaia Docs: a lightweight collaborative document editor (Next.js, Tiptap, SQLite/libSQL).

## What's in the folder

| Item | Location |
|---|---|
| Source code (browsable) | `source/` |
| Source code (single download) | `ajaia-docs-source.zip` (same files as `source/`) |
| Setup and run instructions | `README.md` (also in `source/`) |
| Architecture note | `ARCHITECTURE.md` |
| AI workflow note | `AI_WORKFLOW.md` |
| This list | `SUBMISSION.md` |
| Live product URL | `LIVE_URL.txt` |
| Walkthrough video URL | `VIDEO_URL.txt` |
| Screenshots of the main flows | `screenshots/` (described below) |

In the source tree, the same documents are at the repository root. `node_modules`, build
output and the local database are not included; `npm install && npm run dev` recreates them.

## Test accounts

No passwords. The login page lists three seeded users; click one to sign in.

| Name | Email | Use it to |
|---|---|---|
| Alice Chen | alice@example.com | Own and share documents |
| Bob Martinez | bob@example.com | Receive a document with edit access |
| Carol Singh | carol@example.com | Receive a document with view-only access, or check that an unshared document is hidden |

To see two users at once, use a normal window and a private window (or two browsers):
all tabs in one browser share the same sign-in.

## Screenshots

| File | Shows |
|---|---|
| `01-login.png` | Seeded-user sign-in |
| `02-dashboard.png` | Owned vs shared documents, New document and Import file |
| `03-editor-with-collaborator-cursor.png` | Rich text, autosave status, and Bob's named cursor and selection in Alice's editor |
| `04-share-dialog.png` | Sharing by email with editor and viewer roles |
| `05-viewer-with-comments.png` | A viewer's read-only page with presence avatars and a quoted comment |
| `06-version-history.png` | Previewing an earlier version before restoring it |

## Status

**Working end to end:** create, rename, edit, autosave, reopen and delete documents; bold,
italic, underline, headings, bulleted and numbered lists; import of `.txt`, `.md` and
`.docx`; sharing with viewer and editor roles, role changes and revocation; owned vs shared
lists; conflict detection on concurrent saves; validation and error messages; 40 automated tests.

**Stretch included (all five, each in a small form):**

- Role-based sharing: viewer / editor.
- Collaboration indicators: who else has the document open, their named cursors and
  selections, and near-live updates (1.5 s polling while others are present).
- Comments: document-level, with optional quoted text, resolve and delete.
- Version history: per-session snapshots with preview and restore.
- Export: Markdown download and print-to-PDF.

**Partial by design:** presence and cursors use polling, so they lag by up to about two
seconds; comments are not anchored to a text range; PDF export uses the browser's print
dialog; there is no suggestion mode.

**Not built:** character-level real-time co-editing, real authentication, images and tables.

**Next 2–4 hours:** anchored comments, a side-by-side view for save conflicts, a Playwright
end-to-end test of the sharing flow, and a diff view in version history.
