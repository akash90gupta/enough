// Step 3 of 3: turn editions into a static site. No framework, no tracking.
import { readFile, writeFile, readdir, mkdir, rm, cp } from 'node:fs/promises';
import { COMPANIES, TIME_ZONE, xSearch } from './sources.mjs';
import { MODEL } from './write.mjs';

const SITE = process.env.SITE_URL ?? 'https://akash90gupta.github.io/enough.ai';
const REPO = 'https://github.com/akash90gupta/enough.ai';
const DATA = process.env.EDITIONS_DIR ?? 'data/editions';
const OUT = 'site';
const BASE = process.env.BASE_PATH ?? new URL(SITE).pathname.replace(/\/$/, '');

const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dateObj = (d) => new Date(`${d}T12:00:00Z`);
const longDate = (d) => dateObj(d).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
const shortDate = (d) => dateObj(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const weekday = (d) => dateObj(d).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
// Weeks run Monday to Sunday and use ISO numbering, so "Week 41" means the same thing everywhere.
const isoWeek = (d) => {
  const t = dateObj(d);
  t.setUTCDate(t.getUTCDate() + 3 - ((t.getUTCDay() + 6) % 7));
  const jan4 = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  return { year: t.getUTCFullYear(), week: 1 + Math.round(((t - jan4) / 86400000 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7) };
};
const shift = (d, n) => { const t = dateObj(d); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const weekStart = (d) => shift(d, -((dateObj(d).getUTCDay() + 6) % 7));
const md = (d) => dateObj(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const weekRange = (d) => {
  const a = weekStart(d), b = shift(a, 6);
  const sameMonth = a.slice(0, 7) === b.slice(0, 7);
  return `${md(a)}–${sameMonth ? dateObj(b).getUTCDate() : md(b)}, ${b.slice(0, 4)}`;
};
const fullDate = (d) => dateObj(d).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const barDate = (d) => dateObj(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
const clock = (iso) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: TIME_ZONE });
const stamp = (iso) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: TIME_ZONE }) + ' PT';
const ext = 'target="_blank" rel="noopener"';
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const modelName = (id) => ({ 'claude-opus-5-5': 'Claude Opus 5.5' }[id] ?? id);

const outletList = (outlets) => {
  if (outlets.length <= 3) return outlets.join(', ');
  return `${outlets.slice(0, 3).join(', ')} and ${outlets.length - 3} more`;
};

function page({ title, description, body, path = '', canonical, wide = false }) {
  const url = `${SITE}/${path}`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(canonical ?? url)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:type" content="article">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${SITE}/og.png">
<meta property="og:image:width" content="1280">
<meta property="og:image:height" content="640">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${SITE}/og.png">
<meta name="theme-color" content="#f6f2ea" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#16150f" media="(prefers-color-scheme: dark)">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%232f4a3a'/%3E%3Ccircle cx='32' cy='32' r='9' fill='%23f6f2ea'/%3E%3C/svg%3E">
<link rel="alternate" type="application/rss+xml" title="Enough.ai" href="${SITE}/feed.xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,400&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="${BASE}/style.css">
</head>
<body${wide ? ' class="wide"' : ''}>
<a class="skip" href="#main">Skip to the news</a>
<header class="masthead">
  <a class="wordmark" href="${BASE}/" aria-label="Enough.ai, today">Enough<span>.ai</span></a>
  <nav><a href="${BASE}/archive/">Past days</a><a href="${BASE}/how/">How it works</a></nav>
</header>
<main id="main">
${body}
</main>
<footer class="colophon">
  <p>Enough.ai follows Anthropic, Google, Meta, OpenAI and xAI every morning so you don't have to. It is written by Claude, an AI made by Anthropic, held to the same rules for all five companies, checked by code, and has no ads, accounts or tracking.</p>
  <p><a href="${BASE}/how/">How it works</a> · <a href="${BASE}/archive/">Past days</a> · <a href="${BASE}/feed.xml">RSS</a> · <a href="${REPO}">Source</a></p>
</footer>
<script src="${BASE}/app.js" defer></script>
</body>
</html>`;
}

const STATUS = {
  official: { label: 'Official', note: (co) => `${co} announced this` },
  reported: { label: 'Reported', note: () => 'Reported by multiple outlets, no official post' },
  unconfirmed: { label: 'Unconfirmed', note: () => 'Single source or anonymous sources' },
  disputed: { label: 'Disputed', note: () => 'Sources disagree' },
};

const sourceList = (sources) => `<ul>${sources.map((x) => `<li><span class="outlet">${esc(x.source)}${x.official ? ' · official post' : ''}</span> <a href="${esc(x.link)}" ${ext}>${esc(x.title)}</a></li>`).join('')}</ul>`;

function item(s, co) {
  const company = COMPANIES.find((c) => c.id === co.id);
  const primary = s.sources[0];
  const points = s.points ?? [s.what_changed];
  const who = [...new Set(s.sources.some((x) => x.official) ? [co.name, ...s.outlets] : s.outlets)];
  return `<article class="story">
  <div class="story-meta"><span class="status status-${s.status}" title="${esc(STATUS[s.status].note(co.name))}">${STATUS[s.status].label}</span><span class="tag">${esc(s.kind)}</span>${s.continuing ? '<span class="tag">Update</span>' : ''}${s.reported_at ? `<time class="ago" datetime="${s.reported_at}">${esc(stamp(s.reported_at))}</time>` : ''}</div>
  <h3><a href="${esc(primary.link)}" ${ext}>${esc(s.headline)}</a></h3>
  <ul class="points">${points.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>
  ${s.for_you ? `<p class="matters"><span>For you</span> ${esc(s.for_you)}</p>` : ''}
  <div class="links">
    <a href="${esc(primary.link)}" ${ext}>${primary.official ? `${esc(co.name)}'s post` : esc(primary.source)} <span aria-hidden="true">↗</span></a>
    ${company ? `<a href="${esc(xSearch(company, s.x_keywords ?? ''))}" ${ext}>@${esc(company.x[0])} on X <span aria-hidden="true">↗</span></a>` : ''}
  </div>
  <details class="receipts"><summary>${plural(s.sources.length, 'source')}: ${esc(outletList(who))}</summary>${sourceList(s.sources)}</details>
</article>`;
}

function company(co, i = 0) {
  return `<section class="company card${co.items.length ? '' : ' is-quiet'}" id="${co.id}" data-co="${co.id}" aria-labelledby="h-${co.id}" aria-roledescription="card" style="--i:${i}">
  <header class="company-head">
    <h2 id="h-${co.id}"><i class="dot" aria-hidden="true"></i>${esc(co.name)}</h2>
    <span class="company-count">${co.items.length ? plural(co.items.length, 'change') : 'Quiet'}</span>
  </header>
  ${(() => { const c = COMPANIES.find((x) => x.id === co.id); return c ? `<p class="company-links"><a href="${esc(c.site.url)}" ${ext}>${esc(c.site.label)} <span aria-hidden="true">↗</span></a><a href="https://x.com/${esc(c.x[0])}" ${ext}>@${esc(c.x[0])} <span aria-hidden="true">↗</span></a></p>` : ''; })()}
  ${co.items.length ? co.items.map((s) => item(s, co)).join('') : `<p class="quiet">${esc(co.quiet_line)}</p>`}
</section>`;
}

function leftOut(e) {
  const skipped = e.left_out.reduce((n, g) => n + g.items.length, 0);
  if (!skipped) return '';
  return `<section class="left-out" aria-labelledby="lo-h">
  <details>
    <summary id="lo-h">See the ${skipped} items we left out, and why</summary>
    <p class="lo-intro">Nothing is hidden. Here is everything Enough.ai read today that didn't make the page, grouped by the reason it was left out. Most AI news is this.</p>
    ${e.left_out.map((g) => `<details class="lo-group">
      <summary><span class="lo-reason">${esc(g.reason)}</span><span class="lo-count">${g.items.length}</span></summary>
      <p class="lo-why">${esc(g.explanation)}</p>
      <ul>${g.items.map((x) => `<li><span class="outlet">${esc(x.source)}</span> <a href="${esc(x.link)}" ${ext}>${esc(x.title)}</a></li>`).join('')}</ul>
    </details>`).join('')}
  </details>
</section>`;
}

function edition(e, { isToday, prev, next, past = [] }) {
  const all = e.companies.flatMap((c) => c.items);
  const quiet = e.companies.filter((c) => !c.items.length).map((c) => c.name);
  const meta = `${plural(e.stats.reading_minutes, 'minute')} · ${plural(all.length, 'change')} at ${e.companies.length - quiet.length} of 5 companies, from ${e.stats.items_read} items across ${e.stats.outlets_read} outlets`;
  const tabs = e.companies.map((c) => `<a href="#${c.id}" data-card="${c.id}" data-co="${c.id}" class="${c.items.length ? '' : 'q'}"><i class="dot" aria-hidden="true"></i>${esc(c.name)}<b>${c.items.length || ''}</b></a>`).join('');
  const doneButton = (cls) => `<button type="button" class="done-btn ${cls}" aria-pressed="false"><span class="check" aria-hidden="true"></span><span class="label">Done</span></button>`;
  return `<div class="edition" data-date="${e.date}" data-today="${isToday ? 1 : 0}">
<div class="prose intro">
<div id="welcome" class="notice" hidden></div>
<p class="dateline"><time datetime="${e.date}">${esc(fullDate(e.date))}</time><span class="wk">Week ${isoWeek(e.date).week}</span></p>
<h1 class="the-day">${esc(e.the_day)}</h1>
<p class="meta">${esc(meta)}</p>
${e.stats.feeds_failed ? `<p class="notice">${plural(e.stats.feeds_failed, 'source')} couldn't be reached this morning, so this edition was written without them.</p>` : ''}
</div>
<div class="today-bar">
  <div class="bar-date">${isToday ? '<b>Today</b>' : ''}<time datetime="${e.date}">${esc(barDate(e.date))}</time><span class="wk">W${isoWeek(e.date).week}</span></div>
  <nav class="jump" aria-label="Jump to a company">${tabs}</nav>
  <div class="bar-actions">
    <div class="arrows" hidden><button type="button" class="arrow" data-dir="-1" aria-label="Previous company">←</button><button type="button" class="arrow" data-dir="1" aria-label="Next company">→</button></div>
    ${isToday ? doneButton('in-bar') : `<a class="today-link" href="${BASE}/">Today →</a>`}
  </div>
</div>
${isToday ? `<div class="rolled" hidden>
  <p><span class="check-dot" aria-hidden="true"></span><span>You finished today's edition. ${plural(all.length, 'change')} across ${e.companies.length - quiet.length} companies.</span></p>
  <button type="button" class="unroll">Show today's cards</button>
</div>` : ''}
<div class="board" aria-label="The five companies">
  <div class="track" tabindex="0" aria-label="Swipe or scroll sideways to see each company">
${e.companies.map((c, i) => company(c, i)).join('\n')}
  </div>
  <div class="pips" aria-hidden="true">${e.companies.map((c) => `<i data-co="${c.id}"></i>`).join('')}</div>
</div>
<div class="prose outro">
<section class="done" aria-label="End of edition">
  ${isToday ? '' : '<div class="done-mark" aria-hidden="true"></div>'}
  <h2 class="done-title">${isToday ? 'That\'s everything.' : 'You\'re caught up.'}</h2>
  <p>${all.length ? `That's everything that changed at the five labs${isToday ? ' since yesterday' : ''}.` : 'Nothing changed enough to tell you about.'} ${isToday ? `Go enjoy your ${esc(weekday(e.date))}.` : ''}</p>
  ${isToday ? `${doneButton('big')}<p class="next" aria-live="polite">The next edition arrives tomorrow morning.</p>` : ''}
</section>
${leftOut(e)}
${past.length ? `<section class="past" aria-labelledby="past-h">
  <h2 id="past-h">Earlier editions</h2>
  <p class="past-intro">Missed a day? Each one is rolled up below. Tap to open it.</p>
  ${weeks(past)}
  <p class="past-more"><a href="${BASE}/archive/">All past days →</a></p>
</section>` : ''}
<p class="provenance">Written by ${esc(modelName(e.usage?.model ?? MODEL))} at ${esc(clock(e.written_at))} Pacific, using only the items it read that morning. Claude is made by Anthropic, one of the companies covered here, so every company gets the same rules, and every item links to its sources. <a href="${BASE}/how/">How Enough.ai decides</a>.</p>
<nav class="pager">
  ${prev ? `<a href="${BASE}/${prev}/">← ${esc(shortDate(prev))}</a>` : '<span></span>'}
  ${next ? `<a href="${BASE}/${next}/">${esc(shortDate(next))} →</a>` : '<span></span>'}
</nav>
</div>
</div>`;
}

// A finished day, rolled up: one line closed, the whole digest open.
function rollup(e) {
  const active = e.companies.filter((c) => c.items.length);
  const quiet = e.companies.filter((c) => !c.items.length).map((c) => c.name);
  return `<details class="day">
  <summary>
    <span class="day-date"><b>${esc(weekday(e.date))}</b><time datetime="${e.date}">${esc(md(e.date))}</time></span>
    <span class="day-text">${esc(e.the_day)}</span>
    <span class="day-dots">${e.companies.map((c) => `<span data-co="${c.id}" class="${c.items.length ? '' : 'q'}" title="${esc(c.name)}: ${plural(c.items.length, 'change')}"><i class="dot"></i>${c.items.length || ''}</span>`).join('')}</span>
  </summary>
  <div class="day-body">
    ${active.map((c) => `<div class="day-co" data-co="${c.id}">
      <h4><i class="dot" aria-hidden="true"></i>${esc(c.name)}</h4>
      <ul>${c.items.map((s) => `<li><span class="status status-${s.status}">${STATUS[s.status].label}</span> <a href="${esc(s.sources[0].link)}" ${ext}>${esc(s.headline)}</a><span class="day-point">${esc((s.points ?? [s.what_changed])[0])}</span></li>`).join('')}</ul>
    </div>`).join('')}
    ${quiet.length ? `<p class="day-quiet">Quiet: ${esc(quiet.join(', '))}</p>` : ''}
    <a class="day-open" href="${BASE}/${e.date}/">Open the full ${esc(weekday(e.date))} edition →</a>
  </div>
</details>`;
}

// Group editions (newest first) into Monday-to-Sunday weeks.
function weeks(list) {
  const groups = [];
  for (const e of [...list].sort((a, b) => b.date.localeCompare(a.date))) {
    const k = weekStart(e.date);
    if (groups.at(-1)?.k !== k) groups.push({ k, items: [] });
    groups.at(-1).items.push(e);
  }
  return groups.map((g) => `<section class="week-group">
  <h3>Week ${isoWeek(g.k).week}<span>${esc(weekRange(g.k))}</span></h3>
  ${g.items.map(rollup).join('')}
</section>`).join('');
}

function archive(editions) {
  return `<h1 class="page-title">Past days</h1>
<p class="lede">Every edition Enough.ai has published, grouped by week. Tap a day to open its digest.</p>
<div class="past">${editions.length ? weeks(editions) : '<p>The first edition arrives tomorrow morning.</p>'}</div>`;
}

async function how() {
  const prompt = await readFile('prompts/editor.md', 'utf8');
  return `<h1 class="page-title">How Enough.ai works</h1>
<p class="lede">AI news never stops: leaks, teases, benchmark wars, hot takes. Enough.ai is one page a day that tells you what actually changed at the five companies shaping AI, then lets you go.</p>

<h2>Every morning</h2>
<ol class="steps">
  <li><strong>Read.</strong> At 5am Pacific, a script collects each company's own announcements (OpenAI's news feed, Google's AI, Gemini and DeepMind blogs, Meta's newsroom, Anthropic's news page) and press coverage of all five from the last day. Usually that's 300 to 400 items from more than 200 outlets. Anything older than a day is ignored.</li>
  <li><strong>Decide.</strong> ${esc(modelName(MODEL))} reads all of them and keeps only what changed: something shipped, was announced, was priced, was ruled on or became official. Most companies, most days, have nothing or one thing.</li>
  <li><strong>Check.</strong> Code, not the AI, verifies every item. Each one must cite real items from that morning's read. "Official" requires the company's own post. "Reported" requires at least two outlets, or it becomes "Unconfirmed". Every item that didn't make it is shown under "left out", with the reason.</li>
  <li><strong>Publish.</strong> The page rebuilds itself, and the edition is saved permanently in the <a href="${REPO}/tree/main/data">public record</a>, along with everything it was written from.</li>
</ol>

<h2>Official, reported, unconfirmed</h2>
<ul class="promises">
  <li><span class="status status-official">Official</span> The company announced it, and its own post is linked.</li>
  <li><span class="status status-reported">Reported</span> Several independent outlets report it, but the company hasn't posted about it.</li>
  <li><span class="status status-unconfirmed">Unconfirmed</span> One outlet, or anonymous sources. Included only when it would matter a lot if true.</li>
  <li><span class="status status-disputed">Disputed</span> Sources or the companies disagree, and the item says who claims what.</li>
</ul>

<h2>A conflict of interest, stated plainly</h2>
<p>Enough.ai is written by Claude, which is made by Anthropic, one of the five companies it covers. That's a real conflict, so here is how it's handled. The editor's brief tells it to hold every company to the same bar, and to be stricter, not softer, about Anthropic. Status labels are enforced by code, not by the model's judgment. And everything it read, including every item it left out, is one tap away, so you can check whether any company got a pass.</p>

<h2>The promises</h2>
<ul class="promises">
  <li><strong>It ends.</strong> At most five items per company, usually one or two. Quiet companies get one calm line. No infinite scroll.</li>
  <li><strong>Only today.</strong> Every item needs a source from the last day. Code drops anything stale or already covered yesterday, and each item shows how long ago it was reported.</li>
  <li><strong>Straight to the source.</strong> Every headline links to the company's own post when there is one, or the best outlet otherwise. Each item also links to the company's own posts on X about it.</li>
  <li><strong>Nothing is hidden.</strong> You can see every item we read and why each one was left out.</li>
  <li><strong>No invented facts.</strong> The AI may only use what its sources said, and company claims stay labeled as company claims.</li>
  <li><strong>No hype.</strong> No "game-changer", no "AGI is here", no breathless headlines.</li>
  <li><strong>Nothing to sell.</strong> No ads, no accounts, no cookies, no tracking. The only thing stored is the date of your last visit, in your own browser, so Enough.ai can show you what you missed.</li>
</ul>

<h2>What it can get wrong</h2>
<p>Enough.ai is only as good as what it reads. xAI's site blocks automated readers, so its own posts are found through Google News, which can lag. Enough.ai can't read X directly, so the X links open a live search of each company's posts rather than a specific post. An AI can misjudge what matters or compress too far. That's why every item shows its receipts. If something looks off, the original is one tap away, and you can <a href="${REPO}/issues">tell us</a>.</p>

<h2>The editor's instructions</h2>
<p>This is the exact brief the AI receives every morning. Nothing else shapes its choices.</p>
<details class="prompt"><summary>Read the full brief</summary><pre>${esc(prompt)}</pre></details>`;
}

function feed(editions) {
  const items = [...editions].reverse().slice(0, 30).map((e) => {
    const html = `<p><strong>${esc(e.the_day)}</strong></p>` + e.companies.map((c) => `<h2>${esc(c.name)}</h2>` + (c.items.length ? c.items.map((s) => `<h3>${esc(s.headline)}</h3><p><small>${esc(STATUS[s.status].label)} · ${esc(s.kind)}</small></p><ul>${(s.points ?? [s.what_changed]).map((p) => `<li>${esc(p)}</li>`).join('')}</ul><p><a href="${esc(s.sources[0].link)}">Source: ${esc(s.sources[0].source)}</a></p>${s.for_you ? `<p><em>For you:</em> ${esc(s.for_you)}</p>` : ''}`).join('') : `<p>${esc(c.quiet_line)}</p>`)).join('') + `<p>You're caught up.</p>`;
    return `<item><title>${esc(longDate(e.date))}: ${esc(e.the_day)}</title><link>${SITE}/${e.date}/</link><guid isPermaLink="true">${SITE}/${e.date}/</guid><pubDate>${new Date(e.written_at).toUTCString()}</pubDate><description>${esc(html)}</description></item>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Enough.ai</title><link>${SITE}/</link><description>AI news, finished. What changed at Anthropic, Google, Meta, OpenAI and xAI, one calm page a day.</description><language>en-us</language>${items}</channel></rss>`;
}

async function write(path, html) {
  await mkdir(`${OUT}/${path}`, { recursive: true });
  await writeFile(`${OUT}/${path}${path ? '/' : ''}index.html`, html);
}

const files = (await readdir(DATA).catch(() => [])).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
const editions = await Promise.all(files.map(async (f) => JSON.parse(await readFile(`${DATA}/${f}`, 'utf8'))));

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });
await cp('public', OUT, { recursive: true });

