import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import {
  addComment,
  deleteComment,
  listComments,
  setCommentResolved,
} from "@/lib/comments";
import {
  createDocument,
  deleteDocument,
  getDocument,
  recordVersion,
  shareDocument,
  updateDocument,
  VERSION_SESSION_MS,
} from "@/lib/documents";
import { exportFilename, toMarkdown } from "@/lib/markdown";
import { heartbeat, leave, PRESENCE_TTL_MS } from "@/lib/presence";
import { heartbeatSchema } from "@/lib/validation";
import { getVersion, listVersions, restoreVersion } from "@/lib/versions";
import { ALICE, BOB, CAROL, createTestDb } from "./helpers";

const para = (text: string) => ({
  type: "doc" as const,
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});

let db: Db;
let docId: string;

beforeEach(async () => {
  db = await createTestDb();
  ({ id: docId } = await createDocument(db, ALICE, { title: "Roadmap" }));
});

const shareWithBob = (role: "viewer" | "editor") =>
  shareDocument(db, ALICE, docId, { email: "bob@example.com", role });

describe("version history", () => {
  it("folds one person's rapid autosaves into a single version", async () => {
    await updateDocument(db, ALICE, docId, { content: para("a"), baseVersion: 1 });
    await updateDocument(db, ALICE, docId, { content: para("ab"), baseVersion: 2 });
    await updateDocument(db, ALICE, docId, { content: para("abc"), baseVersion: 3 });

    const versions = await listVersions(db, ALICE, docId);
    expect(versions).toHaveLength(1);
    expect((await getVersion(db, ALICE, docId, versions[0].id)).content).toEqual(para("abc"));
  });

  it("starts a new version for a different editor or after the session window", async () => {
    await shareWithBob("editor");
    await updateDocument(db, ALICE, docId, { content: para("Alice"), baseVersion: 1 });
    await updateDocument(db, BOB, docId, { content: para("Bob"), baseVersion: 2 });
    await recordVersion(
      db,
      { documentId: docId, title: "Roadmap", content: JSON.stringify(para("later")), userId: BOB },
      { now: Date.now() + VERSION_SESSION_MS + 1 },
    );

    const versions = await listVersions(db, ALICE, docId);
    expect(versions.map((v) => v.authorName)).toEqual([
      "Bob Martinez",
      "Bob Martinez",
      "Alice Chen",
    ]);
  });

  it("restores an old version and keeps the replaced state in history", async () => {
    await shareWithBob("editor");
    await updateDocument(db, ALICE, docId, { title: "v1", content: para("first"), baseVersion: 1 });
    await updateDocument(db, BOB, docId, { title: "v2", content: para("second"), baseVersion: 2 });
    const [, first] = await listVersions(db, ALICE, docId);

    const restored = await restoreVersion(db, ALICE, docId, first.id);

    expect(restored.version).toBe(4);
    expect(await getDocument(db, ALICE, docId)).toMatchObject({
      title: "v1",
      content: para("first"),
    });
    // Bob's "second" is still there, so the restore itself can be undone.
    expect((await listVersions(db, ALICE, docId)).map((v) => v.title)).toEqual(["v1", "v2", "v1"]);
  });

  it("is limited to people who can edit, and to versions of that document", async () => {
    await shareWithBob("viewer");
    await updateDocument(db, ALICE, docId, { content: para("x"), baseVersion: 1 });
    const [version] = await listVersions(db, ALICE, docId);

    await expect(listVersions(db, BOB, docId)).rejects.toMatchObject({ status: 403 });
    await expect(restoreVersion(db, BOB, docId, version.id)).rejects.toMatchObject({ status: 403 });
    await expect(listVersions(db, CAROL, docId)).rejects.toMatchObject({ status: 404 });

    // A version id from a document Bob can't see must not work through one he owns.
    const bobsDoc = await createDocument(db, BOB);
    await expect(getVersion(db, BOB, bobsDoc.id, version.id)).rejects.toMatchObject({ status: 404 });
  });
});

