import { getSchema } from "@tiptap/core";
import { EditorState } from "@tiptap/pm/state";
import { describe, expect, it } from "vitest";
import { editorExtensions } from "@/lib/editor-extensions";
import {
  cursorPositions,
  editCount,
  mapAcrossReplace,
  rebaseAfterSave,
  remoteCursorsPlugin,
  resetToSaved,
  setRemoteCursors,
  toSavedPosition,
} from "@/lib/remote-cursors";

/**
 * The cursor plugin's coordinate handling, without a browser: positions are
 * exchanged against the last saved version and translated through each tab's
 * unsaved edits.
 */

const schema = getSchema(editorExtensions);
// <p>Hello world</p>: text runs from position 1 ("H") to 12 (after "d").
const saved = schema.nodeFromJSON({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "Hello world" }] }],
});
const WORLD = { anchor: 7, head: 12 }; // "world"

const create = () => EditorState.create({ doc: saved, plugins: [remoteCursorsPlugin()] });
const apply = (state: EditorState, tr: ReturnType<EditorState["tr"]["insertText"]>) =>
  state.apply(tr);
const typeAt = (state: EditorState, pos: number, text: string) =>
  apply(state, state.tr.insertText(text, pos));
const bob = (state: EditorState, position = WORLD) =>
  apply(state, setRemoteCursors(state, [{ userId: "u_bob", name: "Bob", color: "#000", ...position }]));
const selectedText = (state: EditorState) => {
  const [{ anchor, head }] = cursorPositions(state);
  return state.doc.textBetween(Math.min(anchor, head), Math.max(anchor, head));
};

describe("remote cursors", () => {
  it("draws a cursor where the saved positions say when nothing is unsaved", () => {
    expect(selectedText(bob(create()))).toBe("world");
  });

  it("keeps a remote cursor on the same text while we type in front of it", () => {
    let state = bob(create());
    state = typeAt(state, 1, "Oh, ");
    expect(state.doc.textContent).toBe("Oh, Hello world");
    expect(selectedText(state)).toBe("world");

    // A heartbeat re-sends Bob's (saved-version) position: still correct.
    state = bob(state);
    expect(selectedText(state)).toBe("world");
  });

  it("sends our cursor in saved coordinates even with unsaved typing", () => {
    let state = typeAt(create(), 1, "Oh, ");
    // Our caret is before "world" in the local text ("Oh, Hello |world")...
    const local = 11;
    expect(state.doc.textBetween(local, local + 5)).toBe("world");
    // ...which is position 7 in the saved version everyone else has.
    expect(toSavedPosition(state, local)).toBe(7);

    // Text we have typed but not saved maps to where it was inserted.
    expect(toSavedPosition(state, 3)).toBe(1);
    state = typeAt(state, 1, "!"); // more unsaved typing
    expect(toSavedPosition(state, 12)).toBe(7);
  });

  it("folds saved edits into the base and moves remote cursors with them", () => {
    let state = bob(create());
    state = typeAt(state, 1, "Oh, ");
    const savedAt = editCount(state); // a save of this content starts...
    state = typeAt(state, 5, "big "); // ...and we keep typing while it runs
    expect(state.doc.textContent).toBe("Oh, big Hello world");

    state = apply(state, rebaseAfterSave(state, savedAt)); // the save completes
    // Still on "world", and only the "big " edit is left as unsaved.
    expect(selectedText(state)).toBe("world");
    expect(toSavedPosition(state, 9)).toBe(5);

    // Bob's next heartbeat is against the new saved version ("Oh, Hello world").
    state = bob(state, { anchor: 11, head: 16 });
    expect(selectedText(state)).toBe("world");
  });

  it("starts fresh when the document is replaced with the saved copy", () => {
    let state = typeAt(create(), 1, "Oh, ");
    state = apply(state, resetToSaved(state));
    expect(toSavedPosition(state, 5)).toBe(5);
  });

  it("snaps an out-of-range position to valid text instead of failing", () => {
    const state = bob(create(), { anchor: 500, head: 500 });
    const [{ head }] = cursorPositions(state);
    expect(head).toBe(12);
  });
});

describe("mapAcrossReplace", () => {
  const doc = (text: string) =>
    schema.nodeFromJSON({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text }] }],
    });

  it("keeps a caret on the same text when someone edits before it", () => {
    const before = doc("Hello world");
    const after = doc("Oh, Hello world");
    const map = mapAcrossReplace(before, after);
    // Caret before "world" (7) stays before "world" (11).
    expect(after.textBetween(map(7), map(7) + 5)).toBe("world");
    // Edits after the caret leave it alone.
    expect(mapAcrossReplace(before, doc("Hello world!"))(7)).toBe(7);
  });

  it("moves a position inside a replaced region to its end", () => {
    const map = mapAcrossReplace(doc("Hello world"), doc("Hello there"));
    expect(map(9)).toBe(12);
  });

  it("handles repeated text and unchanged documents", () => {
    // "aa" -> "aaa": the inserted "a" could be matched at either end.
    const map = mapAcrossReplace(doc("aa"), doc("aaa"));
    expect(map(1)).toBe(1);
    // After the paragraph (4) shifts by the one inserted character.
    expect(map(4)).toBe(5);
    expect(mapAcrossReplace(doc("same"), doc("same"))(3)).toBe(3);
  });
});
