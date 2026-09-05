// TEMPORARY DIAGNOSTIC -- not part of the app, delete after use.
//
// Live A/B comparison of gemini-3.5-flash-lite vs gemini-2.0-flash on the
// same real transfer-news inputs, to sanity-check extraction quality before
// switching GEMINI_MODEL (the free tier's 500 req/day cap on
// gemini-3.5-flash-lite is being hit on ordinary days, not just anomalous
// ones -- see the accompanying investigation). RESPONSE_SCHEMA and
// SYSTEM_INSTRUCTION are copied verbatim from llmExtract.js so both models
// are judged on an apples-to-apples prompt.
import { GoogleGenAI, Type } from '@google/genai';

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    playerName: {
      type: Type.STRING,
      nullable: true,
      description:
        "The player's full name this story is centrally about, or null if no single player is clearly identifiable (multi-player roundup, non-transfer story, etc.). Use the fullest form of the name found anywhere in the given text -- if the headline only gives a bare surname (e.g. \"Pedersen\") but the summary text spells out the full name (e.g. \"Marcus Pedersen\"), extract the full form, not just whatever the headline itself literally says. Only fall back to the shorter form if the full name never appears anywhere in the given text.",
    },
    fromClub: {
      type: Type.STRING,
      nullable: true,
      description:
        "The player's current club (the one they'd be leaving), or null if not stated/unclear. This includes \"club X wants to sell/is open to selling player\" stories with no named buyer -- that's still fromClub = X, toClub = null, NOT toClub = X.",
    },
    toClub: {
      type: Type.STRING,
      nullable: true,
      description:
        'The new/destination club the player would join, or null if no specific destination is named. Never the club the player is already at.',
    },
    isOfficial: {
      type: Type.BOOLEAN,
      description: 'True only if the deal is confirmed/done (e.g. "ufficiale", "offiziell", "confirmed", "signs", "s\'engage", "officiel"). False for rumors, negotiations, links, or interest.',
    },
    aiSummary: {
      type: Type.OBJECT,
      nullable: true,
      description:
        "A 2-3 sentence summary of the article's actual content -- what's concretely stated (interest, talks, fee, contract length, quotes), not just restating the headline -- written independently in EACH of the 5 languages below, not translated from one draft (so idiom/tone reads naturally in each). Null under the same condition playerName is null (not really a single-player transfer story); when null, leave every language field null too.",
      properties: {
        de: { type: Type.STRING, nullable: true, description: 'German summary.' },
        en: { type: Type.STRING, nullable: true, description: 'English summary.' },
        it: { type: Type.STRING, nullable: true, description: 'Italian summary.' },
        fr: { type: Type.STRING, nullable: true, description: 'French summary.' },
        es: { type: Type.STRING, nullable: true, description: 'Spanish summary.' },
      },
      required: ['de', 'en', 'it', 'fr', 'es'],
    },
  },
  required: ['playerName', 'fromClub', 'toClub', 'isOfficial', 'aiSummary'],
};

const SYSTEM_INSTRUCTION = `You extract structured data from a single football (soccer) transfer-market news headline and summary, written in Italian, German, English, or French. Use player/club names as they commonly appear in football media (don't translate those). If the story isn't really about one specific player's transfer (e.g. it's a roundup of several players, a match report, an interview with no transfer content, or a lineup/team-selection/fitness update about a player's current club) -- set playerName, fromClub, toClub, and aiSummary to null and isOfficial to false, even if the text names other clubs for context (a former club, an upcoming opponent, etc.).

Watch specifically for a player's FORMER club mentioned only as biography ("l'ex Bologna", "ex-Milan", "former Chelsea player", "ehemals bei Bayern", "qui a joué à..."): that is background, not a live transfer. Never turn it into fromClub or toClub unless the text is actually reporting that specific move happening now -- confirmed live: an article entirely about a player possibly starting for his CURRENT club (Juventus) against an upcoming opponent, which only mentioned "l'ex Bologna" in passing to describe his football history, was wrongly extracted as a Juventus -> Bologna transfer.

Be careful with direction: when a headline is about a club selling, being open to selling, or trying to offload a player -- with no specific buying club named -- that club is fromClub, never toClub, even though it's the only club mentioned. toClub is exclusively the destination the player would move to.`;

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  throw new Error('Missing GEMINI_API_KEY env var.');
}
const ai = new GoogleGenAI({ apiKey });

const MODELS = ['gemini-3.5-flash-lite', 'gemini-2.0-flash'];

