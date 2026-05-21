import { PendingDashboard } from "./PendingDashboard";

export default function PendingPage() {
  return (
    <div className="px-8 py-8">
      <header className="mb-8">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-blue-100 p-2 text-blue-700">🤖</div>
          <div>
            <h1 className="text-2xl font-bold">Agent activity</h1>
            <p className="mt-1 text-ink-600">
              Items your AI agents prepared overnight. Review and approve in one click.
            </p>
          </div>
        </div>
      </header>

      <PendingDashboard />
    </div>
  );
}
