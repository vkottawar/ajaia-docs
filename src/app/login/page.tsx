import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { login } from "../actions";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  const db = await getDb();
  const accounts = await db.select().from(users).orderBy(users.name);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-12">
      <h1 className="text-2xl font-semibold">Ajaia Docs</h1>
      <p className="mt-2 text-sm text-slate-600">
        This demo uses seeded accounts instead of passwords. Pick a user to sign in. To try
        sharing, sign in as a second user in another browser or a private window.
      </p>
      <ul className="mt-6 space-y-3">
        {accounts.map((account) => (
          <li key={account.id}>
            <form action={login}>
              <input type="hidden" name="userId" value={account.id} />
              <button
                type="submit"
                className="flex w-full items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-left shadow-sm transition hover:border-blue-400 hover:shadow focus-visible:outline-2 focus-visible:outline-blue-500"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-semibold text-blue-700">
                  {account.name[0]}
                </span>
                <span>
                  <span className="block font-medium">{account.name}</span>
                  <span className="block text-sm text-slate-500">{account.email}</span>
                </span>
              </button>
            </form>
          </li>
        ))}
      </ul>
    </main>
  );
}
