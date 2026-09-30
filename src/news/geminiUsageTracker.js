import path from 'node:path';
import { getSupabaseClient } from '../db/supabaseClient.js';

// Shared by llmSummarizeNews.js (News) and llmExtract.js (Transfers) --
// same source-derivation approach as goalApiClient.js's CALLER_SOURCE
// (sql/067's own comment): each caller runs as its own `node src/.../foo.js`
// process, so the entry script's filename is a reliable, zero-config label
// without threading a `source` param through every call site.
const CALLER_SOURCE = process.argv[1] ? path.basename(process.argv[1]) : 'unknown';

// Best-effort, same principle as goalApiClient.js's own recordUsage(): a
// failure to record usage must never be why a real Gemini call fails.
// Called once per raw call ATTEMPT (success or failure, including retries)
// -- a rejected/erroring call still counts against the provider's own RPD,
// same as a GOAL API 429 still costs budget.
export async function recordGeminiUsage(model) {
  try {
    const { error } = await getSupabaseClient().rpc('increment_gemini_usage', { p_source: CALLER_SOURCE, p_model: model });
    if (error) console.error('Failed to record Gemini usage:', error.message);
  } catch (err) {
    console.error('Failed to record Gemini usage:', err.message);
  }
}

// Same principle as goalApiClient.js's hasGoalApiBudgetRemaining() -- a
// caller that does real, avoidable-if-exhausted work (here: a single but
// otherwise-doomed LLM call) should check this FIRST and skip with a clear
// log line, rather than finding out via a 429/RESOURCE_EXHAUSTED after
// already paying for a page fetch. Confirmed live (2026-09-30, gemini_usage
// itself): runGeneralNewsScraper.js alone routinely spends 700-1200+
// requests/day against gemini-3.5-flash-lite's shared 500 RPD cap -- any
// OTHER caller on the same model (syncSerieABroadcasters.js's
// llmExtractBroadcasts.js) is competing for a pool that's typically already
// gone well before its own scheduled run. Summed across every source
// sharing this model, not just the caller's own CALLER_SOURCE -- the quota
// itself is account-wide per model, not per script.
export async function hasGeminiBudgetRemaining(model, dailyLimit, safetyMargin = 0) {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await getSupabaseClient().from('gemini_usage').select('request_count').eq('day', today).eq('model', model);
  if (error) {
    console.error('Failed to read Gemini usage, proceeding optimistically:', error.message);
    return true; // never let a usage-check failure be the reason real work doesn't happen
  }
  const used = (data ?? []).reduce((sum, row) => sum + row.request_count, 0);
  return used < dailyLimit - safetyMargin;
}