describe("comments", () => {
  it("lets a viewer comment, with the selected text as a quote", async () => {
    await shareWithBob("viewer");
    await addComment(db, BOB, docId, { body: "Is this date right?", quote: "March 3" });

    expect(await listComments(db, ALICE, docId)).toMatchObject([
      { authorName: "Bob Martinez", body: "Is this date right?", quote: "March 3", resolved: false },
    ]);
  });

  it("hides comments from people without access", async () => {
    await addComment(db, ALICE, docId, { body: "private note" });
    await expect(listComments(db, CAROL, docId)).rejects.toMatchObject({ status: 404 });
    await expect(addComment(db, CAROL, docId, { body: "hi" })).rejects.toMatchObject({ status: 404 });
  });

  it("applies resolve and delete permissions", async () => {
    await shareWithBob("viewer");
    await addComment(db, ALICE, docId, { body: "from Alice" });
    await addComment(db, BOB, docId, { body: "from Bob" });
    const [alices, bobs] = await listComments(db, ALICE, docId);

    // A viewer can't resolve or delete someone else's comment...
    await expect(setCommentResolved(db, BOB, docId, alices.id, true)).rejects.toMatchObject({ status: 403 });
    await expect(deleteComment(db, BOB, docId, alices.id)).rejects.toMatchObject({ status: 403 });
    // ...but can resolve their own, and the owner can delete any.
    await setCommentResolved(db, BOB, docId, bobs.id, true);
    expect((await listComments(db, ALICE, docId))[1].resolved).toBe(true);
    await deleteComment(db, ALICE, docId, bobs.id);
    expect(await listComments(db, ALICE, docId)).toHaveLength(1);
  });
});

describe("presence", () => {
  it("shows other people with the document open, until they go quiet or leave", async () => {
    await shareWithBob("viewer");
    const t0 = Date.now();

    expect((await heartbeat(db, ALICE, docId, { now: t0 })).viewers).toEqual([]);
    expect((await heartbeat(db, BOB, docId, { now: t0 })).viewers).toEqual([
      { userId: ALICE, name: "Alice Chen", cursor: null },
    ]);

    // Alice stops sending heartbeats.
    const later = t0 + PRESENCE_TTL_MS + 1;
    expect((await heartbeat(db, BOB, docId, { now: later })).viewers).toEqual([]);

    await leave(db, BOB, docId);
    expect((await heartbeat(db, ALICE, docId, { now: later })).viewers).toEqual([]);
  });

  it("shares each person's latest cursor with the others", async () => {
    await shareWithBob("editor");
    const cursor = { anchor: 3, head: 8, version: 1 };

    await heartbeat(db, ALICE, docId, { cursor });
    expect((await heartbeat(db, BOB, docId)).viewers).toEqual([
      { userId: ALICE, name: "Alice Chen", cursor },
    ]);
    // A user never sees their own cursor in the list.
    expect((await heartbeat(db, ALICE, docId, { cursor })).viewers).toEqual([
      expect.objectContaining({ userId: BOB, cursor: null }),
    ]);

    // Moving the cursor replaces it; clearing it hides it.
    await heartbeat(db, ALICE, docId, { cursor: { anchor: 5, head: 5, version: 2 } });
    expect((await heartbeat(db, BOB, docId)).viewers[0].cursor).toEqual({
      anchor: 5,
      head: 5,
      version: 2,
    });
    await heartbeat(db, ALICE, docId, { cursor: null });
    expect((await heartbeat(db, BOB, docId)).viewers[0].cursor).toBeNull();
  });

  it("reports the saved version and open comment count, and requires access", async () => {
    await updateDocument(db, ALICE, docId, { content: para("x"), baseVersion: 1 });
    await addComment(db, ALICE, docId, { body: "todo" });

    expect(await heartbeat(db, ALICE, docId)).toMatchObject({ version: 2, openComments: 1 });
    await expect(heartbeat(db, CAROL, docId)).rejects.toMatchObject({ status: 404 });
  });
});

