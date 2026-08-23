import { createClient } from '@supabase/supabase-js';

let client;

// Lazily created so scripts that don't touch the DB (e.g. --dry-run) don't
// need the env vars set at import time.
export function getSupabaseClient() {
  if (client) return client;

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      'Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY env vars. ' +
        'Copy .env.example to .env and fill them in (see README for setup).'
    );
  }

  client = createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });
  return client;
}
