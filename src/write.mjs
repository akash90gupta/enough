// Step 2 of 3: Claude reads everything and writes the edition.
// The model proposes; this file checks. Every cited id must exist, "official" requires
// the company's own post, outlet counts are computed here (never trusted from the model),
// and every item we read is accounted for, either on the page or in a "left out" group.
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { COMPANIES, editionDate } from './sources.mjs';
import { resolveLinks } from './links.mjs';

export const MODEL = 'claude-opus-5-5';
const MAX_PER_COMPANY = 5;
const FRESH_HOURS = 26; // an item needs at least one source from the last day, or it's stale

export const KINDS = ['Launch', 'Research', 'Policy', 'Business', 'Legal', 'People', 'Safety'];
export const STATUSES = ['official', 'reported', 'unconfirmed', 'disputed'];
export const REASONS = [
  'Hype and speculation', 'Opinion and analysis', 'Single-source rumors', 'Repeats and syndication',
  'Stock and valuation chatter', 'Not really about the company', 'Older news', 'Other',
];
const IDS = COMPANIES.map((c) => c.id);

const ITEM = {
  type: 'object',
  additionalProperties: false,
  required: ['headline', 'points', 'for_you', 'kind', 'status', 'continuing', 'x_keywords', 'sources'],
  properties: {
    headline: { type: 'string' },
    points: { type: 'array', items: { type: 'string' } },
    x_keywords: { type: 'string' },
    for_you: { type: 'string' },
    kind: { type: 'string', enum: KINDS },
    status: { type: 'string', enum: STATUSES },
    continuing: { type: 'boolean' },
    sources: { type: 'array', items: { type: 'string' } },
  },
};

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['the_day', 'companies', 'left_out'],
  properties: {
    the_day: { type: 'string' },
    companies: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['company', 'items', 'quiet_line'],
        properties: {
          company: { type: 'string', enum: IDS },
          items: { type: 'array', items: ITEM },
          quiet_line: { type: 'string' },
        },
      },
    },
    left_out: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['reason', 'explanation', 'ids'],
        properties: {
          reason: { type: 'string', enum: REASONS },
          explanation: { type: 'string' },
          ids: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
};

const Draft = z.object({
  the_day: z.string(),
  companies: z.array(z.object({
    company: z.enum(IDS),
    items: z.array(z.object({
      headline: z.string().min(1),
      points: z.array(z.string().min(1)).min(1),
      x_keywords: z.string(),
      for_you: z.string(),
      kind: z.enum(KINDS),
      status: z.enum(STATUSES),
      continuing: z.boolean(),
      sources: z.array(z.string()),
    })),
    quiet_line: z.string(),
  })),
  left_out: z.array(z.object({ reason: z.enum(REASONS), explanation: z.string(), ids: z.array(z.string()) })),
});

// House style: no em dashes. Number ranges like 2024–25 keep their en dash.
const noDashes = (s) => s.replace(/\s*—\s*|\s+–\s+/g, ', ').replace(/,\s*,/g, ',');

async function previousEdition(date) {
  const files = (await readdir('data/editions').catch(() => [])).filter((f) => f.endsWith('.json') && f < `${date}.json`).sort();
  if (!files.length) return null;
  return JSON.parse(await readFile(`data/editions/${files.at(-1)}`, 'utf8'));
}

