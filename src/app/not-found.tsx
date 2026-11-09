import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 text-center">
      <h1 className="text-xl font-semibold">Document not found</h1>
      <p className="mt-2 text-sm text-slate-600">
        It may have been deleted, or it hasn&apos;t been shared with the account you&apos;re signed
        in as.
      </p>
      <Link href="/" className="mt-6 text-sm font-medium text-blue-700 hover:underline">
        Back to your documents
      </Link>
    </main>
  );
}