const desc = 'AI news, finished. One calm page a day that tells you what actually changed at Anthropic, Google, Meta, OpenAI and xAI, shows its sources, and ends.';
// The home page rolls up the two weeks before today; the archive has everything.
const PAST_ON_HOME = 14;

for (const [i, e] of editions.entries()) {
  const prev = editions[i - 1]?.date, next = editions[i + 1]?.date;
  const latest = i === editions.length - 1;
  const title = `Enough.ai · ${longDate(e.date)}`;
  await write(e.date, page({ title, description: e.the_day, path: `${e.date}/`, wide: true, body: edition(e, { isToday: false, prev, next }) }));
  if (latest) await write('', page({ title: 'Enough.ai · AI news, finished', description: desc, path: '', wide: true, body: edition(e, { isToday: true, prev, next: null, past: editions.slice(Math.max(0, i - PAST_ON_HOME), i) }) }));
}
if (!editions.length) {
  await write('', page({ title: 'Enough.ai · AI news, finished', description: desc, body: `<h1 class="the-day">The first edition arrives tomorrow morning.</h1><p class="meta">One calm page a day that ends. <a href="${BASE}/how/">How it works</a>.</p>` }));
}
await write('archive', page({ title: 'Enough.ai · Past days', description: 'Every edition of Enough.ai, grouped by week.', path: 'archive/', wide: true, body: archive(editions) }));
await write('how', page({ title: 'Enough.ai · How it works', description: 'How Enough.ai reads, decides, checks and publishes what changed at five AI companies, every morning.', path: 'how/', body: await how() }));
await writeFile(`${OUT}/feed.xml`, feed(editions));
await writeFile(`${OUT}/editions.json`, JSON.stringify(editions.map((e) => e.date)));
await writeFile(`${OUT}/.nojekyll`, '');
console.log(`Built ${editions.length} edition(s) into ${OUT}/`);
