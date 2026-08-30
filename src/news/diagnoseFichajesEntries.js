const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const URL_TO_CHECK = 'https://www.fichajes.com/mercado-directo';

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
  let allPosts = [];
  for (const m of scriptMatches) {
    try {
      allPosts.push(...collectBlogPostings(JSON.parse(m[1])));
    } catch {
      // ignore
    }
  }

  console.log('Full JSON of first 3 posts:\n');
  console.log(JSON.stringify(allPosts.slice(0, 3), null, 2));
}

main().catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exitCode = 1;
});
