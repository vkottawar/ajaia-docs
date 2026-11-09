import { notFound, redirect } from "next/navigation";
import { ne } from "drizzle-orm";
import { AppHeader } from "@/components/AppHeader";
import { DocumentEditor } from "@/components/DocumentEditor";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { getDocument } from "@/lib/documents";
import { AppError } from "@/lib/errors";
import { getCurrentUser } from "@/lib/session";

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { id } = await params;
  const db = await getDb();

  let doc;
  try {
    doc = await getDocument(db, user.id, id);
  } catch (error) {
    if (error instanceof AppError && error.status === 404) notFound();
    throw error;
  }

  // Suggestions for the share dialog. Fine for three seeded users; a real
  // product would search a directory instead of listing everyone.
  const otherUsers =
    doc.access === "owner"
      ? await db
          .select({ name: users.name, email: users.email })
          .from(users)
          .where(ne(users.id, user.id))
          .orderBy(users.name)
      : [];

  return (
    <>
      <AppHeader user={user} />
      <DocumentEditor doc={doc} currentUserId={user.id} shareSuggestions={otherUsers} />
    </>
  );
}
