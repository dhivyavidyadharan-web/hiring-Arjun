import Dashboard, { type Candidate } from "@/components/Dashboard";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { data, error } = await getDb()
    .from("candidates")
    .select("*")
    .order("dna_score", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: true });

  if (error) {
    return (
      <main className="wrap">
        <div className="panel">
          <h1>Database error</h1>
          <p className="err">{error.message}</p>
          <p className="muted">Did you run supabase/schema.sql and set SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY?</p>
        </div>
      </main>
    );
  }
  return <Dashboard initial={(data ?? []) as Candidate[]} />;
}
