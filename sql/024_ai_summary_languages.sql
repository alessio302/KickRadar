-- Follow-up to 023_ai_summary.sql: per user's call, the AI Summary should
-- show in the viewer's own app language, not a single fixed language.
-- Since a transfer row is shared across every viewer (no per-user
-- content), the only way to serve 5 languages without a live per-request
-- call is to generate and store all 5 up front -- still just ONE Gemini
-- call per article (same request that already extracts player/clubs/
-- isOfficial), just a bigger JSON response, so this costs no extra API
-- calls despite the extra columns.
--
-- Renames the single column from 023 to ai_summary_de (it already holds
-- German text, generated before this change) and adds the other 4
-- languages fresh -- existing rows keep their German summary but have
-- null for en/it/fr/es until the next time that article is re-processed
-- (which won't happen -- seen_news_items already marks it done), so old
-- rows will only show the AI Summary button for German viewers until
-- naturally replaced by newer articles.
alter table transfers rename column ai_summary to ai_summary_de;
alter table transfers add column if not exists ai_summary_en text;
alter table transfers add column if not exists ai_summary_it text;
alter table transfers add column if not exists ai_summary_fr text;
alter table transfers add column if not exists ai_summary_es text;
