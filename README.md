# Enough.

**AI news, finished.** One calm page every morning that tells you what actually changed at Anthropic, Google, Meta, OpenAI and xAI, shows where every fact came from, and then ends.

**▶ Read today's edition: [akash90gupta.github.io/enough](https://akash90gupta.github.io/enough/)**

> Written each morning by Claude from 300 to 400 items: the companies' own announcements plus coverage from 200+ outlets. No ads, no accounts, no tracking. It updates itself every day, and every edition is kept in this repo.

---

## Goal

I wanted to keep up with the five companies shaping AI without drowning in AI news. Specifically, a daily habit that:

- **Ends.** One page, about four minutes, with a clear "you're caught up".
- **Only tells me what changed.** What shipped, what got priced, what was ruled on. Not what someone predicts, teases or thinks.
- **Separates what a company said from what was reported about it.** "OpenAI announced" and "sources say OpenAI is working on" are very different sentences.
- **Shows its work.** If an AI decides what I read, I want to see what it read, what it left out, and why.

## Problem

AI news is the loudest beat in tech. On a typical day, about 350 items mention these five companies. Most of them are:

- **Repeats.** One interview quote becomes 25 articles. One Information scoop gets rewritten by 15 sites.
- **Speculation.** IPO valuations, release-date guesses, "AGI by" predictions, an AI chatbot's Bitcoin price forecast.
- **Hype in the headline.** "Game-changer", "drops", "stunning", "the end of".
- **Blurred sourcing.** A company announcement, a single anonymous leak, and a blogger's guess all look the same in a feed.

Meanwhile the few things that actually changed (a price change on Thursday, a new ad format, a court ruling) get buried. People who use these products, or build on them, end up either overwhelmed or uninformed.

## Approach

Three ideas shaped the product.

**1. The AI's job is judgment, not summarizing.** Summarizing 350 items is easy. Deciding which eight matter is the valuable part. The editor's brief ([prompts/editor.md](prompts/editor.md)) gives Claude three tests:

| Test | Example that fails it |
|---|---|
| **Something changed** | "OpenAI is reportedly working on...", "Google teases..." |
| **It matters beyond insiders** | Executive gossip, stock moves, a CEO's remark in an interview |
| **It can be sourced** | One outlet's anonymous scoop, unless it's big enough to label "Unconfirmed" |

Each company gets zero to three items. A quiet company gets one calm line ("Nothing new from xAI today.") instead of filler.

**2. The model proposes, the code verifies.** Claude writes a structured draft. Before anything is published, plain code checks it:

- Every item must cite real ids from that morning's read. Unknown or reused citations are removed, and an item left with no sources is dropped.
- **"Official" requires the company's own post** among the sources. Otherwise it's downgraded.
- **"Reported" requires two or more outlets.** One outlet means "Unconfirmed".
- Outlet counts are computed from citations, never taken from the model, and the company itself doesn't count as an outside outlet.
- Everything that was read ends up somewhere. If the editor forgets to sort an item, it still appears under "left out", so "we read 353 items" is always literally true.

**3. Trust comes from receipts, not claims.**

- Every item has a status badge (Official, Reported, Unconfirmed, Disputed) and a fold listing every source, with the company's own post first.
- At the bottom, "See the items we left out, and why" opens everything that was skipped, grouped by reason ("Hype and speculation", "Repeats and syndication", "Stock and valuation chatter"...), with a one-line explanation specific to that day.
- The full editor brief is on the [How it works](https://akash90gupta.github.io/enough/how/) page, and every day's inputs and output are committed to [`data/`](data/).

## Trade-offs

- **The editor is made by one of the companies it covers.** Enough is written by Claude, and Anthropic is one of the five. I chose to say this openly rather than hide it. The brief tells the model to be stricter, not softer, with Anthropic. Status labels are enforced in code. The "left out" drawer makes it easy to check whether any company got a pass.
- **Official feeds where they exist, coverage where they don't.** OpenAI, Google and Meta publish feeds. Anthropic's news page is read directly. x.ai blocks automated readers, so the xAI section relies on reporting only, and the page says so.
- **Headlines, not full articles.** The editor reads titles and short summaries, never full articles. That keeps Enough fast, cheap and respectful of publishers, and every fact traces to text anyone can see. The cost is less nuance. The brief forbids filling gaps from the model's memory, which keeps it honest but sometimes leaves an item thinner than I'd like.
- **One call, not an agent.** A single request reads everything and writes the edition. An agent could open articles and dig deeper, but it would be slower, costlier and much harder to verify. For a daily page, predictability wins.
- **A static site, not an app.** GitHub Actions runs once a day and GitHub Pages serves the result. No server, no database, no login. It costs well under a dollar a day in API calls and nothing to host.

## Decision / Direction

I chose to make **restraint the feature**. Most AI news products compete to show you more. Enough competes to show you less and prove it didn't hide anything. That's also the shape I think AI should take in consumer products: let the model make the judgment call, constrain it with explicit rules, verify it with code, and give the user the receipts.

Next, if people use it:

- **A Friday "week in AI" edition**, built from the five daily editions, for people who only want to check in once.
- **Email delivery** for readers who want it in their inbox.
- **Corrections in public**, as a visible note on the day's page.

## Solution

```
05:00 PT   GitHub Actions wakes up
  read     src/read.mjs    official feeds + Anthropic's news page + Google News coverage per company,
                           last 30 hours, deduped                                 → data/reads/DATE.json
  write    src/write.mjs   Claude Opus 5.5 reads everything + yesterday's edition and returns
                           structured JSON; code verifies citations and statuses  → data/editions/DATE.json
  build    src/build.mjs   static HTML: today, one page per day, archive, how-it-works, RSS
  publish  commit data/ to main, deploy site/ to GitHub Pages
```

Small details that matter:

- **One section per company, always in the same order**, with a row of chips at the top showing where the changes are.
- **"Earlier this week"** under each company lists its items from the previous six days, so you can follow a company without reading every edition.
- **"You're caught up."** The page ends with a checkmark and "Go enjoy your Tuesday." No related stories.
- **Honest when late.** If today's edition hasn't arrived yet, the page says so instead of passing off yesterday's as today's.
- **Welcome back.** If you've been away, it lists the days you missed (stored only in your own browser).
- **Light and dark**, readable on a phone, and an RSS feed at [`/feed.xml`](https://akash90gupta.github.io/enough/feed.xml).

### Run it yourself

```bash
npm install
export ANTHROPIC_API_KEY=...   # only needed for the write step
npm run daily                  # read, write and build today's edition
npx serve site
```

To run your own copy: fork it, add `ANTHROPIC_API_KEY` as a repository secret, turn on GitHub Pages with "GitHub Actions" as the source, and set `SITE_URL` for your fork. To follow different companies, edit [`src/sources.mjs`](src/sources.mjs).

## What I learned building it

- **The prompt is a product spec.** Writing "what earns a place" forced me to define what counts as AI news. That definition, not the code, was the real design work.
- **"Use only what you were given" is the most important line.** Without it, the model fills in model names, prices and dates from memory. In AI, that memory is stale within weeks, and the reader can't tell which details are current.
- **Verification belongs in code.** Asking the model "is this official?" invites a confident wrong answer. Checking whether the company's own post is among the citations is free and always right.
- **Showing what you left out is the trust feature I'd bet on.** A short page only feels safe if you can see what didn't make it. The "left out" drawer turns "trust the AI" into "check the AI".
