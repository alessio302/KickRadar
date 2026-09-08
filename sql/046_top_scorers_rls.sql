-- top_scorers (043_top_scorers.sql) was created without RLS, unlike every
-- other public table -- flagged by Supabase's security advisor as
-- "publicly accessible": with RLS off, the anon key (exposed client-side)
-- could read AND write/delete every row, not just read. Matches the same
-- "Public read access" policy already used by clubs/fixtures/standings.
alter table public.top_scorers enable row level security;

create policy "Public read access"
on public.top_scorers
for select
to public
using (true);
