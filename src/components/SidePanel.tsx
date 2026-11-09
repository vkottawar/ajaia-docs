"use client";

/** Right-hand drawer used by the comments and version history panels. */
export function SidePanel({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <aside
      aria-label={title}
      className="fixed inset-y-0 right-0 z-30 flex w-96 max-w-full flex-col border-l border-slate-200 bg-white shadow-xl print:hidden"
    >
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <h2 className="font-semibold">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={`Close ${title.toLowerCase()}`}
          className="rounded-md px-2 py-1 text-slate-500 hover:bg-slate-100"
        >
          ✕
        </button>
      </div>
      {children}
    </aside>
  );
}

export const formatTimestamp = (timestamp: number) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(timestamp);