function buildPrompt(read, prev) {
  const name = Object.fromEntries(COMPANIES.map((c) => [c.id, c.name]));
  const now = Date.parse(read.read_at);
  const age = (iso) => { const h = Math.max(0, Math.round((now - Date.parse(iso)) / 3600_000)); return h < 1 ? 'under 1h ago' : `${h}h ago`; };
  const lines = read.items.map((it) => [
    it.id,
    age(it.published),
    it.official ? `OFFICIAL ${name[it.official]} post` : 'press',
    `about: ${it.about.map((a) => name[a]).join(', ')}`,
    it.source,
    it.title + (it.summary ? ` | ${it.summary}` : ''),
  ].join(' | '));
  const yesterday = prev
    ? prev.companies.flatMap((c) => c.items.map((s) => `- ${c.name}: ${s.headline}. ${(s.points ?? [s.what_changed]).join(' ')}`)).join('\n') || '(nothing changed yesterday)'
    : '(no previous edition)';
  const days = (iso) => Math.max(1, Math.round((now - Date.parse(iso)) / 86400_000));
  const earlier = (read.background ?? []).map((b) => `- ${name[b.company]}, ${days(b.published)}d ago: ${b.title}`).join('\n') || '(none)';
  const rumors = (prev?.left_out ?? []).find((g) => g.reason === 'Single-source rumors')?.items.map((x) => `- ${x.source}: ${x.title}`).join('\n') || '(none)';
  return `Yesterday's edition (${prev?.date ?? 'none'}):\n${yesterday}\n\n` +
    `Set aside yesterday as single-source rumors (include one today only if a genuinely new fact or a second independent source appears):\n${rumors}\n\n` +
    `Already announced by the companies in the past 10 days (background only: these are not new today and cannot be cited; ` +
    `fresh coverage of any of them is older news unless it reports a genuinely new development):\n${earlier}\n\n` +
    `Today's items, ${read.items.length} in all, format "id | age | official or press | companies | outlet | title | summary":\n${lines.join('\n')}`;
}

