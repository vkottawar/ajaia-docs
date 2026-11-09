# Submission contents

| Item | Location |
|---|---|
| Source code | this folder (`src/`, `tests/`) |
| Setup and run instructions | `README.md` |
| Architecture note | `ARCHITECTURE.md` |
| AI workflow note | `AI_WORKFLOW.md` |
| Live product URL | _to add_ (also at the top of `README.md`) |
| Walkthrough video URL | `VIDEO_URL.txt` |
| Test accounts | Alice, Bob, Carol – no passwords; listed in `README.md` |

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

**Partial by design:** presence and cursors use polling, so they lag by up to about two seconds; comments are not anchored to
a text range; PDF export uses the browser's print dialog; there is no suggestion mode.

**Not built:** character-level real-time co-editing, real authentication, images and tables.

**Next 2–4 hours:** anchored comments, a side-by-side view for save conflicts, a Playwright
end-to-end test of the sharing flow, and a diff view in version history.
