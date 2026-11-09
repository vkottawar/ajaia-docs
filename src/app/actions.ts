"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { endSession, startSession } from "@/lib/session";

export async function login(formData: FormData) {
  const userId = String(formData.get("userId") ?? "");
  const db = await getDb();
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) redirect("/login");
  await startSession(user.id);
  redirect("/");
}

export async function logout() {
  await endSession();
  redirect("/login");
}
