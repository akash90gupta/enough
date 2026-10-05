// The only script on the page. It does two kind things and stores one date.
// 1. If today's edition is late, say so instead of passing off yesterday as today.
// 2. If you've been away, point you to the editions you missed.
(() => {
  const el = document.querySelector('.edition[data-today="1"]');
  const box = document.getElementById('welcome');
  if (!el || !box) return;

  const base = document.querySelector('.wordmark').getAttribute('href').replace(/\/$/, '');
  const edition = el.dataset.date;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const nice = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' });

  let last = null;
  try { last = localStorage.getItem('enough:last'); localStorage.setItem('enough:last', edition); } catch {}

  const say = (html) => { box.innerHTML = html; box.hidden = false; };

  if (edition < today) {
    say(`This is ${nice(edition)}'s edition. Today's hasn't arrived yet, so check back a little later.`);
    return;
  }
  if (!last || last >= edition) return;

  fetch(`${base}/editions.json`).then((r) => r.json()).then((dates) => {
    const missed = dates.filter((d) => d > last && d < edition);
    if (!missed.length) return;
    const links = missed.slice(-6).map((d) => `<a href="${base}/${d}/">${nice(d)}</a>`).join(', ');
    say(`Welcome back. You missed ${missed.length === 1 ? 'one day' : `${missed.length} days`}: ${links}. Each takes a few minutes, or start here and skip them. Anything big will show up today as an update.`);
  }).catch(() => {});
})();

// The five cards: tabs jump to a card, arrows step through, and the tab for the card in view lights up.
(() => {
  const track = document.querySelector('.track');
  if (!track) return;
  const cards = [...track.querySelectorAll('.card')];
  const tabs = new Map([...document.querySelectorAll('.jump a')].map((a) => [a.dataset.card, a]));
  const arrows = document.querySelector('.arrows');
  const [prev, next] = arrows ? arrows.querySelectorAll('.arrow') : [];

  const go = (card) => track.scrollTo({ left: card.offsetLeft - track.offsetLeft - parseFloat(getComputedStyle(track).paddingLeft), behavior: 'smooth' });

  for (const [id, tab] of tabs) {
    tab.addEventListener('click', (e) => {
      document.querySelector('.edition.is-rolled .unroll')?.click();
      const card = document.getElementById(id);
      if (!card) return;
      e.preventDefault();
      // If the cards are out of view (say, while reading past days), bring them back first.
      const box = track.getBoundingClientRect(), bar = document.querySelector('.today-bar');
      if (box.top < (bar?.offsetHeight ?? 0) || box.top > innerHeight * 0.6) {
        scrollTo({ top: scrollY + box.top - (bar?.offsetHeight ?? 0) - 12, behavior: 'smooth' });
      }
      go(card);
      history.replaceState(null, '', `#${id}`);
    });
  }

  const current = () => {
    const x = track.scrollLeft;
    let best = 0;
    cards.forEach((c, i) => { if (Math.abs(c.offsetLeft - track.offsetLeft - x) < Math.abs(cards[best].offsetLeft - track.offsetLeft - x)) best = i; });
    return best;
  };

  const board = track.closest('.board');
  const pips = [...document.querySelectorAll('.pips i')];
  const update = () => {
    const overflow = track.scrollWidth > track.clientWidth + 4;
    if (arrows) arrows.hidden = !overflow;
    board?.classList.toggle('scrolls', overflow);
    const i = current();
    pips.forEach((p, k) => p.classList.toggle('on', k === i));
    for (const [id, tab] of tabs) tab.classList.toggle('active', overflow && id === cards[i].id);
    if (overflow) {
      // Keep the active tab visible in its own row, without moving the page.
      const tab = tabs.get(cards[i].id), row = tab?.parentElement;
      if (row && (tab.offsetLeft < row.scrollLeft || tab.offsetLeft + tab.offsetWidth > row.scrollLeft + row.clientWidth)) {
        row.scrollTo({ left: tab.offsetLeft - row.offsetLeft - 8, behavior: 'smooth' });
      }
    }
    if (prev) prev.disabled = track.scrollLeft <= 4;
    if (next) next.disabled = track.scrollLeft + track.clientWidth >= track.scrollWidth - 4;
  };

  prev?.addEventListener('click', () => go(cards[Math.max(0, current() - 1)]));
  next?.addEventListener('click', () => go(cards[Math.min(cards.length - 1, current() + 1)]));
  track.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); go(cards[Math.min(cards.length - 1, current() + 1)]); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(cards[Math.max(0, current() - 1)]); }
  });

  let t;
  track.addEventListener('scroll', () => { clearTimeout(t); t = setTimeout(update, 60); }, { passive: true });
  addEventListener('resize', update);
  update();

  // Arriving with #openai (from "Earlier this week" or a shared link) opens on that card.
  const start = location.hash && document.getElementById(location.hash.slice(1));
  if (start && cards.includes(start)) {
    track.style.scrollBehavior = 'auto';
    go(start);
    track.style.scrollBehavior = '';
    start.closest('.board').scrollIntoView({ block: 'start' });
  }
})();

// Done: one tap tells Enough you've read today's edition. It's remembered until tomorrow's arrives.
(() => {
  const el = document.querySelector('.edition[data-today="1"]');
  const buttons = [...document.querySelectorAll('.done-btn')];
  if (!el || !buttons.length) return;
  const date = el.dataset.date;
  const title = document.querySelector('.done-title');
  const next = document.querySelector('.done .next');

  const rolled = document.querySelector('.rolled');
  // A finished day rolls up into one line; the cards are one tap away.
  const roll = (on) => {
    el.classList.toggle('is-rolled', on);
    if (rolled) rolled.hidden = !on;
    dispatchEvent(new Event('resize'));
  };
  document.querySelector('.unroll')?.addEventListener('click', () => roll(false));

  const render = (done) => {
    document.body.classList.toggle('is-done', done);
    for (const b of buttons) {
      b.setAttribute('aria-pressed', String(done));
      b.querySelector('.label').textContent = done ? 'Done for today' : 'Done';
    }
    if (title) title.textContent = done ? "You're caught up." : "That's everything.";
    if (next) next.textContent = done ? 'See you tomorrow morning.' : 'The next edition arrives tomorrow morning.';
  };

  let done = false;
  try { done = localStorage.getItem('enough:done') === date; } catch {}
  render(done);
  roll(done);

  for (const b of buttons) {
    b.addEventListener('click', () => {
      done = !done;
      try { done ? localStorage.setItem('enough:done', date) : localStorage.removeItem('enough:done'); } catch {}
      render(done);
      roll(done);
      if (done && rolled) rolled.scrollIntoView({ behavior: 'smooth', block: 'center' });
      b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
    });
  }
})();

// A hairline under the pinned bar once it's actually pinned.
(() => {
  const bar = document.querySelector('.today-bar');
  if (!bar) return;
  const onScroll = () => bar.classList.toggle('stuck', bar.getBoundingClientRect().top <= 0.5 && scrollY > 0);
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();
})();

// "3h ago" reads faster than a timestamp. The exact time stays in the tooltip.
(() => {
  const now = Date.now();
  for (const t of document.querySelectorAll('time.ago')) {
    const mins = Math.round((now - Date.parse(t.getAttribute('datetime'))) / 60000);
    if (Number.isNaN(mins) || mins < 0) continue;
    t.title = t.textContent;
    t.textContent = mins < 60 ? `${Math.max(1, mins)}m ago` : mins < 48 * 60 ? `${Math.round(mins / 60)}h ago` : t.textContent;
  }
})();
