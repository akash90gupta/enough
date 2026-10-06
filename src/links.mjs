// Google News hands out redirect links. Readers deserve the real address: the publisher's
// article or the company's own post. This resolves only the sources cited on the page,
// and keeps the original link whenever resolving fails.
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';

const isGoogleNews = (url) => /^https:\/\/news\.google\.com\/(rss\/)?articles\//.test(url);

async function resolveOne(url) {
  const id = new URL(url).pathname.split('/').pop();
  const page = await (await fetch(`https://news.google.com/articles/${id}`, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(15_000) })).text();
  const sg = page.match(/data-n-a-sg="([^"]+)"/)?.[1];
  const ts = page.match(/data-n-a-ts="([^"]+)"/)?.[1];
  if (!sg || !ts) return null;
  const inner = JSON.stringify(['garturlreq', [['X', 'X', ['X', 'X'], null, null, 1, 1, 'US:en', null, 1, null, null, null, null, null, 0, 1], 'X', 'X', 1, [1, 1, 1], 1, 1, null, 0, 0, null, 0], id, Number(ts), sg]);
  const res = await fetch('https://news.google.com/_/DotsSplashUi/data/batchexecute', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8', 'user-agent': UA },
    body: `f.req=${encodeURIComponent(JSON.stringify([[['Fbv4je', inner, null, 'generic']]]))}`,
    signal: AbortSignal.timeout(15_000),
  });
  const found = (await res.text()).match(/\\"garturlres\\",\\"(https?:[^\\"]+)\\"/)?.[1];
  return found && !isGoogleNews(found) ? found : null;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Resolve every Google News link in place on the given sources. Returns how many were resolved.

export async function resolveLinks(sources, concurrency = 2) {
  const todo = sources.filter((s) => isGoogleNews(s.link));
  let done = 0, misses = 0;
  const queue = [...todo];
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (queue.length) {
      // If Google starts refusing, stop asking: the redirect links still work.
      if (misses >= 6 && done === 0) return;
      const s = queue.shift();
      for (const delay of [0, 1500, 4000]) {
        if (delay) await wait(delay);
        try {
          const real = await resolveOne(s.link);
          if (real) { s.link = real; done++; misses = 0; break; }
        } catch { /* retry, then keep the Google News link */ }
        if (delay === 4000) misses++;
      }
      await wait(250);
    }
  }));
  return { resolved: done, attempted: todo.length };
}

// Maintenance: `node src/links.mjs [date]` re-resolves leftover Google News links in an edition
// (the latest by default). The daily job runs it every time, so a rate-limited morning heals itself.
if (import.meta.url === `file://${process.argv[1]}`) {
  const { readFile, writeFile, readdir } = await import('node:fs/promises');
  const date = process.argv[2] ?? (await readdir('data/editions')).filter((f) => f.endsWith('.json')).sort().at(-1)?.replace('.json', '');
  if (!date) process.exit(0);
  const file = `data/editions/${date}.json`;
  const edition = JSON.parse(await readFile(file, 'utf8'));
  const r = await resolveLinks(edition.companies.flatMap((c) => c.items.flatMap((i) => i.sources)));
  if (r.resolved) await writeFile(file, JSON.stringify(edition, null, 1));
  console.log(`Resolved ${r.resolved} of ${r.attempted} leftover links in ${file}.`);
}
