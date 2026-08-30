const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const URL_TO_CHECK = 'https://www.fichajes.com/mercado-directo';

// Handles both shapes seen so far: Sky Sports emits one <script> per
// JSON-LD document, one of which is directly a LiveBlogPosting object;
// fichajes.com emits a single <script> containing an ARRAY of several
// JSON-LD documents (BreadcrumbList, LiveBlogPosting, ...) together.
function collectBlogPostings(parsed) {
  const roots = Array.isArray(parsed) ? parsed : [parsed];
  const posts = [];
  for (const root of roots) {
    if (root?.['@type'] === 'BlogPosting') posts.push(root);
    else if (root?.['@type'] === 'LiveBlogPosting' && Array.isArray(root.liveBlogUpdate)) {
      posts.push(...root.liveBlogUpdate.filter((p) => p?.['@type'] === 'BlogPosting'));
    }
  }
  return posts;
}

async function main() {
  const res = await fetch(URL_TO_CHECK, { headers: { 'User-Agent': UA } });
  const html = await res.text();

  const scriptMatches = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  console.log('Number of ld+json scripts:', scriptMatches.length);

  let allPosts = [];
  for (const m of scriptMatches) {
    try {
      const parsed = JSON.parse(m[1]);
      allPosts.push(...collectBlogPostings(parsed));
    } catch (err) {
      console.log('parse failed:', err.message);
    }
  }
  console.log('Total BlogPosting entries found:', allPosts.length);

  for (const post of allPosts.slice(0, 12)) {
    console.log('\n---');
    console.log('headline:', post.headline);
    console.log('url:', post.url);
    console.log('datePublished:', post.datePublished);
    console.log('articleBody (first 250 chars):', (post.articleBody || '').slice(0, 250));
  }

  // Print the raw keys of the LiveBlogPosting root itself (coverageStartTime,
  // etc.) for context, and the field names present on one update entry.
  for (const m of scriptMatches) {
    try {
      const parsed = JSON.parse(m[1]);
      const roots = Array.isArray(parsed) ? parsed : [parsed];
      const liveBlog = roots.find((r) => r?.['@type'] === 'LiveBlogPosting');
      if (liveBlog) {
        console.log('\nLiveBlogPosting root keys:', Object.keys(liveBlog));
        console.log('coverageStartTime:', liveBlog.coverageStartTime);
        console.log('coverageEndTime:', liveBlog.coverageEndTime);
        if (liveBlog.liveBlogUpdate?.[0]) {
          console.log('One update entry keys:', Object.keys(liveBlog.liveBlogUpdate[0]));
        }
      }
    } catch {
      // ignore
    }
  }
}

main().catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exitCode = 1;
});
