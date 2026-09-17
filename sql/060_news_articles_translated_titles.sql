-- Confirmed live user feedback: the headline was always shown in the
-- source's own language (Italian for Gazzetta, English for BBC, ...)
-- regardless of the viewer's app language, while the AI summary right
-- below it was already translated -- reading a translated summary under
-- an untranslated headline read as inconsistent. Adds one translated
-- headline per app language, generated in the SAME Gemini call as the
-- summary (llmSummarizeNews.js) -- no extra API requests, still within
-- the free-tier daily cap. `title` (the original-language headline) stays
-- as-is: still needed for dedupeNews.js's cross-source duplicate
-- detection, which compares same-language headlines from a single run.
alter table news_articles
  add column if not exists title_de text,
  add column if not exists title_en text,
  add column if not exists title_it text,
  add column if not exists title_fr text,
  add column if not exists title_es text;
