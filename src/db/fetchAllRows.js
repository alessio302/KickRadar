// Supabase/PostgREST caps a single .select() response at its configured
// db-max-rows (Supabase's own default is 1000) -- confirmed live
// (2026-09-06): src/lineups/syncPlayerProfiles.js's own unpaginated
// `players` table fetch was silently returning only a fraction of the
// table (1000 of 3769 rows at the time) with no error and no indication
// anything was cut off, so its own duplicate-prevention lookup maps
// (built from that partial result) missed most existing players --
// exactly the "why did this same bug come back" surprise that led here.
// Paginates via .range() until a page comes back short of pageSize, so a
// caller that means "every row matching this query" actually gets every
// row regardless of table size.
export async function fetchAllRows(supabase, table, columns, buildQuery) {
  const pageSize = 1000;
  const rows = [];
  let from = 0;
  for (;;) {
    let query = supabase.from(table).select(columns).range(from, from + pageSize - 1);
    if (buildQuery) query = buildQuery(query);
    const { data, error } = await query;
    if (error) throw error;
    rows.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}
