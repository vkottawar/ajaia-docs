# Ajaia Docs

A lightweight collaborative document editor: create and format documents, import
files, and share them with other users as viewer or editor. It also shows who else
has a document open, and supports comments, version history and export.

- **Live app:** _add the deployed URL here_
- **Walkthrough video:** see `VIDEO_URL.txt`
- **Design notes:** [ARCHITECTURE.md](ARCHITECTURE.md) · [AI_WORKFLOW.md](AI_WORKFLOW.md) · [SUBMISSION.md](SUBMISSION.md)

## Run it locally

Requires Node 20.9 or newer. No database setup and no environment variables.

```bash
npm install
npm run dev
```

Open http://localhost:3000. On first request the app creates `local.db` (SQLite)
next to `package.json`, creates the tables and seeds the demo users.

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm test` | Run the automated tests (Vitest) |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | ESLint |
| `npm run build && npm start` | Production build and server |

To reset local data, stop the server and delete `local.db`.

## Demo accounts

There are no passwords. The login page lists three seeded users; click one to sign in.

| Name | Email |
|---|---|
| Alice Chen | alice@example.com |
| Bob Martinez | bob@example.com |
| Carol Singh | carol@example.com |

## Reviewing the sharing flow

1. Sign in as **Alice**, create a document and type something.
2. Click **Share**, enter `bob@example.com`, choose **Can view** or **Can edit**, and click Share.
3. Click **Switch user** (or open a private window) and sign in as **Bob**.
4. The document appears under **Shared with me** with a "View only" or "Can edit" badge.
   A viewer sees a read-only document with no toolbar; an editor can change it.
5. Sign in as **Carol** to confirm she can't see it, even with the direct URL.

To see the collaboration features, keep both users open side by side (one in a private
window, since all tabs in one browser share the same sign-in): each sees the other's avatar
and named cursor, Bob's view updates a second or two after Alice stops typing, and comments
left by either appear in the other's Comments panel.

To see conflict handling, open the same document as Alice and as Bob (editor) in
two windows and type in both: the second save is rejected and that window is
asked to reload, rather than one person silently overwriting the other.

## What's supported

- **Documents:** create, rename (click the title), edit, delete (owner only). Changes autosave
  about a second after you stop typing; the status next to the Share button shows the state.
- **Formatting:** bold, italic, underline, headings 1 to 3, bulleted and numbered lists.
  Keyboard shortcuts (⌘/Ctrl+B, I, U) and Markdown-style shortcuts (`# `, `- `, `1. `) also work.
- **File import:** `.txt`, `.md` and `.docx`, up to 2 MB, each becoming a new editable document.
  Other file types are rejected with a message. Images, tables and comments in imported
  files are dropped. A `.docx` keeps headings and lists only if it uses Word's built-in
  styles; text that is merely made large or prefixed with a typed bullet comes in as plain paragraphs.
- **Sharing:** the owner can grant view or edit access by email, change the role, and remove
  access. Only the owner can share or delete.
- **Who's here:** avatars next to the save status show other people with the document open,
  and each person's cursor and text selection appears in everyone else's editor as a
  coloured caret with their name. If someone else saves and you have nothing unsaved,
  their changes appear within about two seconds. This is polling, not
  character-by-character co-editing.
- **Comments:** anyone with access, including viewers, can comment. Select text before
  opening the panel to quote it. Comments can be resolved, reopened and deleted.
- **Version history** (owner and editors): one version per editing session. Preview any
  version and restore it; the state you replace stays in history.
- **Export:** download as Markdown, or "Print / Save as PDF" through the browser's print dialog.

## Deploying (Vercel + Turso, both free)

SQLite files don't persist on Vercel, so production uses a hosted libSQL database.

1. Create a database at [turso.tech](https://turso.tech) and copy its URL and an auth token.
2. Import the repository into Vercel.
3. Set these environment variables in the Vercel project:
   - `DATABASE_URL` – `libsql://<your-db>.turso.io`
   - `DATABASE_AUTH_TOKEN` – the Turso token
   - `SESSION_SECRET` – a long random string (`openssl rand -base64 32`)
4. Deploy. Tables and demo users are created on the first request.

## Known limits

See "What I cut" in [ARCHITECTURE.md](ARCHITECTURE.md). In short: no character-level
real-time co-editing, no real authentication, no suggestion mode, and comments are attached
to the document with a quote rather than anchored to a position in the text.
