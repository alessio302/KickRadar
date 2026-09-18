import { getSupabaseClient } from '../db/supabaseClient.js';

const supabase = getSupabaseClient();
const { data, error } = await supabase
  .from('news_articles')
  .select('source, title, image_url, published_at')
  .eq('source', 'bbc-football')
  .order('published_at', { ascending: false })
  .limit(3);
if (error) throw error;
console.log(JSON.stringify(data, null, 2));
