import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TallyBridgeClient } from "./TallyBridgeClient";

export default async function TallyBridgePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: client } = await supabase
    .from("clients")
    .select("id, name")
    .eq("id", id)
    .single();
  if (!client) notFound();

  const { data: config } = await supabase
    .from("client_tally_config")
    .select("*")
    .eq("client_id", id)
    .maybeSingle();

  return (
    <div className="px-8 py-8">
      <Link
        href={`/app/clients/${id}`}
        className="mb-4 inline-block text-sm text-ink-600 hover:text-ink-900"
      >
        ← Back to client
      </Link>

      <header className="mb-8">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-blue-100 p-2 text-blue-700">⚡</div>
          <h1 className="text-2xl font-bold">Tally Bridge</h1>
        </div>
        <p className="mt-2 text-ink-600">
          Export invoices as Tally-importable XML vouchers for <strong>{client.name}</strong>.
          Stop typing invoices manually.
        </p>
      </header>

      <TallyBridgeClient
        clientId={id}
        clientName={client.name}
        initialConfig={config || null}
      />
    </div>
  );
}
