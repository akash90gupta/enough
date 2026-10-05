// The five labs Enough follows, in the order they appear on the page.
// Each has its own words (official posts) and other people's words (press coverage).
// Keeping the two apart is what lets the page say "OpenAI announced" versus "reported".
export const COMPANIES = [
  {
    id: 'anthropic', name: 'Anthropic',
    site: { label: 'anthropic.com/news', url: 'https://www.anthropic.com/news' },
    x: ['AnthropicAI', 'claudeai'],
    domains: ['anthropic.com', 'claude.com', 'claude.ai'],
    official: [{ kind: 'anthropic-html', url: 'https://www.anthropic.com/news', outlet: 'Anthropic' }],
    query: 'Anthropic OR "Claude AI" OR "Claude Opus" OR "Claude Sonnet" OR "Claude Code"',
  },
  {
    id: 'google', name: 'Google',
    site: { label: 'blog.google/technology/ai', url: 'https://blog.google/technology/ai/' },
    x: ['Google', 'GoogleDeepMind', 'GeminiApp'],
    domains: ['blog.google', 'deepmind.google', 'developers.googleblog.com', 'research.google'],
    official: [
      { kind: 'rss', url: 'https://blog.google/technology/ai/rss/', outlet: 'Google' },
      { kind: 'rss', url: 'https://blog.google/products/gemini/rss/', outlet: 'Google' },
      { kind: 'rss', url: 'https://deepmind.google/blog/rss.xml', outlet: 'Google DeepMind' },
    ],
    query: 'Gemini AI OR "Google DeepMind" OR "Google AI" OR "Sundar Pichai" AI',
  },
  {
    id: 'meta', name: 'Meta',
    site: { label: 'about.fb.com/news', url: 'https://about.fb.com/news/' },
    x: ['AIatMeta', 'Meta'],
    domains: ['about.fb.com', 'ai.meta.com', 'engineering.fb.com'],
    official: [{ kind: 'rss', url: 'https://about.fb.com/news/feed/', outlet: 'Meta' }],
    query: '"Meta AI" OR "Meta Superintelligence" OR Llama Meta OR Zuckerberg AI',
  },
  {
    id: 'openai', name: 'OpenAI',
    site: { label: 'openai.com/news', url: 'https://openai.com/news/' },
    x: ['OpenAI', 'ChatGPTapp'],
    domains: ['openai.com'],
    official: [{ kind: 'rss', url: 'https://openai.com/news/rss.xml', outlet: 'OpenAI' }],
    query: 'OpenAI OR ChatGPT OR "Sam Altman"',
  },
  {
    id: 'xai', name: 'xAI',
    site: { label: 'x.ai/news', url: 'https://x.ai/news' },
    x: ['xai', 'grok'],
    domains: ['x.ai'],
    // x.ai blocks automated readers, so its own pages are found through Google News instead.
    official: [{ kind: 'google-news', query: 'site:x.ai', outlet: 'xAI' }],
    query: 'xAI OR Grok OR "Elon Musk" AI',
  },
];

// Only the last day: Enough reports what changed since yesterday's edition, nothing older.
export const googleNews = (q, window = '1d') =>
  `https://news.google.com/rss/search?q=${encodeURIComponent(`${q} when:${window}`)}&hl=en-US&gl=US&ceid=US:en`;

// A live search of the company's own posts on X about one topic.
export const xSearch = (company, keywords) => {
  const from = company.x.map((h) => `from:${h}`).join(' OR ');
  const q = company.x.length > 1 ? `(${from}) ${keywords}` : `${from} ${keywords}`;
  return `https://x.com/search?q=${encodeURIComponent(q.trim())}&f=live`;
};

export const isOfficialUrl = (company, url) => {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return company.domains.some((d) => host === d || host.endsWith(`.${d}`));
  } catch { return false; }
};

// The edition belongs to the reader's morning, so dates are Pacific.
export const TIME_ZONE = 'America/Los_Angeles';

export function editionDate(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
