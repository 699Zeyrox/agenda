// Onglets « À venir » / « Passés ».
// Utilisation : AgendaUI.mount('#conteneur', events)  puis AgendaUI.setEvents(events) à chaque changement.
// events = [{ id, title, start (ISO), end? (ISO) }]  -> ADAPTER les noms de champs ci-dessous si besoin.
(function () {
  const F = { title: 'title', start: 'start', end: 'end' }; // ADAPTER

  let tab = 'upcoming';
  let events = [];
  let root, ul, empty;

  const startOf = (e) => new Date(e[F.start]).getTime();
  const endOf = (e) => new Date(e[F.end] || e[F.start]).getTime();
  const fmt = (e) => new Date(e[F.start]).toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: 'short' });

  function render() {
    if (!root) return;
    const now = Date.now();
    const up = tab === 'upcoming';
    const list = events
      .filter((e) => (up ? endOf(e) >= now : endOf(e) < now))
      .sort((a, b) => (up ? startOf(a) - startOf(b) : startOf(b) - startOf(a)));
    ul.replaceChildren();
    empty.hidden = list.length > 0;
    empty.textContent = up ? 'Aucun évènement à venir.' : 'Aucun évènement passé.';
    for (const e of list) {
      const li = document.createElement('li');
      li.className = 'event-item' + (up ? '' : ' past');
      const t = document.createElement('strong'); t.textContent = e[F.title];
      const d = document.createElement('div'); d.textContent = fmt(e);
      li.append(t, d);
      ul.append(li);
    }
  }

  function mount(selector, initial) {
    root = document.querySelector(selector);
    if (!root) return;
    root.innerHTML =
      '<div class="tabs" role="tablist">' +
      '<button class="tab active" data-tab="upcoming" role="tab">À venir</button>' +
      '<button class="tab" data-tab="past" role="tab">Passés</button></div>' +
      '<ul id="events-list" style="list-style:none;padding:0"></ul><p id="events-empty" hidden></p>';
    ul = root.querySelector('#events-list');
    empty = root.querySelector('#events-empty');
    root.querySelectorAll('.tab').forEach((btn) =>
      btn.addEventListener('click', () => {
        tab = btn.dataset.tab;
        root.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b === btn));
        render();
      })
    );
    if (initial) events = initial;
    render();
  }

  window.AgendaUI = { mount, setEvents(list) { events = list || []; render(); } };
  setInterval(render, 60000); // un évènement bascule seul dans « Passés »
})();
