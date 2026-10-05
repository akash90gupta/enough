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