describe("heartbeat validation", () => {
  it("accepts a missing or null cursor and rejects malformed positions", () => {
    expect(heartbeatSchema.parse({})).toEqual({});
    expect(heartbeatSchema.parse({ cursor: null })).toEqual({ cursor: null });
    expect(() => heartbeatSchema.parse({ cursor: { anchor: -1, head: 0, version: 1 } })).toThrow();
    expect(() => heartbeatSchema.parse({ cursor: { anchor: 1.5, head: 0, version: 1 } })).toThrow();
    expect(() => heartbeatSchema.parse({ cursor: { anchor: 1, head: 1 } })).toThrow();
  });
});

describe("upgrading an existing database", () => {
  it("adds the cursor columns to a presence table created before they existed", async () => {
    const { createClient } = await import("@libsql/client");
    const { initDb } = await import("@/db/client");
    const { mkdtempSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");

    const client = createClient({
      url: `file:${join(mkdtempSync(join(tmpdir(), "ajaia-upgrade-")), "old.db")}`,
    });
    await client.execute(`CREATE TABLE presence (
      document_id TEXT NOT NULL, user_id TEXT NOT NULL, last_seen INTEGER NOT NULL,
      PRIMARY KEY (document_id, user_id))`);

    const upgraded = await initDb(client);
    const { id } = await createDocument(upgraded, ALICE);
    await heartbeat(upgraded, ALICE, id, { cursor: { anchor: 1, head: 1, version: 1 } });
    expect((await heartbeat(upgraded, BOB, id).catch(() => null))).toBeNull(); // Bob has no access
    const columns = await client.execute("PRAGMA table_info(presence)");
    expect(columns.rows.map((row) => row.name)).toEqual(
      expect.arrayContaining(["cursor_anchor", "cursor_head", "cursor_version"]),
    );
  });
});

describe("deleting a document", () => {
  it("removes its versions, comments and presence", async () => {
    await updateDocument(db, ALICE, docId, { content: para("x"), baseVersion: 1 });
    await addComment(db, ALICE, docId, { body: "note" });
    await heartbeat(db, ALICE, docId);
    await deleteDocument(db, ALICE, docId);

    for (const table of ["document_versions", "comments", "presence"]) {
      const [row] = await db.all<{ n: number }>(sql.raw(`SELECT count(*) AS n FROM ${table}`));
      expect(row.n, table).toBe(0);
    }
  });
});

describe("Markdown export", () => {
  it("serializes headings, marks and nested lists", () => {
    const text = (value: string, ...marks: string[]) => ({
      type: "text",
      text: value,
      ...(marks.length && { marks: marks.map((type) => ({ type })) }),
    });
    const p = (...content: object[]) => ({ type: "paragraph", content });
    const item = (...content: object[]) => ({ type: "listItem", content });

    const markdown = toMarkdown("Plan", {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 2 }, content: [text("Goals")] },
        p(text("Ship ", "bold"), text("it"), text(" now", "italic"), text(" ok", "underline")),
        {
          type: "bulletList",
          content: [
            item(p(text("one")), {
              type: "orderedList",
              attrs: { start: 1 },
              content: [item(p(text("nested")))],
            }),
            item(p(text("two"))),
          ],
        },
        p(text("2 * 3 [x]")),
        { type: "paragraph" },
      ],
    });

    expect(markdown).toBe(
      [
        "# Plan",
        "",
        "## Goals",
        "",
        "**Ship** it *now* <u>ok</u>",
        "",
        "- one",
        "  1. nested",
        "- two",
        "",
        "2 \\* 3 \\[x\\]",
        "",
      ].join("\n"),
    );
  });

  it("builds a safe download filename", () => {
    expect(exportFilename('Q4 "Launch" Plan / v2', "md")).toBe("Q4-Launch-Plan-v2.md");
    expect(exportFilename("///", "md")).toBe("document.md");
  });
});
