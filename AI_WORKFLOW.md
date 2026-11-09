# AI workflow note


## Tools

Claude Code (Anthropic) in the desktop app, used for planning, implementation, tests and
browser verification.

## Where AI materially sped things up

- **Planning.** I pasted the brief and asked for a plan before any code. We settled the
  stack, the data model, the cut list and four open decisions (stack, host, roles, repo
  location) in one exchange.
- **Boilerplate.** Route handlers, Zod schemas, the Drizzle schema and the Tailwind UI.
- **Tests.** The permission matrix (owner / editor / viewer / stranger) was written
  alongside the service, so access bugs would show up immediately.
- **Verification.** The assistant drove a real browser through create → format → reload →
  share → switch user, and probed the API for error cases, instead of only reading code.

## What was changed or rejected

- **Scaffold default rejected.** `create-next-app` enabled Next.js Cache Components. Every
  page here is per-user, so it was turned off rather than wrapping everything in Suspense.
- **Recursive autosave rewritten.** The first autosave function called itself to send
  queued edits. The React lint rule flagged it; it became a loop with one request in flight.
- **Misleading test fixture replaced.** The first Word fixture (made with macOS `textutil`)
  imported with no headings or lists. Rather than weaken the test, the cause was found
  (the file had no Word styles), a properly styled fixture was generated, and the
  limitation was documented in the README.
- **Dependencies removed.** A separate underline extension (already in Tiptap 3's
  StarterKit) and a migrations tool that three tables didn't justify.
- **Scope pushed back on, then bounded.** The first plan cut every stretch item except
  roles. I later asked for all of them; the assistant pointed out the brief asks for one
  small enhancement, then built each in its smallest useful form (polling instead of
  WebSockets, document-level comments instead of anchored ones, print-to-PDF instead of a
  PDF renderer) and documented what each is not.
- **Flaky ordering caught.** Version history was first ordered by timestamp alone. Two saves
  in the same millisecond could swap, so a row-order tiebreak was added before it showed up
  as an intermittent test failure.

## How correctness was checked

- `npm test`: 28 tests against a real SQLite database.
- `npm run typecheck`, `npm run lint` and `npm run build` all pass.
- Manual browser run of the main flow as two users, including: formatting survives a
  reload; a viewer gets a read-only page and a 403 from the API; a user with no access gets
  a 404 for both the page and the API; unsupported uploads and stale saves return clear errors.
- Stretch features were checked with two users at once (one in the browser, one through
  the API): presence avatar, live update of an idle tab, a viewer's quoted comment, and
  preview and restore of an older version followed by further editing.
- Not verified: the production deployment, behaviour on mobile browsers, the printed PDF
  layout, and the save-conflict banner with two real browser windows.
