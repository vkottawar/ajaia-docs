import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import {
  createDocument,
  deleteDocument,
  getDocument,
  listDocuments,
  listShares,
  removeShare,
  shareDocument,
  updateDocument,
} from "@/lib/documents";
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

describe("access control", () => {
  it("gives the owner full access and hides the document from everyone else", async () => {
    expect((await getDocument(db, ALICE, docId)).access).toBe("owner");
    // 404, not 403: a stranger must not learn that the document exists.
    await expect(getDocument(db, BOB, docId)).rejects.toMatchObject({ status: 404 });
    await expect(
      updateDocument(db, BOB, docId, { title: "Hacked", baseVersion: 1 }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("lets a viewer read but not edit", async () => {
    await shareDocument(db, ALICE, docId, { email: "bob@example.com", role: "viewer" });

    expect((await getDocument(db, BOB, docId)).access).toBe("viewer");
    await expect(
      updateDocument(db, BOB, docId, { content: para("nope"), baseVersion: 1 }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("lets an editor edit but not share or delete", async () => {
    await shareDocument(db, ALICE, docId, { email: "bob@example.com", role: "editor" });

    await updateDocument(db, BOB, docId, { content: para("from Bob"), baseVersion: 1 });
    expect((await getDocument(db, ALICE, docId)).content).toEqual(para("from Bob"));

    await expect(
      shareDocument(db, BOB, docId, { email: "carol@example.com", role: "editor" }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(listShares(db, BOB, docId)).rejects.toMatchObject({ status: 403 });
    await expect(deleteDocument(db, BOB, docId)).rejects.toMatchObject({ status: 403 });
  });

  it("revokes access when a share is removed", async () => {
    await shareDocument(db, ALICE, docId, { email: "bob@example.com", role: "editor" });
    await removeShare(db, ALICE, docId, BOB);
    await expect(getDocument(db, BOB, docId)).rejects.toMatchObject({ status: 404 });
  });
});

describe("sharing", () => {
  it("separates owned and shared documents in the listing", async () => {
    await shareDocument(db, ALICE, docId, { email: "bob@example.com", role: "viewer" });
    const bobsOwn = await createDocument(db, BOB, { title: "Bob's notes" });

    const bob = await listDocuments(db, BOB);
    expect(bob.owned.map((d) => d.id)).toEqual([bobsOwn.id]);
    expect(bob.shared).toMatchObject([
      { id: docId, access: "viewer", ownerName: "Alice Chen" },
    ]);

    const carol = await listDocuments(db, CAROL);
    expect(carol).toEqual({ owned: [], shared: [] });
  });

  it("changes the role when sharing with the same user again", async () => {
    await shareDocument(db, ALICE, docId, { email: "bob@example.com", role: "viewer" });
    await shareDocument(db, ALICE, docId, { email: "bob@example.com", role: "editor" });
    expect(await listShares(db, ALICE, docId)).toMatchObject([
      { userId: BOB, role: "editor" },
    ]);
  });

  it("rejects unknown users and sharing with the owner", async () => {
    await expect(
      shareDocument(db, ALICE, docId, { email: "nobody@example.com", role: "viewer" }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      shareDocument(db, ALICE, docId, { email: "alice@example.com", role: "viewer" }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("removes shares when the document is deleted", async () => {
    await shareDocument(db, ALICE, docId, { email: "bob@example.com", role: "viewer" });
    await deleteDocument(db, ALICE, docId);
    expect((await listDocuments(db, BOB)).shared).toEqual([]);
  });
});

describe("saving", () => {
  it("persists title and content and bumps the version", async () => {
    const saved = await updateDocument(db, ALICE, docId, {
      title: "Roadmap v2",
      content: para("hello"),
      baseVersion: 1,
    });
    expect(saved.version).toBe(2);
    expect(await getDocument(db, ALICE, docId)).toMatchObject({
      title: "Roadmap v2",
      content: para("hello"),
      version: 2,
    });
  });

  it("rejects a save based on a stale version instead of overwriting", async () => {
    await shareDocument(db, ALICE, docId, { email: "bob@example.com", role: "editor" });
    await updateDocument(db, ALICE, docId, { content: para("Alice"), baseVersion: 1 });

    await expect(
      updateDocument(db, BOB, docId, { content: para("Bob"), baseVersion: 1 }),
    ).rejects.toMatchObject({ status: 409 });
    expect((await getDocument(db, ALICE, docId)).content).toEqual(para("Alice"));
  });
});
