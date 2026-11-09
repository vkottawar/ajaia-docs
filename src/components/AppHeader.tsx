import Link from "next/link";
import { logout } from "@/app/actions";

export function AppHeader({ user }: { user: { name: string; email: string } }) {
  return (
    <header className="border-b border-slate-200 bg-white print:hidden">
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="font-semibold">
          Ajaia Docs
        </Link>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-slate-600" title={user.email}>
            Signed in as <span className="font-medium text-slate-900">{user.name}</span>
          </span>
          <form action={logout}>
            <button type="submit" className="rounded-md px-2 py-1 text-blue-700 hover:bg-blue-50">
              Switch user
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
