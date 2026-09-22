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
