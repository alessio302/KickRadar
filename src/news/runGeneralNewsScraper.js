import { createHash } from 'node:crypto';
import { getSupabaseClient } from '../db/supabaseClient.js';
import { findMentionedClubs } from './clubMatch.js';
import { findDuplicateArticle } from './dedupeNews.js';
import { llmSummarizeNews } from './llmSummarizeNews.js';
import { isWomensFootball } from './relevance.js';

import bundesligaCom from './generalSources/bundesligaCom.js';
import sportschau from './generalSources/sportschau.js';
import kickerGeneral from './generalSources/kickerGeneral.js';
import tuttomercatowebGeneral from './generalSources/tuttomercatowebGeneral.js';
import gazzetta from './generalSources/gazzetta.js';
import bbcFootball from './generalSources/bbcFootball.js';
import guardianFootball from './generalSources/guardianFootball.js';
import marcaGeneral from './generalSources/marcaGeneral.js';
import rmcsportFootball from './generalSources/rmcsportFootball.js';

// Separate pipeline from runNewsScraper.js (transfers): these sources cover
// general match reports/interviews/club news, not just the transfer
// market, and most of them (BBC, Guardian, Marca, RMC Sport) span far more
// than one league -- there's no per-league newsSources binding the way
// config/leagues.js has for transfers, so every source is fetched once and
// fanned out to whichever tracked league(s) it actually mentions (see
// findMentionedClubs() in clubMatch.js), rather than iterated per league.
const SOURCES = [
  bundesligaCom,
  sportschau,
  kickerGeneral,
  tuttomercatowebGeneral,
  gazzetta,
  bbcFootball,
  guardianFootball,
  marcaGeneral,
  rmcsportFootball,
];

function externalIdFor(item) {
  return createHash('sha256').update(item.guid || item.link).digest('hex');
}

async function markSeen(supabase, sourceKey, externalId) {
  const { error } = await supabase
    .from('seen_news_items')
    .upsert({ source: sourceKey, external_id: externalId }, { onConflict: 'source,external_id' });
  if (error) console.error(`[${sourceKey}] failed to record seen item:`, error.message);
}

async function scrapeSource(supabase, source, allClubs) {
  const { data: seenRows, error: seenErr } = await supabase
    .from('seen_news_items')
    .select('external_id')
    .eq('source', source.sourceKey);
  if (seenErr) throw seenErr;
  const knownIds = new Set(seenRows.map((r) => r.external_id));

  const items = await source.fetchLatest();
  let inserted = 0;
  let skipped = 0;
  let deduped = 0;

  for (const item of items) {
    const externalId = externalIdFor(item);
    if (knownIds.has(externalId)) continue; // already processed on a previous run

    const text = `${item.title} ${item.summary || ''}`;
    if (isWomensFootball(text)) {
      await markSeen(supabase, source.sourceKey, externalId);
      skipped += 1;
      continue;
    }

    // The league-resolution gate: an article only becomes a News card if
    // it names at least one club from our 5 tracked leagues. This is the
    // ONLY relevance filter -- unlike transfers.js's isTransferRelevant()
    // keyword gate, News has no "is this transfer-shaped" concept to check,
    // any real football news about a tracked club belongs here.
    const mentionedClubs = findMentionedClubs(text, allClubs);
    if (mentionedClubs.length === 0) {
      await markSeen(supabase, source.sourceKey, externalId);
      skipped += 1;
      continue;
    }
    const leagueIds = [...new Set(mentionedClubs.map((c) => c.league_id))];

    // Summarize once per article (not once per matching league) -- the
    // summary text itself doesn't depend on which league we're filing it
    // under. LLM call happens before markSeen so a crash mid-call doesn't
    // silently lose the article (matches runNewsScraper.js's own ordering
    // intent), but AFTER the relevance gate above, so an irrelevant item
    // never costs an API call.
    let llmResult = null;
    try {
      llmResult = await llmSummarizeNews(item.title, item.summary);
    } catch (err) {
      console.warn(`[${source.sourceKey}] LLM summarization failed, storing without AI summary/translated title:`, err.message);
    }

    await markSeen(supabase, source.sourceKey, externalId);

    for (const leagueId of leagueIds) {
      // Per explicit product decision: the first-arrived source wins,
      // later duplicates from other outlets about the same story are
      // dropped, not merged (unlike transfers.js's duplicateOf handling,
      // which updates the existing row toward the newer/more-complete
      // version -- see dedupeNews.js's header comment for why News's
      // policy is deliberately simpler).
      const duplicate = await findDuplicateArticle(supabase, {
        leagueId,
        title: item.title,
        publishedAt: item.publishedAt,
      });
      if (duplicate) {
        deduped += 1;
        continue;
      }

      const { error: upsertErr } = await supabase.from('news_articles').upsert(
        {
          league_id: leagueId,
          source: source.sourceKey,
          title: item.title,
          teaser: item.summary || null,
          image_url: item.image || null,
          source_url: item.link,
          published_at: item.publishedAt,
          external_id: externalId,
          title_de: llmResult?.title?.de ?? null,
          title_en: llmResult?.title?.en ?? null,
          title_it: llmResult?.title?.it ?? null,
          title_fr: llmResult?.title?.fr ?? null,
          title_es: llmResult?.title?.es ?? null,
          ai_summary_de: llmResult?.summary?.de ?? null,
          ai_summary_en: llmResult?.summary?.en ?? null,
          ai_summary_it: llmResult?.summary?.it ?? null,
          ai_summary_fr: llmResult?.summary?.fr ?? null,
          ai_summary_es: llmResult?.summary?.es ?? null,
        },
        { onConflict: 'source,external_id,league_id' }
      );
      if (upsertErr) {
        console.error(`[${source.sourceKey}] failed to upsert news article:`, upsertErr.message);
        continue;
      }
      inserted += 1;
    }
  }

  return { inserted, skipped, deduped };
}

export async function runGeneralNewsScraper() {
  const supabase = getSupabaseClient();
  const { data: allClubs, error: clubsErr } = await supabase.from('clubs').select('id, name, short_name, aliases, league_id');
  if (clubsErr) throw clubsErr;

  const results = {};
  for (const source of SOURCES) {
    try {
      results[source.sourceKey] = await scrapeSource(supabase, source, allClubs);
    } catch (err) {
      console.error(`[${source.sourceKey}] scrape failed:`, err.message);
      results[source.sourceKey] = { error: err.message };
    }
  }
  return results;
}

const isMain = process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href;
if (isMain) {
  runGeneralNewsScraper()
    .then((results) => {
      console.log('General news scrape complete:', results);
    })
    .catch((err) => {
      console.error('General news scrape failed:', err);
      process.exitCode = 1;
    });
}
