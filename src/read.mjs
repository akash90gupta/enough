// Step 1 of 3: read what the five labs said and what was reported about them.
// The saved file is public, so anyone can check the editor's choices against its inputs.
import { XMLParser } from 'fast-xml-parser';
import { writeFile, mkdir } from 'node:fs/promises';
import { COMPANIES, googleNews, isOfficialUrl, editionDate } from './sources.mjs';

// Nothing stale: a day plus two hours of overlap, so overnight stories aren't lost between runs.
const NEWS_WINDOW_HOURS = 26;
const OFFICIAL_WINDOW_HOURS = 36; // some company pages publish date-only timestamps, read as noon Pacific
// Older official posts are kept as background, so a fresh article about last week's launch
// isn't mistaken for news. The editor sees them but can't cite them.
const BACKGROUND_DAYS = 10;
const MAX_SUMMARY = 280;
const UA = 'Mozilla/5.0 (compatible; EnoughBot/1.0; +https://github.com/akash90gupta/enough.ai)';

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@', textNodeName: '#text' });

const text = (v) => {
  if (v == null) return '';
  if (typeof v === 'object') return text(v['#text'] ?? v['@href'] ?? '');
  return String(v);
};

const NAMED = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ', hellip: '…', mdash: '-', ndash: '-', lsquo: "'", rsquo: "'", ldquo: '"', rdquo: '"' };
const decode = (s) => s
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&([a-z]+);/gi, (m, n) => NAMED[n.toLowerCase()] ?? m);
const ACCENTS = { acute: '\u0301', grave: '\u0300', tilde: '\u0303', circ: '\u0302', uml: '\u0308', cedil: '\u0327' };
const accents = (s) => s.replace(/&([a-z])(acute|grave|tilde|circ|uml|cedil);/gi, (_, c, a) => (c + ACCENTS[a.toLowerCase()]).normalize('NFC'));

// Feeds double-encode often, so decode, strip tags, then decode again.
const clean = (s) => decode(accents(decode(text(s).replace(/<!\[CDATA\[|\]\]>/g, ''))))
  .replace(/<[^>]+>/g, ' ')
  .replace(/[\u2014\u2013]/g, '-')
  .replace(/\s+/g, ' ')
  .trim();

const clip = (s, n) => (s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s);

// Strip tracking params so the same story from two feeds dedupes.
const canonical = (url) => {
  try {
    const u = new URL(url.trim());
    for (const k of [...u.searchParams.keys()]) if (/^(utm_|at_|cmp|ito|ns_|ref)/i.test(k)) u.searchParams.delete(k);
    u.hash = '';
    return u.toString();
  } catch { return url.trim(); }
};

