import { normalize } from '../util/normalize.js';

// Heuristic used to decide "is this the same real-world story a different
// source already reported" -- per explicit agreement: start simple, only
// tighten/loosen once real production data shows it's too loose or too
// strict. Two-stage: (1) same league + within a time window (cheap DB
// filter, keeps the candidate set small), then (2) title-word overlap
// above a threshold (no external call needed -- LLM-based comparison was
// considered and rejected for cost/latency at this volume, see
// runGeneralNewsScraper.js's own comment).
const TIME_WINDOW_MS = 8 * 60 * 60 * 1000; // 8h -- generous enough to catch a same-day follow-up from a slower-publishing outlet, tight enough not to match two unrelated stories about the same club days apart
const SIMILARITY_THRESHOLD = 0.5; // conservative on purpose -- a missed duplicate (shown twice) is a much smaller problem than two different stories wrongly merged into one

// Small multilingual stopword list -- just enough to stop generic
// football-reporting vocabulary ("wins", "match", "says") from padding out
// the similarity score for two headlines that aren't actually related.
// Deliberately not exhaustive; over-including a stopword only makes
// matching slightly more conservative, never wrong.
const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'this', 'that', 'his', 'her', 'their', 'says', 'said', 'win', 'wins', 'match', 'game',
  'der', 'die', 'das', 'und', 'mit', 'für', 'gegen', 'nach', 'sein', 'ihre', 'sagt', 'spiel',
  'il', 'lo', 'la', 'le', 'gli', 'con', 'per', 'del', 'della', 'dopo', 'contro', 'partita',
  'le', 'la', 'les', 'des', 'pour', 'avec', 'contre', 'après', 'son', 'sa', 'match',
  'el', 'la', 'los', 'las', 'con', 'para', 'contra', 'después', 'partido', 'dice',
]);

function titleTokens(title) {
  return new Set(
    normalize(title)
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w))
  );
}

function jaccardSimilarity(titleA, titleB) {
  const a = titleTokens(titleA);
  const b = titleTokens(titleB);
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }
  const union = a.size + b.size - intersection;
  return intersection / union;
}

// Returns the existing row this item duplicates, or null. Only called for
// items that already passed the league-resolution gate (findMentionedClubs
// in clubMatch.js), so leagueId is always a real match here, not a guess.
export async function findDuplicateArticle(supabase, { leagueId, title, publishedAt }) {
  const centerMs = new Date(publishedAt).getTime();
  const since = new Date(centerMs - TIME_WINDOW_MS).toISOString();
  const until = new Date(centerMs + TIME_WINDOW_MS).toISOString();

  const { data, error } = await supabase
    .from('news_articles')
    .select('id, title, published_at')
    .eq('league_id', leagueId)
    .gte('published_at', since)
    .lte('published_at', until);
  if (error) throw error;

  return data.find((row) => jaccardSimilarity(row.title, title) >= SIMILARITY_THRESHOLD) ?? null;
}
