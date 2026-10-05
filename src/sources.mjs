// The five labs Enough follows, in the order they appear on the page.
// Each has its own words (official posts) and other people's words (press coverage).
// Keeping the two apart is what lets the page say "OpenAI announced" versus "reported".
export const COMPANIES = [
  {
    id: 'anthropic', name: 'Anthropic',
    official: [{ kind: 'anthropic-html', url: 'https://www.anthropic.com/news', outlet: 'Anthropic' }],
    query: 'Anthropic OR "Claude AI" OR "Claude Opus" OR "Claude Sonnet" OR "Claude Code"',
  },
  {
    id: 'google', name: 'Google',
    official: [
      { kind: 'rss', url: 'https://blog.google/technology/ai/rss/', outlet: 'Google' },
      { kind: 'rss', url: 'https://blog.google/products/gemini/rss/', outlet: 'Google' },
      { kind: 'rss', url: 'https://deepmind.google/blog/rss.xml', outlet: 'Google DeepMind' },
    ],
    query: 'Gemini AI OR "Google DeepMind" OR "Google AI" OR "Sundar Pichai" AI',
  },
  {
    id: 'meta', name: 'Meta',
    official: [{ kind: 'rss', url: 'https://about.fb.com/news/feed/', outlet: 'Meta' }],
    query: '"Meta AI" OR "Meta Superintelligence" OR Llama Meta OR Zuckerberg AI',
  },
  {
    id: 'openai', name: 'OpenAI',
    official: [{ kind: 'rss', url: 'https://openai.com/news/rss.xml', outlet: 'OpenAI' }],
    query: 'OpenAI OR ChatGPT OR "Sam Altman"',
  },
  {
    id: 'xai', name: 'xAI',
    // x.ai blocks automated readers, so xAI is covered through reporting only, and the page says so.
    official: [],
    query: 'xAI OR Grok OR "Elon Musk" AI',
  },
];

export const googleNews = (q) =>
  `https://news.google.com/rss/search?q=${encodeURIComponent(`${q} when:2d`)}&hl=en-US&gl=US&ceid=US:en`;

// The edition belongs to the reader's morning, so dates are Pacific.
export const TIME_ZONE = 'America/Los_Angeles';

export function editionDate(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
