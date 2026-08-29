import { createHash } from 'node:crypto';
import { getSupabaseClient } from '../db/supabaseClient.js';
import { LEAGUES } from '../config/leagues.js';
import { isTransferRelevant } from './relevance.js';
import { llmExtractTransferInfo } from './llmExtract.js';
import { resolveClub } from './clubMatch.js';
import skysports from './sources/skysports.js';

// Throwaway diagnostic: confirmed via diagnoseNewsFreshness.js that
// premier-league had 2 items pass relevance and get marked seen in the
// last 8h, yet the last actual transfers row for premier-league is 3 days
// old -- unlike bundesliga/la-liga (also stale, but their seen_news_items
// growth is equally near-zero, i.e. a quiet source, not a quiet PIPELINE).
// Something specific to premier-league's downstream club/league matching
// is the suspect. Re-runs the exact same decision chain scrapeLeague()
// uses (relevance -> LLM extraction -> resolveClub -> league gate) against
// today's currently-fetched skysports items that are ALSO already in
// seen_news_items (i.e. items a real run already processed), to see
// exactly which gate rejected them. Read-only, no writes.
function externalIdFor(item) {
  return createHash('sha256').update(item.guid || item.link).digest('hex');
}

async function main() {
  const supabase = getSupabaseClient();
  const league = LEAGUES.find((l) => l.slug === 'premier-league');

  const { data: dbLeague } = await supabase.from('leagues').select('id').eq('slug', league.slug).single();
  const { data: allClubs } = await supabase.from('clubs').select('id, name, short_name, aliases, league_id');

  const { data: seenRows } = await supabase
    .from('seen_news_items')
    .select('external_id, seen_at')
    .eq('source', 'skysports')
    .order('seen_at', { ascending: false })
    .limit(30);
  const seenMap = new Map(seenRows.map((r) => [r.external_id, r.seen_at]));

  const items = await skysports.fetchLatest();
  console.log(`Fetched ${items.length} skysports items; ${seenRows.length} seen_news_items rows on file (most recent 30)`);

  const alreadySeenItems = items.filter((item) => seenMap.has(externalIdFor(item)));
  console.log(`${alreadySeenItems.length} of the currently-fetched items match a seen_news_items row -- replaying their extraction:`);

  for (const item of alreadySeenItems) {
    const seenAt = seenMap.get(externalIdFor(item));
    console.log(`\n--- "${item.title}" (seen_at=${seenAt}) ---`);

    const text = `${item.title} ${item.summary || ''}`;
    const relevant = isTransferRelevant('skysports', text);
    console.log(`isTransferRelevant: ${relevant}`);
    if (!relevant) continue;

    let extraction;
    try {
      extraction = await llmExtractTransferInfo(item.title, item.summary || item.title);
    } catch (err) {
      console.log(`LLM extraction threw: ${err.message}`);
      continue;
    }
    console.log('LLM extraction result:', JSON.stringify(extraction));

    const fromClubMatch = resolveClub(extraction.fromClub, allClubs);
    const toClubMatch = resolveClub(extraction.toClub, allClubs);
    console.log(
      `resolveClub: fromClub="${extraction.fromClub}" -> ${fromClubMatch ? `${fromClubMatch.name} (league_id=${fromClubMatch.league_id})` : 'NO MATCH'}; toClub="${extraction.toClub}" -> ${toClubMatch ? `${toClubMatch.name} (league_id=${toClubMatch.league_id})` : 'NO MATCH'}`
    );
    const fromInThisLeague = fromClubMatch?.league_id === dbLeague.id;
    const toInThisLeague = toClubMatch?.league_id === dbLeague.id;
    console.log(`League gate: fromInThisLeague=${fromInThisLeague} toInThisLeague=${toInThisLeague} (thisLeagueId=${dbLeague.id}) -> ${fromInThisLeague || toInThisLeague ? 'PASSES' : 'REJECTED'}`);
  }
}

main().catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exitCode = 1;
});
