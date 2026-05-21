import Link from "next/link";

export function Nav({ authed }: { authed: boolean }) {
  return (
    <header className="border-b border-ink-200 bg-ink-50">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-ink-900 text-sm font-extrabold text-ink-50">
            N
          </div>
          <span className="text-lg font-bold text-ink-900">NotusAI</span>
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          {authed ? (
            <>
              <Link href="/dashboard" className="text-ink-700 hover:text-ink-900">
                Dashboard
              </Link>
              <Link
                href="/dashboard/new"
                className="rounded-md bg-ink-900 px-3 py-1.5 text-ink-50 hover:opacity-85"
              >
                New notice
              </Link>
            </>
          ) : (
            <Link
              href="/login"
              className="rounded-md bg-ink-900 px-3 py-1.5 text-ink-50 hover:opacity-85"
            >
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
