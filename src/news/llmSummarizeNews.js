import { GoogleGenAI, Type } from '@google/genai';
import { recordGeminiUsage } from './geminiUsageTracker.js';

// Same Gemini free-tier approach as llmExtract.js (transfers). Returns both
// a translated headline and a summary in every app language, in ONE call
// (no extra API requests over the summary-only version) -- confirmed-live
// user feedback: showing the original-language headline above an
// already-translated summary read as inconsistent (news-card list AND the
// AI-summary overlay both used the raw, untranslated `title`).
const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    title: {
      type: Type.OBJECT,
      description:
        "A natural, idiomatic headline translation into EACH of the 5 languages below -- read as a real headline written in that language, not a stiff word-for-word translation. Keep player/club names as they commonly appear in football media (don't translate those).",
      properties: {
        de: { type: Type.STRING, description: 'German headline.' },
        en: { type: Type.STRING, description: 'English headline.' },
        it: { type: Type.STRING, description: 'Italian headline.' },
        fr: { type: Type.STRING, description: 'French headline.' },
        es: { type: Type.STRING, description: 'Spanish headline.' },
      },
      required: ['de', 'en', 'it', 'fr', 'es'],
    },
    summary: {
      type: Type.OBJECT,
      description:
        'A 1-2 sentence summary of the article, capturing its actual content (what happened, who said what, the concrete result/decision) -- not just restating the headline. Written independently in EACH of the 5 languages below, not translated from one draft.',
      properties: {
        de: { type: Type.STRING, description: 'German summary.' },
        en: { type: Type.STRING, description: 'English summary.' },
        it: { type: Type.STRING, description: 'Italian summary.' },
        fr: { type: Type.STRING, description: 'French summary.' },
        es: { type: Type.STRING, description: 'Spanish summary.' },
      },
      required: ['de', 'en', 'it', 'fr', 'es'],
    },
  },
  required: ['title', 'summary'],
};

const SYSTEM_INSTRUCTION = `You process a single football (soccer) news article, given its headline and a short teaser/snippet, written in Italian, German, English, French, or Spanish. Produce (1) a natural headline translation into each of the 5 target languages, and (2) a concise, factual summary of what the article actually says -- not a translation or rephrasing of the headline alone. Use player/club names as they commonly appear in football media (don't translate those).`;

let client;
function getClient() {
  if (client) return client;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('Missing GEMINI_API_KEY env var.');
  }
  client = new GoogleGenAI({ apiKey });
  return client;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Confirmed live (2026-09-22): a Gemini-side 503 "high demand" spell lasting
// several minutes hit ~25 back-to-back calls across one entire scraper run,
// every one of them permanently stranding that article without a
// translation -- runGeneralNewsScraper.js only ever calls this once per
// item, on first sight, and marks it seen regardless of outcome (see this
// project's own backfillNewsSummaries.js, written for the exact same
// failure shape after the previous model's quota exhaustion). A transient
// server-side overload is retryable in a way a genuine bad-request/auth
// error isn't -- same isRetryable split goalApiClient.js's call() already
// uses for its own provider. Capped at 2 retries: this call already sits
// behind a 6.5s throttle per item, so stacking too much backoff on top
// risks a big backlog run eating into the workflow's own timeout.
const RETRY_BACKOFFS_MS = [4000, 8000];

function isRetryableError(err) {
  // The SDK surfaces a raw provider error body as err.message here (see the
  // 503 log lines this was written from: `{"error":{"code":503,...}}`), not
  // a structured status field -- matched on the message text rather than a
  // property that may not exist on every error shape this call can throw.
  return /"code":\s*503|UNAVAILABLE|high demand/i.test(err?.message || '');
}

// Same throttle value/reasoning as llmExtract.js's MIN_CALL_INTERVAL_MS --
// a separate module-level counter (not imported from there) since this
// runs in a different process/scraper (runGeneralNewsScraper.js vs
// runNewsScraper.js), never in the same run, so there's no real benefit to
// sharing the counter, only unwanted coupling between two independent
// pipelines that happen to call the same API.
const MIN_CALL_INTERVAL_MS = 6500;
let lastCallAt = 0;

async function throttle() {
  const wait = lastCallAt + MIN_CALL_INTERVAL_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastCallAt = Date.now();
}

export async function llmSummarizeNews(title, teaser) {
  const ai = getClient();
  // Confirmed live (this project's own AI Studio quota page, 2026-09-17):
  // gemini-3.6-flash's free-tier daily cap is 20 RPD -- far too low for
  // News's volume (150-200+ summarizable items/day), and it's what
  // exhausted the quota on this pipeline's very first real run (every
  // summary silently came back null). gemini-3.5-flash-lite's free-tier
  // cap is 500 RPD on the same account/project -- 25x more headroom,
  // comfortably covers current volume, still $0. (gemini-3.1-flash-lite
  // shows the same 500 RPD if this one ever gets deprecated.)
  const model = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';

  for (let attempt = 0; attempt <= RETRY_BACKOFFS_MS.length; attempt++) {
    await throttle();
    let response;
    try {
      response = await ai.models.generateContent({
        model,
        contents: `Headline: ${title}\nTeaser: ${teaser || title}`,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
        },
      });
      await recordGeminiUsage(model);
    } catch (err) {
      await recordGeminiUsage(model);
      const isLastAttempt = attempt === RETRY_BACKOFFS_MS.length;
      if (!isRetryableError(err) || isLastAttempt) throw err;
      await sleep(RETRY_BACKOFFS_MS[attempt]);
      continue;
    }

    if (!response.text) {
      throw new Error('LLM summarization returned no text');
    }
    return JSON.parse(response.text);
  }
}
