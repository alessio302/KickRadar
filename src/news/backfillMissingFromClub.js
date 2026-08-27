// One-off corrective pass: recovers from_club for transfers rows that have
// a destination (to_club) but no origin -- exactly the rows useTransfers.js
// hides as "ambiguous with no arrow" (see its own comment). Two recovery
// paths, same priority order runNewsScraper.js already uses for new items:
//
// 1. Squad data (lookupSquadMembership) -- free, no external call, works
//    when the player is on a currently-synced squad (one of the 5 tracked
//    leagues) at a club other than the destination.
// 2. Re-run LLM extraction against the article body (re-fetched from
//    source_url -- the article's full text was never persisted, only used
//    transiently at scrape time). Recovers cases squad data can't reach
//    (a lower-division/foreign prior club) and also cases where the
//    original scrape ran during a Gemini outage and silently degraded to
//    the much weaker regex fallback -- confirmed live: a manually
//    triggered run hit exactly this (Gemini 503 "high demand" for the
//    entire run), which is very likely why several footmercato "official
//    signing" rows (Patouillet, Touba, ...) never got a from_club despite
//    the source article almost certainly stating it.
//
// Leaves a row untouched (not deleted) if neither path recovers an
// origin -- it just stays hidden until/unless a future pass or a fuller
// follow-up article resolves it. Read-only except for the from_club/
// from_club_id update on rows this pass actually fixes.
import { getSupabaseClient } from '../db/supabaseClient.js';
import { resolveClub } from './clubMatch.js';
import { fetchArticleText } from './articleBody.js';
import { llmExtractTransferInfo } from './llmExtract.js';
import { lookupSquadMembership } from './runNewsScraper.js';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const supabase = getSupabaseClient();

  const { data: allClubs, error: clubsErr } = await supabase.from('clubs').select('id, name, short_name, aliases, league_id');
  if (clubsErr) throw clubsErr;

  const { data: rows, error } = await supabase
    .from('transfers')
    .select('id, player_name, to_club, to_club_id, summary, source_url')
    .not('to_club', 'is', null)
    .not('player_name', 'is', null)
    .is('from_club', null);
  if (error) throw error;

  console.log(`${rows.length} rows with a destination but no origin.`);

  let squadFixed = 0;
  let llmFixed = 0;
  let stillUnresolved = 0;

  for (const t of rows) {
    console.log(`\n#${t.id} "${t.player_name}" -> "${t.to_club}"`);

    let membership;
    try {
      membership = await lookupSquadMembership(supabase, t.player_name);
    } catch (err) {
      console.error(`  squad lookup failed:`, err.message);
    }
    if (membership && membership.clubId !== t.to_club_id) {
      const realClub = allClubs.find((c) => c.id === membership.clubId);
      if (realClub) {
        const { error: updateErr } = await supabase
          .from('transfers')
          .update({ from_club: realClub.name, from_club_id: realClub.id })
          .eq('id', t.id);
        if (updateErr) {
          console.error(`  failed to update from squad match:`, updateErr.message);
        } else {
          console.log(`  fixed via squad data: from_club = "${realClub.name}"`);
          squadFixed += 1;
          continue;
        }
      }
    }

    // Confirmed live (diagnoseArticleFetch.js): an isolated fetch of a
    // URL that failed here mid-run succeeds instantly and cleanly (200,
    // full body) -- the URLs themselves are fine, it's specifically
    // bursting many requests at the same host in one run that trips a
    // rate-limit/bot-block. 1.5s wasn't enough spacing to avoid it once
    // several dozen requests had already gone out in the same run; 3s is
    // still cheap for a batch this size (well under a minute of total
    // delay) and gives real headroom.
    await sleep(3000);
    const articleText = await fetchArticleText(t.source_url);
    if (!articleText) {
      console.log('  no squad match and article body unreachable -- leaving as-is');
      stillUnresolved += 1;
      continue;
    }

    let extracted;
    try {
      extracted = await llmExtractTransferInfo(t.summary ?? t.player_name, articleText);
    } catch (err) {
      console.error(`  LLM re-extraction failed:`, err.message);
      stillUnresolved += 1;
      continue;
    }

    if (!extracted.fromClub) {
      console.log('  LLM re-extraction found no origin either -- leaving as-is');
      stillUnresolved += 1;
      continue;
    }

    const fromMatch = resolveClub(extracted.fromClub, allClubs);
    const finalFromClub = fromMatch?.name ?? extracted.fromClub;
    const { error: updateErr } = await supabase
      .from('transfers')
      .update({ from_club: finalFromClub, from_club_id: fromMatch?.id ?? null })
      .eq('id', t.id);
    if (updateErr) {
      console.error(`  failed to update from LLM re-extraction:`, updateErr.message);
      stillUnresolved += 1;
    } else {
      console.log(`  fixed via LLM re-extraction: from_club = "${finalFromClub}"`);
      llmFixed += 1;
    }
  }

  console.log(`\nDone: ${squadFixed} fixed via squad data, ${llmFixed} fixed via LLM re-extraction, ${stillUnresolved} still unresolved.`);
}

main().catch((err) => {
  console.error('Backfill pass failed:', err);
  process.exitCode = 1;
});