// Two ways to reach Claude, same editor and same checks:
// an API key (pay per use), or a Claude Pro/Max subscription through Claude Code (no extra cost).
async function viaApi(system, user) {
  const client = new Anthropic();
  const request = {
    model: MODEL,
    max_tokens: 64000,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'high', format: { type: 'json_schema', schema: SCHEMA } },
    system,
    messages: [{ role: 'user', content: user }],
  };
  // News includes violence and conflict, so a safety classifier can occasionally decline.
  // Server-side fallback reroutes those to another model instead of skipping a day.
  let msg;
  try {
    msg = await client.beta.messages.stream({ ...request, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' }).finalMessage();
  } catch (err) {
    if (!(err instanceof Anthropic.BadRequestError && /fallback/i.test(err.message))) throw err;
    console.warn('Fallback option unavailable, writing without it.');
    msg = await client.messages.stream(request).finalMessage();
  }
  if (msg.stop_reason === 'refusal') throw new Error(`Model declined: ${JSON.stringify(msg.stop_details)}`);
  if (msg.stop_reason === 'max_tokens') throw new Error('Edition was cut off before it finished.');
  const textBlock = msg.content.find((b) => b.type === 'text');
  if (!textBlock) throw new Error('No edition text returned.');
  return { raw: JSON.parse(textBlock.text), usage: { model: msg.model, via: 'api', input_tokens: msg.usage.input_tokens, output_tokens: msg.usage.output_tokens } };
}

// Claude Code in print mode: no tools, no settings, no memory, just the brief, the items and the schema.
function viaClaudeCode(system, user) {
  const args = [
    '-p', '--model', MODEL, '--effort', 'high',
    '--tools', '', '--setting-sources', '', '--strict-mcp-config', '--disable-slash-commands', '--no-session-persistence',
    '--system-prompt', system,
    '--output-format', 'json', '--json-schema', JSON.stringify(SCHEMA),
  ];
  return new Promise((resolve, reject) => {
    // An empty API key variable would make Claude Code look for API billing; leave it out entirely.
    const env = { ...process.env };
    if (!env.ANTHROPIC_API_KEY) delete env.ANTHROPIC_API_KEY;
    const child = spawn('claude', args, { stdio: ['pipe', 'pipe', 'inherit'], env });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.on('error', reject);
    child.on('close', (code) => {
      try {
        const r = JSON.parse(out);
        if (code !== 0 || r.is_error) throw new Error(`Claude Code failed (${r.subtype ?? code}): ${String(r.result ?? '').slice(0, 300)}`);
        const raw = r.structured_output ?? JSON.parse(r.result);
        const [model, use] = Object.entries(r.modelUsage ?? {})[0] ?? [MODEL, {}];
        resolve({ raw, usage: { model, via: 'claude-code', input_tokens: (use.inputTokens ?? 0) + (use.cacheReadInputTokens ?? 0) + (use.cacheCreationInputTokens ?? 0), output_tokens: use.outputTokens ?? 0 } });
      } catch (err) { reject(code !== 0 && !out ? new Error(`Claude Code exited with ${code}`) : err); }
    });
    child.stdin.end(user);
  });
}

export async function writeEdition(date, read, prev) {
  const system = await readFile('prompts/editor.md', 'utf8');
  const user = buildPrompt(read, prev);
  let result;
  if (process.env.ANTHROPIC_API_KEY) result = await viaApi(system, user);
  else if (process.env.CLAUDE_CODE_OAUTH_TOKEN || process.env.ENOUGH_WRITER === 'claude-code') result = await viaClaudeCode(system, user);
  else throw new Error('Set ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN to write an edition.');

  const draft = Draft.parse(result.raw);
  const edition = verify(draft, read, date, prev);
  // Point every cited source at the real article or the company's own post.
  const links = await resolveLinks(edition.companies.flatMap((c) => c.items.flatMap((i) => i.sources)));
  edition.checks.push(`Resolved ${links.resolved} of ${links.attempted} Google News links to their original sites.`);
  return { ...edition, usage: result.usage };
}

// Turn the model's draft into a published edition, keeping only what checks out.
export function verify(draft, read, date, prev) {
  const byId = new Map(read.items.map((it) => [it.id, it]));
  const used = new Set();
  const notes = [];
  const drafted = new Map(draft.companies.map((c) => [c.company, c]));
  const freshAfter = Date.parse(read.read_at) - FRESH_HOURS * 3600_000;
  // Sources already used yesterday, matched by outlet and title (links can differ between runs).
  const seenYesterday = new Set((prev?.companies ?? []).flatMap((c) => c.items.flatMap((i) => i.sources.map((x) => `${x.source}|${x.title}`.toLowerCase()))));

  const companies = COMPANIES.map((co) => {
    const d = drafted.get(co.id) ?? { items: [], quiet_line: '' };
    const items = [];
    for (const s of d.items) {
      const ids = [...new Set(s.sources)].filter((id) => byId.has(id) && !used.has(id));
      if (ids.length < s.sources.length) notes.push(`${co.name}: removed ${s.sources.length - ids.length} unknown or reused citation(s) from "${s.headline}".`);
      if (!ids.length) { notes.push(`${co.name}: dropped "${s.headline}", no valid sources.`); continue; }
      const cited = ids.map((id) => byId.get(id));
      const newest = Math.max(...cited.map((x) => Date.parse(x.published)));
      if (newest < freshAfter) { notes.push(`${co.name}: dropped "${s.headline}", stale (newest source over ${FRESH_HOURS}h old).`); continue; }
      if (cited.every((x) => seenYesterday.has(`${x.source}|${x.title}`.toLowerCase()))) { notes.push(`${co.name}: dropped "${s.headline}", every source was already in yesterday's edition.`); continue; }
      if (items.length >= MAX_PER_COMPANY) { notes.push(`${co.name}: trimmed "${s.headline}", over ${MAX_PER_COMPANY} items.`); continue; }
      ids.forEach((id) => used.add(id));
      const sources = ids.map((id) => byId.get(id)).sort((a, b) => (b.official === co.id) - (a.official === co.id));
      const hasOfficial = sources.some((x) => x.official === co.id);
      const own = new Set([co.name, ...co.official.map((f) => f.outlet)].map((x) => x.toLowerCase()));
      const outlets = [...new Set(sources.filter((x) => x.official !== co.id && !own.has(x.source.toLowerCase())).map((x) => x.source))];
      let status = s.status;
      if (status === 'official' && !hasOfficial) { status = outlets.length > 1 ? 'reported' : 'unconfirmed'; notes.push(`${co.name}: "${s.headline}" has no official post, marked ${status}.`); }
      if (status === 'reported' && outlets.length < 2) { status = 'unconfirmed'; notes.push(`${co.name}: "${s.headline}" has one outlet, marked unconfirmed.`); }
      items.push({
        headline: noDashes(s.headline),
        points: s.points.slice(0, 3).map(noDashes),
        reported_at: new Date(newest).toISOString(),
        // X search ANDs every word, so more than three words usually finds nothing.
        x_keywords: s.x_keywords.replace(/[^\p{L}\p{N} .\-]/gu, ' ').trim().split(/\s+/).slice(0, 3).join(' '),
        for_you: noDashes(s.for_you),
        kind: s.kind,
        status,
        continuing: s.continuing,
        outlets,
        sources: sources.map(({ source, title, link, official, published }) => ({ source, title, link, published, official: official === co.id })),
      });
    }
    return {
      id: co.id,
      name: co.name,
      items,
      quiet_line: noDashes(d.quiet_line || `Nothing new from ${co.name} today.`),
      coverage_only: co.official.length === 0,
    };
  });

  const groups = new Map();
  for (const g of draft.left_out) {
    const ids = g.ids.filter((id) => byId.has(id) && !used.has(id));
    ids.forEach((id) => used.add(id));
    if (!ids.length) continue;
    const cur = groups.get(g.reason) ?? { reason: g.reason, explanation: noDashes(g.explanation), ids: [] };
    cur.ids.push(...ids);
    groups.set(g.reason, cur);
  }
  // Anything the editor didn't sort is still shown, so "we read N" is always true.
  const unsorted = read.items.filter((it) => !used.has(it.id)).map((it) => it.id);
  if (unsorted.length) {
    const other = groups.get('Other') ?? { reason: 'Other', explanation: 'Items the editor didn\u2019t place in a group.', ids: [] };
    other.ids.push(...unsorted);
    groups.set('Other', other);
  }
  const left_out = [...groups.values()]
    .map((g) => ({ reason: g.reason, explanation: g.explanation, items: g.ids.map((id) => { const { source, title, link } = byId.get(id); return { source, title, link }; }) }))
    .sort((a, b) => b.items.length - a.items.length);

  const all = companies.flatMap((c) => c.items);
  const words = [draft.the_day, ...all.flatMap((s) => [s.headline, ...s.points, s.for_you])].join(' ').split(/\s+/).length;

  return {
    date,
    written_at: new Date().toISOString(),
    the_day: noDashes(draft.the_day),
    companies,
    left_out,
    stats: {
      items_read: read.items.length,
      official_posts: read.items.filter((i) => i.official).length,
      outlets_read: new Set(read.items.map((i) => i.source)).size,
      feeds_failed: read.health.filter((h) => !h.ok).length,
      reading_minutes: Math.max(1, Math.round(words / 200)),
    },
    previous: prev?.date ?? null,
    checks: notes,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const date = process.argv[2] ?? editionDate();
  const read = JSON.parse(await readFile(`data/reads/${date}.json`, 'utf8'));
  const prev = await previousEdition(date);
  const edition = await writeEdition(date, read, prev);
  await mkdir('data/editions', { recursive: true });
  await writeFile(`data/editions/${date}.json`, JSON.stringify(edition, null, 1));
  console.log(`Wrote ${date}: ${edition.companies.map((c) => `${c.name} ${c.items.length}`).join(', ')} from ${edition.stats.items_read} items.`);
  for (const n of edition.checks) console.log(`  check: ${n}`);
}
