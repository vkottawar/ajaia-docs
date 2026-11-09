/** Colors used for a user's avatar and their cursor in other people's editors. */
const PALETTE = ["#2563eb", "#e11d48", "#059669", "#d97706", "#7c3aed", "#0891b2"];

/** Same user, same color, in every tab. (The three demo users get distinct colors.) */
export function colorFor(userId: string) {
  let hash = 0;
  for (const char of userId) hash = (hash * 37 + char.charCodeAt(0)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}
