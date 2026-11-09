import Link from "next/link";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { DashboardActions } from "@/components/DashboardActions";
import { DeleteDocumentButton } from "@/components/DeleteDocumentButton";
import { getDb } from "@/db/client";
import { listDocuments, type DocumentSummary } from "@/lib/documents";
import { getCurrentUser } from "@/lib/session";

const formatDate = (timestamp: number) =>
  new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(timestamp) + " UTC";

const ROLE_LABEL = { owner: "Owner", editor: "Can edit", viewer: "View only" } as const;

function DocumentList({ docs, emptyText }: { docs: DocumentSummary[]; emptyText: string }) {
  if (docs.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">
        {emptyText}
      </p>
    );
  }
  return (
    <ul className="divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white">
      {docs.map((doc) => (
        <li key={doc.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
          <Link href={`/documents/${doc.id}`} className="min-w-0 flex-1">
            <span className="block truncate font-medium">{doc.title}</span>
            <span className="block text-xs text-slate-500">
              {doc.access === "owner" ? "Owned by you" : `Shared by ${doc.ownerName}`} · Updated{" "}
              {formatDate(doc.updatedAt)}
            </span>
          </Link>
          {doc.access === "owner" ? (
            <DeleteDocumentButton id={doc.id} title={doc.title} />
          ) : (
            <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
              {ROLE_LABEL[doc.access]}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { owned, shared } = await listDocuments(await getDb(), user.id);

  return (
    <>
      <AppHeader user={user} />
      <main className="mx-auto max-w-4xl space-y-8 px-4 py-8">
        <DashboardActions />
        <section aria-labelledby="owned-heading">
          <h2 id="owned-heading" className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            My documents
          </h2>
          <DocumentList docs={owned} emptyText="You haven't created any documents yet." />
        </section>
        <section aria-labelledby="shared-heading">
          <h2 id="shared-heading" className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Shared with me
          </h2>
          <DocumentList docs={shared} emptyText="Nothing has been shared with you yet." />
        </section>
      </main>
    </>
  );
}
