import { createHash } from 'node:crypto';
import { getSupabaseClient } from '../db/supabaseClient.js';
import { LEAGUES } from '../config/leagues.js';
import { classifyOfficial } from './classify.js';
import { isTransferRelevant } from './relevance.js';
import { extractTransferInfo } from './extract.js';
import { llmExtractTransferInfo } from './llmExtract.js';
import { resolvePlayerProfile } from './playerProfileResolver.js';

import tuttomercatoweb from './sources/tuttomercatoweb.js';
import kicker from './sources/kicker.js';
import skysports from './sources/skysports.js';
import rmcsport from './sources/rmcsport.js';

const SOURCES = { tuttomercatoweb, kicker, skysports, rmcsport };

function externalIdFor(item) {
  return createHash('sha256').update(item.guid || item.link).digest('hex');
}

// LLM extraction is the primary path (see llmExtract.js for why); the regex
// heuristic only kicks in if the API call itself fails (rate limit, outage,
// missing key), so a bad run degrades to the old behavior instead of losing
// the item entirely.
async function extractInfo(item, clubs, sourceKey) {
  try {
    const result = await llmExtractTransferInfo(item.title, item.summary || item.title);
    return { ...result, source: 'llm' };
  } catch (err) {
    console.warn(`[${sourceKey}] LLM extraction failed, falling back to regex heuristic:`, err.message);
    const isOfficial = classifyOfficial(sourceKey, `${item.title} ${item.summary || ''}`);
    const { playerName, fromClub, toClub } = extractTransferInfo(item.title, clubs, sourceKey);
    return { playerName, fromClub, toClub, isOfficial, source: 'regex' };
  }
}

async function scrapeLeague(supabase, league) {
  const source = SOURCES[league.newsSource];
  if (!source) throw new Error(`No source module for "${league.newsSource}"`);

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

  // Only ever process genuinely new items -- avoids re-running the LLM call
  // (and the relevance/player-resolution work) on the same ~150 items every
  // hourly run just because they're still in the source's latest-20/N list.
  const { data: existingRows, error: existingErr } = await supabase
    .from('transfers')
    .select('external_id')
    .eq('source', league.newsSource);
  if (existingErr) throw existingErr;
  const knownIds = new Set(existingRows.map((r) => r.external_id));

  const items = await source.fetchLatest();
  let inserted = 0;
  let skipped = 0;

  for (const item of items) {
    const externalId = externalIdFor(item);
    if (knownIds.has(externalId)) {
      continue; // already stored from a previous run, nothing to do
    }

    const text = `${item.title} ${item.summary || ''}`;
    if (!isTransferRelevant(league.newsSource, text)) {
      skipped += 1;
      continue;
    }

    const { playerName, fromClub, toClub, isOfficial } = await extractInfo(item, clubs, league.newsSource);

    let playerId = null;
    if (playerName) {
      try {
        const player = await resolvePlayerProfile(supabase, playerName);
        playerId = player.id;
      } catch (err) {
        console.warn(`[${league.slug}] player profile resolution failed for "${playerName}":`, err.message);
      }
    }

    const { error: upsertErr } = await supabase
      .from('transfers')
      .upsert(
        {
          league_id: dbLeague.id,
          player_id: playerId,
          player_name: playerName,
          from_club: fromClub,
          to_club: toClub,
          is_official: isOfficial,
          source: league.newsSource,
          source_url: item.link,
          summary: item.summary || item.title,
          published_at: item.publishedAt,
          external_id: externalId,
        },
        { onConflict: 'source,external_id' }
      );

    if (upsertErr) {
      console.error(`[${league.slug}] failed to upsert transfer:`, upsertErr.message);
      continue;
    }
    inserted += 1;
  }

  return { inserted, skipped };
}

export async function runNewsScraper() {
  const supabase = getSupabaseClient();
  const results = {};
  for (const league of LEAGUES) {
    try {
      results[league.slug] = await scrapeLeague(supabase, league);
    } catch (err) {
      console.error(`[${league.slug}] scrape failed:`, err.message);
      results[league.slug] = { error: err.message };
    }
  }
  return results;
}

const isMain = process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href;
if (isMain) {
  runNewsScraper()
    .then((results) => {
      console.log('News scrape complete:', results);
    })
    .catch((err) => {
      console.error('News scrape failed:', err);
      process.exitCode = 1;
    });
}
