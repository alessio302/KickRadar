// Fixture ids that at least one push subscription has favorited (see
// favorite_fixtures, sql/026_favorite_fixtures.sql). Live in-play events
// (goals/cards/subs) are only fetched for these fixtures -- GOAL API's
// daily request budget is shared across every league, and fetching events
// for matches nobody follows burned it for no benefit. The table is tiny
// (a handful of rows per subscriber), so one unpaginated read is fine.
export async function getFavoritedFixtureIds(supabase) {
  const { data, error } = await supabase.from('favorite_fixtures').select('fixture_id');
  if (error) throw error;
  return new Set(data.map((r) => r.fixture_id));
}
