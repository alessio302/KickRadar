import { createHash } from 'node:crypto';
import { getSupabaseClient } from '../db/supabaseClient.js';
import { LEAGUES } from '../config/leagues.js';
import { classifyOfficial } from './classify.js';
import { extractTransferInfo } from './extract.js';
import { resolvePlayerProfile } from './playerProfileResolver.js';

import tuttomercatoweb from './sources/tuttomercatoweb.js';
import kicker from './sources/kicker.js';
import skysports from './sources/skysports.js';
import rmcsport from './sources/rmcsport.js';

const SOURCES = { tuttomercatoweb, kicker, skysports, rmcsport };

function externalIdFor(item) {
  return createHash('sha256').update(item.guid || item.link).digest('hex');
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

  const items = await source.fetchLatest();
  let inserted = 0;

  for (const item of items) {
    const text = `${item.title} ${item.summary || ''}`;
    const isOfficial = classifyOfficial(league.newsSource, text);
    const { playerName, fromClub, toClub } = extractTransferInfo(item.title, clubs, league.newsSource);

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
          external_id: externalIdFor(item),
        },
        { onConflict: 'source,external_id' }
      );

    if (upsertErr) {
      console.error(`[${league.slug}] failed to upsert transfer:`, upsertErr.message);
      continue;
    }
    inserted += 1;
  }

  return inserted;
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