// Same throttling pattern as llmExtract.js -- a bit of margin over the
// 15 req/min ceiling, since we're making up to 6 calls total here.
const MIN_CALL_INTERVAL_MS = 4500;
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Three real rows pulled from the production `transfers` table (ones whose
// ai_summary_de is already filled in, i.e. the original LLM extraction
// succeeded), chosen for nuance:
//  1. German / kicker -- an "ex-club" biographical mention (Ex-Schalker)
//     alongside a genuine official transfer, to test the direction +
//     biography-vs-transfer distinction together.
//  2. Italian / tuttomercatoweb -- headline-only input about a contract
//     RENEWAL that also namedrops an ex-club ("l'ex Juve"), to test whether
//     the model still surfaces a from-club/rumor read the way the original
//     pipeline run did, or nulls it out as "not really a transfer".
//  3. Spanish / fichajes -- a straightforward, longer, quote-bearing
//     article about a confirmed loan move.
const TEST_CASES = [
  {
    label: 'German (kicker) -- ex-club biography + official transfer',
    title: 'Werder Bremen verpflichtet Ex-Schalker Moussa Ndiaye',
    summary:
      'Der SV Werder Bremen verpflichtet am letzten Tag der Transferperdiode einen weiteren Neuzugang: Der Ex-Schalker Moussa Ndiaye kommt auf Leihbasis inklusive einer Kaufoption aus Anderlecht.',
    original: { fromClub: 'Anderlecht', toClub: 'SV Werder Bremen', isOfficial: true },
  },
  {
    label: "Italian (tuttomercatoweb) -- contract renewal + ex-club mention (headline only)",
    title: "Rinnovi in casa Milan, i rossoneri vogliono blindare l'ex Juve Rabiot",
    summary: "Rinnovi in casa Milan, i rossoneri vogliono blindare l'ex Juve Rabiot",
    original: { fromClub: 'AC Milan', toClub: null, isOfficial: false },
  },
  {
    label: 'Spanish (fichajes) -- confirmed loan, quote-bearing article',
    title: 'Bryan Zaragoza, cedido al Espanyol',
    summary:
      'Bryan Zaragoza (25 años) volverá a competir en la Liga española. Aunque su contrato con el Bayern Múnich se extiende hasta junio de 2029, el extremo actuará como cedido en el Espanyol durante el curso 2026-2027. "Estoy feliz de estar aquí; estoy exactamente donde quería estar y con ganas de afrontar un gran año en el que voy a aportar muchas cosas buenas. Como me siento en España no me siento en ningún sitio", declaró durante su presentación con el conjunto catalán. Acto seguido, el atacante aludió a su trayectoria algo decadente y dejó entrever que emigrar a la Bundesliga no fue la mejor decisión de su carrera. "Mi prioridad en este momento es jugar y ser feliz. Los últimos años han sido un poco así así, pero con suerte este año encontraremos nuestro sitio. Y… Mejor me callo la boca", aseveró.',
    original: { fromClub: 'FC Bayern München', toClub: 'RCD Espanyol de Barcelona', isOfficial: true },
  },
];

async function callModel(model, title, summary) {
  const response = await ai.models.generateContent({
    model,
    contents: `Headline: ${title}\nSummary: ${summary}`,
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
    },
  });
  if (!response.text) {
    throw new Error('LLM extraction returned no text');
  }
  return JSON.parse(response.text);
}

async function main() {
  let lastCallAt = 0;
  async function throttledCall(model, title, summary) {
    const wait = lastCallAt + MIN_CALL_INTERVAL_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastCallAt = Date.now();
    return callModel(model, title, summary);
  }

  for (const [i, testCase] of TEST_CASES.entries()) {
    console.log('\n' + '='.repeat(80));
    console.log(`TEST CASE ${i + 1}: ${testCase.label}`);
    console.log('='.repeat(80));
    console.log('INPUT TITLE:', testCase.title);
    console.log('INPUT SUMMARY:', testCase.summary);
    console.log('ORIGINAL PRODUCTION EXTRACTION (for reference):', JSON.stringify(testCase.original));

    for (const model of MODELS) {
      console.log(`\n--- ${model} ---`);
      try {
        const result = await throttledCall(model, testCase.title, testCase.summary);
        console.log(JSON.stringify(result, null, 2));
      } catch (err) {
        console.error(`[${model}] call failed:`, err.message);
      }
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('Comparison complete.');
}

main().catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exitCode = 1;
});
