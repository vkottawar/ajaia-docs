import { Extension } from "@tiptap/react";
import {
  Plugin,
  PluginKey,
  Selection,
  type EditorState,
} from "@tiptap/pm/state";
import { Mapping, type StepMap } from "@tiptap/pm/transform";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as PMNode } from "@tiptap/pm/model";

/**
 * Shows other people's cursors and selections inside the editor.
 *
 * The tricky part is that each tab may have unsaved typing. Cursor positions
 * are therefore exchanged in the coordinates of the last *saved* version,
 * which every tab on that version agrees on:
 *
 * - This plugin records the step maps of every local edit made since the
 *   saved version ("unsaved maps").
 * - Outgoing: our own cursor is mapped backwards through them, to saved
 *   coordinates (`toSavedPosition`).
 * - Incoming: other people's cursors are stored in saved coordinates and
 *   mapped forwards through them when drawn, so they sit on the right
 *   character even while we type in front of them.
 * - When a save completes, the maps it covered are folded into the base
 *   (`rebaseAfterSave`).
 */

export type RemoteCursor = {
  userId: string;
  name: string;
  color: string;
  /** Positions in the saved version's coordinates. */
  anchor: number;
  head: number;
};

type State = {
  cursors: RemoteCursor[];
  /** Step maps of local edits not yet covered by a completed save. */
  maps: readonly StepMap[];
  /** How many maps have been folded into the base so far (an absolute counter). */
  folded: number;
};

type Meta =
  | { type: "cursors"; cursors: RemoteCursor[] }
  /** A save of the content as of map count `upTo` has completed. */
  | { type: "rebase"; upTo: number }
  /** The document was replaced with the saved copy; nothing is unsaved. */
  | { type: "reset" };

const key = new PluginKey<State>("remoteCursors");

function mapCursors(cursors: RemoteCursor[], mapping: Mapping) {
  return cursors.map((cursor) => ({
    ...cursor,
    anchor: mapping.map(cursor.anchor),
    head: mapping.map(cursor.head),
  }));
}

/** Nearest valid text position, so a stale position never lands between blocks. */
function textPosition(doc: PMNode, pos: number) {
  const clamped = Math.min(Math.max(pos, 0), doc.content.size);
  return Selection.near(doc.resolve(clamped)).head;
}

function caret(cursor: RemoteCursor) {
  const element = document.createElement("span");
  element.className = "remote-caret";
  element.style.setProperty("--cursor-color", cursor.color);
  element.setAttribute("aria-hidden", "true");
  const label = document.createElement("span");
  label.className = "remote-caret-label";
  label.textContent = cursor.name.split(" ")[0];
  element.append(label);
  return element;
}

/**
 * Where each remote cursor falls in the current document: saved-version
 * positions mapped through unsaved local edits and snapped to valid text.
 */
export function cursorPositions(state: EditorState) {
  const { cursors, maps } = key.getState(state)!;
  const unsaved = new Mapping(maps);
  return cursors.map((cursor) => ({
    cursor,
    anchor: textPosition(state.doc, unsaved.map(cursor.anchor)),
    head: textPosition(state.doc, unsaved.map(cursor.head)),
  }));
}

export function remoteCursorsPlugin() {
  return new Plugin<State>({
    key,
    state: {
      init: () => ({ cursors: [], maps: [], folded: 0 }),
      apply(tr, value) {
        let next = value;
        if (tr.docChanged)
          next = { ...next, maps: [...next.maps, ...tr.mapping.maps] };

        const meta = tr.getMeta(key) as Meta | undefined;
        if (meta?.type === "cursors") return { ...next, cursors: meta.cursors };
        if (meta?.type === "reset") {
          return {
            cursors: next.cursors,
            maps: [],
            folded: next.folded + next.maps.length,
          };
        }
        if (meta?.type === "rebase") {
          const count = Math.min(
            Math.max(meta.upTo - next.folded, 0),
            next.maps.length,
          );
          if (count === 0) return next;
          // Cursors were in the old saved version's coordinates; carry
          // them over to the new one so they don't jump until the next
          // heartbeat refreshes them.
          const covered = new Mapping(next.maps.slice(0, count));
          return {
            cursors: mapCursors(next.cursors, covered),
            maps: next.maps.slice(count),
            folded: next.folded + count,
          };
        }
        return next;
      },
    },
    props: {
      decorations(state) {
        const positions = cursorPositions(state);
        if (positions.length === 0) return null;
        const decorations = positions.flatMap(({ cursor, anchor, head }) => {
          const from = Math.min(anchor, head);
          const to = Math.max(anchor, head);
          const marks = [
            Decoration.widget(head, () => caret(cursor), {
              key: `${cursor.userId}:${cursor.color}:${cursor.name}`,
              side: -1,
              ignoreSelection: true,
            }),
          ];
          if (from < to) {
            marks.push(
              Decoration.inline(from, to, {
                class: "remote-selection",
                style: `background-color: ${cursor.color}33`,
              }),
            );
          }
          return marks;
        });
        return DecorationSet.create(state.doc, decorations);
      },
    },
  });
}

export const RemoteCursors = Extension.create({
  name: "remoteCursors",
  addProseMirrorPlugins: () => [remoteCursorsPlugin()],
});

/** An absolute count of local edits; pass it to `rebaseAfterSave` once that content is saved. */
export function editCount(state: EditorState) {
  const { maps, folded } = key.getState(state)!;
  return folded + maps.length;
}

/** Converts a position in the current document to the saved version's coordinates. */
export function toSavedPosition(state: EditorState, pos: number) {
  const { maps } = key.getState(state)!;
  if (maps.length === 0) return pos;
  return new Mapping(maps).invert().map(pos, -1);
}

export const setRemoteCursors = (state: EditorState, cursors: RemoteCursor[]) =>
  state.tr
    .setMeta(key, { type: "cursors", cursors } satisfies Meta)
    .setMeta("addToHistory", false);

export const rebaseAfterSave = (state: EditorState, upTo: number) =>
  state.tr
    .setMeta(key, { type: "rebase", upTo } satisfies Meta)
    .setMeta("addToHistory", false);

export const resetToSaved = (state: EditorState) =>
  state.tr
    .setMeta(key, { type: "reset" } satisfies Meta)
    .setMeta("addToHistory", false);

/**
 * Maps positions from `oldDoc` to `newDoc` when one replaces the other
 * wholesale (pulling in someone else's save). There are no steps to map
 * through, so the changed region is found by diffing: positions before it
 * stay, positions after it shift by the change in length, and positions
 * inside it move to its end. This keeps your caret on the same text when
 * another person edits elsewhere in the document.
 */
export function mapAcrossReplace(oldDoc: PMNode, newDoc: PMNode) {
  const start = oldDoc.content.findDiffStart(newDoc.content);
  if (start === null) return (pos: number) => pos;
  let { a: endA, b: endB } = oldDoc.content.findDiffEnd(newDoc.content)!;
  // With repeated text the two scans can overlap; push the ends past the start.
  const overlap = start - Math.min(endA, endB);
  if (overlap > 0) {
    endA += overlap;
    endB += overlap;
  }
  return (pos: number) => (pos <= start ? pos : pos >= endA ? pos + (endB - endA) : endB);
}
