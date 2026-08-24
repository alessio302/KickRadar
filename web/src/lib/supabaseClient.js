import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Copy web/.env.example to web/.env and fill them in.'
  );
}

// The anon/publishable key is safe to ship to the browser (it's what RLS
// policies are for, see sql/004_enable_rls.sql) -- never the service_role
// key used by the backend scripts.
export const supabase = createClient(url, anonKey);
