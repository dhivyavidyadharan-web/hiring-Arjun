import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let db: SupabaseClient | null = null;

export function getDb(): SupabaseClient {
  if (!db) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
    db = createClient(url, key, { auth: { persistSession: false } });
  }
  return db;
}
