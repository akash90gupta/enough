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

// Resolve every Google News link in place on the given sources. Returns how many were resolved.
export async function resolveLinks(sources, concurrency = 4) {
  const todo = sources.filter((s) => isGoogleNews(s.link));
  let done = 0;
  const queue = [...todo];
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (queue.length) {
      const s = queue.shift();
      try {
        const real = await resolveOne(s.link);
        if (real) { s.link = real; done++; }
      } catch { /* keep the Google News link; it still reaches the article */ }
    }
  }));
  return { resolved: done, attempted: todo.length };
}
