import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { users, type User } from "@/db/schema";
import { unauthorized } from "./errors";

/**
 * Mock auth: the session is a signed cookie holding a seeded user's id.
 * Signing means a visitor can't become another user by editing the cookie,
 * which is enough to make the sharing rules meaningful in a demo. There are
 * no passwords; a real deployment would swap this file for a proper provider.
 */

const COOKIE_NAME = "session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

function secret() {
  const value = process.env.SESSION_SECRET;
  if (value) return value;
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET must be set in production.");
  }
  return "dev-only-secret";
}

const sign = (userId: string) =>
  createHmac("sha256", secret()).update(userId).digest("base64url");

export function encodeSession(userId: string) {
  return `${userId}.${sign(userId)}`;
}

export function decodeSession(value: string | undefined): string | null {
  if (!value) return null;
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return null;
  const userId = value.slice(0, dot);
  const given = Buffer.from(value.slice(dot + 1));
  const expected = Buffer.from(sign(userId));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return null;
  }
  return userId;
}

export async function getCurrentUser(): Promise<User | null> {
  const store = await cookies();
  const userId = decodeSession(store.get(COOKIE_NAME)?.value);
  if (!userId) return null;
  const db = await getDb();
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return user ?? null;
}

/** For route handlers: returns the user or throws a 401 AppError. */
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) throw unauthorized();
  return user;
}

export async function startSession(userId: string) {
  const store = await cookies();
  store.set(COOKIE_NAME, encodeSession(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function endSession() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}
