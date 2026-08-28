-- Short Gemini-generated summary of the actual article content (2-3
-- sentences, in German regardless of the source article's language),
-- shown in a bottom-sheet overlay when the user taps the new "AI Summary"
-- button on a transfer card. Distinct from the existing `summary` column,
-- which is just the source's own short blurb/headline used as a fallback
-- display title when there's no player_name -- this is a real generated
-- summary meant to be read on its own. Nullable: only produced by the LLM
-- extraction path (see llmExtract.js), never the regex fallback.
alter table transfers add column if not exists ai_summary text;
