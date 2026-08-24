// One-off diagnostic, not part of the regular pipeline. Serie A has stored
// exactly one transfer since the tuttomercatoweb source went live, while
// the scraper log shows ~18 "new" items processed on every hourly run --
// meaning every single one is being rejected somewhere in the pipeline
// (relevance filter, LLM extraction, or the club-match gate) rather than
// simply not existing. This dumps each stage's output per item so the real
// cause is visible instead of guessed.
import { getSupabaseClient } from '../db/supabaseClient.js';
import { leagueBySlug } from '../config/leagues.js';
import { isTransferRelevant } from './relevance.js';
import { llmExtractTransferInfo } from './llmExtract.js';
import { resolveClub } from './clubMatch.js';
import tuttomercatoweb from './sources/tuttomercatoweb.js';

async function main() {
  const supabase = getSupabaseClient();
  const league = leagueBySlug('serie-a');

  const { data: dbLeague, error: leagueErr } = await supabase
    .from('leagues')
    .select('id')
    .eq('slug', league.slug)
    .single();
  if (leagueErr) throw leagueErr;

  const { data: clubs, error: clubsErr } = await supabase
    .from('clubs')
    .select('id, name, aliases')
    .eq('league_id', dbLeague.id);
  if (clubsErr) throw clubsErr;
  console.log(`Serie A clubs in DB (${clubs.length}):`, clubs.map((c) => c.name));

  const items = await tuttomercatoweb.fetchLatest();
  console.log(`\nFetched ${items.length} raw items from tuttomercatoweb.\n`);

  let relevantCount = 0;
  let extractedCount = 0;
  let matchedCount = 0;

  for (const [i, item] of items.entries()) {
    console.log(`--- Item ${i + 1}/${items.length} ---`);
    console.log('title:', item.title);
    console.log('summary:', item.summary || '(empty)');

    const text = `${item.title} ${item.summary || ''}`;
    const relevant = isTransferRelevant('tuttomercatoweb', text);
    console.log('relevant:', relevant);
    if (!relevant) continue;
    relevantCount += 1;

    try {
      const result = await llmExtractTransferInfo(item.title, item.summary || item.title);
      console.log('llm result:', result);
      if (result.playerName) extractedCount += 1;

      const fromMatch = resolveClub(result.fromClub, clubs);
      const toMatch = resolveClub(result.toClub, clubs);
      console.log('fromClub match:', fromMatch?.name ?? null, '| toClub match:', toMatch?.name ?? null);
      if (fromMatch || toMatch) matchedCount += 1;
    } catch (err) {
      console.log('LLM extraction failed:', err.message);
    }
    console.log('');
  }

  console.log('--- Summary ---');
  console.log({ total: items.length, relevantCount, extractedCount, matchedCount });
}

main().catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exitCode = 1;
});