async function get(url) {
  const res = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

async function readRss(url) {
  const doc = parser.parse(await get(url));
  const items = doc?.rss?.channel?.item ?? doc?.['rdf:RDF']?.item ?? doc?.feed?.entry ?? [];
  return (Array.isArray(items) ? items : [items]).map((it) => ({
    title: clean(it.title),
    link: canonical(text(it.link?.['@href'] ?? it.link ?? it.guid)),
    summary: clip(clean(it.description ?? it.summary ?? it['content:encoded'] ?? ''), MAX_SUMMARY),
    published: text(it.pubDate ?? it['dc:date'] ?? it.published ?? it.updated),
    outlet: it.source ? clean(it.source) : null,
    outletUrl: it.source?.['@url'] ?? null,
  }));
}

// Anthropic publishes no feed, so read the list on its news page: date, category, title.
async function readAnthropic(url) {
  const html = await get(url);
  const out = [];
  for (const m of html.matchAll(/<a[^>]*href="(\/news\/[a-z0-9-]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
    const parts = m[2].replace(/<[^>]+>/g, '\n').split('\n').map((x) => clean(x)).filter(Boolean);
    const date = parts.find((x) => /^[A-Z][a-z]{2,8} \d{1,2}, \d{4}$/.test(x));
    const title = [...parts].sort((a, b) => b.length - a.length)[0];
    if (!date || !title || title === date) continue;
    out.push({ title, link: `https://www.anthropic.com${m[1]}`, summary: '', published: `${date} 12:00 PDT`, outlet: null });
  }
  return out;
}

export async function readAll(now = new Date()) {
  const byLink = new Map();
  const byTitle = new Map();
  const background = [];
  const health = [];

  const take = (raw, { outlet, company, official, windowHours }) => {
    const co = COMPANIES.find((c) => c.id === company);
    const cutoff = now.getTime() - windowHours * 3600_000;
    let kept = 0;
    for (const it of raw) {
      const t = Date.parse(it.published);
      if (!it.title || !it.link || Number.isNaN(t) || t > now.getTime() + 3600_000) continue;
      if (t < cutoff) {
        if (official && t >= now.getTime() - BACKGROUND_DAYS * 86400_000) background.push({ company, title: it.title, published: new Date(t).toISOString(), link: it.link });
        continue;
      }
      const source = it.outlet ?? outlet;
      // A company's own site counts as official wherever we found it, including via Google News.
      const isOfficial = official || isOfficialUrl(co, it.outletUrl ?? '') || isOfficialUrl(co, it.link);
      // Google News titles end in " - Outlet"; the outlet is already recorded separately.
      const title = it.outlet ? it.title.replace(new RegExp(`\\s+-\\s+${it.outlet.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`), '') : it.title;
      // Same story twice: same link, or same outlet and title (Google News re-links official posts).
      const key = it.link.toLowerCase();
      const twin = `${source}|${title}`.toLowerCase();
      const prev = byLink.get(key) ?? byTitle.get(twin);
      if (prev) {
        if (!prev.about.includes(company)) prev.about.push(company);
        if (isOfficial && !prev.official) prev.official = company;
        continue;
      }
      const entry = {
        source, title, link: it.link, summary: it.outlet ? '' : it.summary,
        published: new Date(t).toISOString(), about: [company], official: isOfficial ? company : null,
      };
      byLink.set(key, entry);
      byTitle.set(twin, entry);
      kept++;
    }
    return kept;
  };

  const jobs = COMPANIES.flatMap((c) => [
    ...c.official.map((f) => async () => {
      const url = f.kind === 'google-news' ? googleNews(f.query, `${BACKGROUND_DAYS}d`) : f.url;
      const raw = f.kind === 'anthropic-html' ? await readAnthropic(url) : await readRss(url);
      return { label: `${c.name} official`, url, kept: take(raw, { outlet: f.outlet, company: c.id, official: true, windowHours: OFFICIAL_WINDOW_HOURS }) };
    }),
    async () => {
      const url = googleNews(c.query);
      return { label: `${c.name} coverage`, url, kept: take(await readRss(url), { outlet: 'Unknown outlet', company: c.id, official: false, windowHours: NEWS_WINDOW_HOURS }) };
    },
  ]);
  // Official feeds first, so a company's own post wins the dedupe over a press copy of it.
  for (const job of jobs) {
    try { health.push({ ok: true, ...(await job()) }); }
    catch (err) { health.push({ ok: false, error: String(err.message ?? err), label: job.label ?? 'feed' }); }
  }

  const items = [...byLink.values()];
  // Official posts first, then by company and time, with short ids the editor can cite.
  items.sort((a, b) => (b.official ? 1 : 0) - (a.official ? 1 : 0) || a.about[0].localeCompare(b.about[0]) || b.published.localeCompare(a.published));
  items.forEach((it, i) => { it.id = `h${i + 1}`; });
  background.sort((a, b) => b.published.localeCompare(a.published));
  const seenBg = new Set();
  const bg = background.filter((b) => { const k = `${b.company}|${b.title}`.toLowerCase(); return !seenBg.has(k) && seenBg.add(k); });
  return { read_at: now.toISOString(), items, background: bg, health };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const date = editionDate();
  const out = await readAll();
  await mkdir('data/reads', { recursive: true });
  await writeFile(`data/reads/${date}.json`, JSON.stringify(out, null, 1));
  console.log(`Read ${out.items.length} items (${out.items.filter((i) => i.official).length} official, ${out.background.length} background) from ${new Set(out.items.map((i) => i.source)).size} outlets for ${date}.`);
  for (const h of out.health) console.log(`  ${h.ok ? 'ok  ' : 'FAIL'} ${h.label ?? ''} ${h.ok ? h.kept : h.error}`);
  if (out.items.length < 40) { console.error('Too few items to write an honest edition. Stopping.'); process.exit(1); }
}
