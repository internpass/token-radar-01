// Token Radar dashboard.
//
// Everything on this page comes from window.RADAR, the data.js file main.ts writes
// beside dashboard/ from the same board it hands in as board.json. There is no
// network and no framework: the page builds its DOM from that one object.
//
// Views: a sortable, filterable board of pre-token protocols; a second table with
// the live-token protocols the model sets aside; a panel that states the scoring
// function with this snapshot's own constants; and a detail drawer per protocol
// that re-derives the row's implied value in the browser and shows its farm plan.
(() => {
  const DATA = window.RADAR;
  if (!DATA) return;

  const root = document.getElementById('board');
  const view = { query: '', category: 'all', tab: 'pre', sortKey: 'implied', ascending: false, open: null };

  // ---------- formatting ----------

  const wholeUsd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

  const money = (n) => {
    if (n === null || n === undefined || !Number.isFinite(n)) return 'n/a';
    const a = Math.abs(n);
    if (a >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
    if (a >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
    if (a >= 1e3) return `$${Math.round(n / 1e3)}K`;
    return wholeUsd.format(n);
  };

  const percent = (n) => {
    if (n === null || n === undefined || !Number.isFinite(n)) return 'n/a';
    return `${n > 0 ? '+' : ''}${n.toFixed(2)}%`;
  };

  const age = (days) => {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return `${(days / 365).toFixed(1)}y`;
    return `${Math.max(0, Math.round(days))}d`;
  };

  const chainLabel = (row) => (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain');
  const shortChains = (row) => (row.chains && row.chains.length ? row.chains.slice(0, 2).join(', ') : 'an unnamed chain');

  // ---------- the model, restated in the browser ----------
  // The detail drawer recomputes a row from the snapshot figures and compares the
  // result with the value board.json carries, so a stale data.js cannot pass
  // unnoticed. The peer multiple comes from the effective table data.js carries:
  // the row's own category entry, set from live peers of that category, of its
  // family, or of the whole snapshot, in that order of preference.

  const multipleFor = (row) => {
    const hit = (DATA.peers || []).find((p) => p.category === row.category);
    return hit ? hit.multiple : DATA.global_multiple;
  };

  const recompute = (row) => {
    const m = DATA.model;
    const rawGrowth = row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d;
    const growth = Math.min(m.growth_cap, Math.max(m.growth_floor, rawGrowth));
    const growthFactor = 1 + (growth / 100) * m.growth_weight;
    const knownAge = row.age_days === null || row.age_days === undefined ? m.unknown_age_days : row.age_days;
    const maturityFactor = m.maturity_floor + (Math.min(Math.max(knownAge, 0), m.maturity_days) / m.maturity_days) * m.maturity_range;
    const extraChains = Math.min(Math.max((row.chains ? row.chains.length : 1) - 1, 0), m.breadth_max_chains);
    const breadthFactor = 1 + m.breadth_weight * extraChains;
    return Math.max(1, Math.round(row.tvl_usd * multipleFor(row) * growthFactor * maturityFactor * breadthFactor));
  };

  // ---------- tiny DOM builder ----------

  function h(tag, props, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props || {})) {
      if (value === null || value === undefined) continue;
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value);
    }
    for (const child of children.flat(9)) {
      if (child === null || child === undefined || child === false) continue;
      node.append(child.nodeType ? child : document.createTextNode(String(child)));
    }
    return node;
  }

  // ---------- location hash as the shareable state ----------

  function readHash() {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    if (params.get('q')) view.query = params.get('q');
    if (params.get('category')) view.category = params.get('category');
    if (params.get('p')) view.open = params.get('p');
  }

  function writeHash() {
    const params = new URLSearchParams();
    if (view.query) params.set('q', view.query);
    if (view.category !== 'all') params.set('category', view.category);
    if (view.open) params.set('p', view.open);
    const text = params.toString();
    const url = text ? `#${text}` : window.location.pathname + window.location.search;
    window.history.replaceState(null, '', url);
  }

  // ---------- filtering and sorting ----------

  function visibleRows() {
    const needle = view.query.trim().toLowerCase();
    return DATA.rows.filter((row) => {
      if (view.category !== 'all' && row.category !== view.category) return false;
      if (!needle) return true;
      const haystack = [row.name, row.slug, row.category || '', (row.chains || []).join(' ')].join(' ').toLowerCase();
      return haystack.includes(needle);
    });
  }

  const sortValue = (row, key) => {
    switch (key) {
      case 'name': return row.name.toLowerCase();
      case 'tvl': return row.tvl_usd;
      case 'growth': return row.change_7d === null ? -Infinity : row.change_7d;
      case 'age': return row.age_days === null ? Infinity : row.age_days;
      default: return row.implied_value_usd;
    }
  };

  function orderedRows(list) {
    const direction = view.ascending ? 1 : -1;
    return [...list].sort((a, b) => {
      const av = sortValue(a, view.sortKey);
      const bv = sortValue(b, view.sortKey);
      if (av < bv) return -direction;
      if (av > bv) return direction;
      return a.slug < b.slug ? -1 : 1;
    });
  }

  // ---------- page sections ----------

  function headerBar() {
    return h('header', { class: 'top' },
      h('div', { class: 'brand' },
        h('span', { class: 'mark' }),
        h('span', { class: 'brand-name', text: 'Token Radar' })),
      h('div', { class: 'top-meta' },
        h('span', { text: `Snapshot ${DATA.as_of}` }),
        h('span', { text: 'DefiLlama protocol index' }),
        h('span', { text: `${DATA.model_version} model` })));
  }

  function fact(label, value) {
    return h('div', { class: 'fact' }, h('span', { text: label }), h('b', { text: value }));
  }

  function lede() {
    return h('section', { class: 'lede' },
      h('div', null,
        h('h1', { text: `${DATA.watchlist_size} watchlist protocols, ranked by implied value` }),
        h('p', {
          text: `The watchlist is the floor: every protocol with at least $${Math.round(DATA.floor_usd / 1e6)}M of TVL and no token on record. ` +
            `The early radar adds ${DATA.early_size} pre-token protocols below that floor. Implied value is a model, not a promise.`,
        })),
      h('div', { class: 'facts' },
        fact('Watchlist covered', `${DATA.watchlist_size} / ${DATA.watchlist_size}`),
        fact('Pre-token rows scored', String(DATA.board_size)),
        fact('Early rows below the floor', String(DATA.early_size)),
        fact('Live-token protocols set aside', String(DATA.live_size))));
  }

  function controls() {
    const categories = [...new Set(DATA.rows.map((r) => r.category || 'Other'))].sort();

    const search = h('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: view.query, 'aria-label': 'Search the board' });
    search.addEventListener('input', () => { view.query = search.value; writeHash(); render(); });

    const select = h('select', { id: 'category', 'aria-label': 'Filter by category' },
      h('option', { value: 'all', text: 'All categories' }),
      categories.map((c) => h('option', { value: c, text: c, ...(view.category === c ? { selected: 'selected' } : {}) })));
    select.addEventListener('change', () => { view.category = select.value; writeHash(); render(); });

    const tabButton = (tab, label) => h('button', {
      type: 'button',
      'aria-pressed': view.tab === tab ? 'true' : 'false',
      text: label,
      onclick: () => { view.tab = tab; render(); },
    });

    const shown = view.tab === 'pre' ? `${visibleRows().length} rows shown` : `${DATA.live.length} live-token protocols`;
    return h('div', { class: 'controls' },
      h('div', { class: 'field' }, h('label', { for: 'q', text: 'Search' }), search),
      h('div', { class: 'field' }, h('label', { for: 'category', text: 'Category' }), select),
      h('div', { class: 'field' },
        h('span', { class: 'sub', text: 'Token status' }),
        h('div', { class: 'tabs' }, tabButton('pre', 'Pre-token'), tabButton('live', 'Live token'))),
      h('span', { class: 'count', text: shown }));
  }

  function sortableHead(key, label) {
    const active = view.sortKey === key;
    return h('th', { scope: 'col' },
      h('button', {
        type: 'button',
        onclick: () => {
          if (active) view.ascending = !view.ascending;
          else { view.sortKey = key; view.ascending = false; }
          render();
        },
      }, label, active ? h('span', { 'aria-hidden': 'true', text: view.ascending ? ' ^' : ' v' }) : null));
  }

  function boardPanel() {
    const list = orderedRows(visibleRows());
    if (list.length === 0) {
      return h('div', { class: 'panel' },
        h('div', { class: 'empty' },
          h('h2', { text: 'No protocol matches that filter' }),
          h('p', { text: 'Clear the search or pick another category to see the board again.' }),
          h('button', {
            class: 'button primary', type: 'button', text: 'Clear filters',
            onclick: () => { view.query = ''; view.category = 'all'; writeHash(); render(); },
          })));
    }

    const peak = Math.max(...list.map((r) => r.implied_value_usd), 1);
    const body = h('tbody');
    for (const row of list) {
      const trend = row.change_7d === null ? '' : row.change_7d >= 0 ? 'pos' : 'neg';
      const tr = h('tr', {
        'data-selected': view.open === row.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: () => openDetail(row.slug),
        onkeydown: (event) => {
          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openDetail(row.slug); }
        },
      },
        h('td', { class: 'num', text: String(row.rank) }),
        h('td', null, h('div', { class: 'name' },
          h('b', { text: row.name }),
          h('span', { class: 'sub', text: `${row.category || 'Other'} on ${shortChains(row)}` }))),
        h('td', { class: 'num', text: money(row.tvl_usd) }),
        h('td', { class: `num ${trend}`, text: percent(row.change_7d) }),
        h('td', { class: 'num', text: age(row.age_days) }),
        h('td', null, h('div', { class: 'implied' },
          h('div', { class: 'bar', 'aria-hidden': 'true' },
            h('i', { style: `width:${Math.max(3, Math.round((row.implied_value_usd / peak) * 100))}%` })),
          h('span', { class: 'num', text: money(row.implied_value_usd) }))),
        h('td', null, h('span', { class: 'status', text: 'no token' })));
      body.append(tr);
    }

    return h('div', { class: 'panel' },
      h('div', { class: 'table-wrap' },
        h('table', null,
          h('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. Select a row for its model and farm plan.' }),
          h('thead', null, h('tr', null,
            sortableHead('implied', 'Rank'),
            sortableHead('name', 'Protocol'),
            sortableHead('tvl', 'TVL'),
            sortableHead('growth', '7d'),
            sortableHead('age', 'Age'),
            sortableHead('implied', 'Implied value'),
            h('th', { scope: 'col', text: 'Token' }))),
          body)));
  }

  function livePanel() {
    const body = h('tbody');
    for (const row of DATA.live) {
      body.append(h('tr', null,
        h('td', { class: 'num', text: 'live' }),
        h('td', null, h('div', { class: 'name' },
          h('b', { text: row.name }),
          h('span', { class: 'sub', text: `${row.category || 'Other'} on ${shortChains(row)}` }))),
        h('td', { class: 'num', text: money(row.tvl_usd) }),
        h('td', { class: `num ${row.change_7d !== null && row.change_7d >= 0 ? 'pos' : 'neg'}`, text: percent(row.change_7d) }),
        h('td', { class: 'num', text: money(row.mcap_usd) }),
        h('td', null, h('span', { class: 'status', text: 'already trades' }))));
    }
    return h('div', { class: 'panel' },
      h('div', { class: 'table-wrap' },
        h('table', null,
          h('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking.' }),
          h('thead', null, h('tr', null,
            ['Status', 'Protocol', 'TVL', '7d', 'Market cap', 'Token'].map((label) => h('th', { scope: 'col', text: label })))),
          body)));
  }

  function modelPanel() {
    const m = DATA.model;
    const formula = `implied = round( tvl_usd x peer_multiple(category) x (1 + clamp(change_7d, ${m.growth_floor}, ${m.growth_cap}) / 100 x ${m.growth_weight}) x ` +
      `(${m.maturity_floor} + min(age_days, ${m.maturity_days}) / ${m.maturity_days} x ${m.maturity_range}) x (1 + ${m.breadth_weight} x min(extra chains, ${m.breadth_max_chains})) )`;
    return h('section', { class: 'panel model' },
      h('h2', { text: 'How implied value is computed' }),
      h('p', {
        class: 'sub',
        text: 'Every row is scored by one function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked. ' +
          'The anchor is a peer multiple: a pre-token protocol is valued at the median market-cap/TVL the market already pays for live-token protocols ' +
          'of its own category in this same snapshot, so the ranking is not a TVL table.',
      }),
      h('div', { class: 'formula', text: formula }),
      h('p', {
        class: 'sub',
        text: `Effective peer multiples from this snapshot (median live market cap / TVL, clamped to ${m.peer_clamp_lo}..${m.peer_clamp_hi}). ` +
          `Each board category is valued at its own median when at least ${m.peer_min_count} live peers set one, else at its category family median ` +
          `(lending, trading, staking and so on), else at the global median ${DATA.global_multiple}x from ${DATA.global_peers} live protocols:`,
      }),
      h('ul', { class: 'peers' },
        (DATA.peers || []).slice(0, 14).map((p) => h('li', null,
          h('b', { text: `${p.category || 'Uncategorised'} ${p.multiple}x` }),
          ` from ${p.peers} live peers, ${p.source} median`))),
      h('p', {
        class: 'sub',
        text: `TVL and seven-day growth come from the snapshot. Age is the time since the protocol was first listed, the best record of how long it has run with no token; ` +
          `an unlisted age uses ${m.unknown_age_days} days. The early radar is every pre-token protocol below the watchlist floor, by TVL, and the live-token protocols are set aside with their market caps shown.`,
      }));
  }

  // ---------- detail drawer ----------

  const drawer = h('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  drawer.addEventListener('close', () => { view.open = null; writeHash(); });

  function equationRow(label, value) {
    return h('div', null, h('span', { text: label }), h('b', { class: 'num', text: value }));
  }

  function openDetail(slug) {
    const row = DATA.rows.find((r) => r.slug === slug);
    if (!row) return;
    view.open = slug;
    writeHash();
    drawer.textContent = '';

    drawer.append(h('div', { class: 'detail-head' },
      h('div', null,
        h('span', { class: 'brand-name', text: `Rank ${row.rank} of ${DATA.board_size}` }),
        h('h2', { id: 'detail-title', text: row.name }),
        h('p', { class: 'sub', text: `${row.category || 'Other'} on ${chainLabel(row)}` })),
      h('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: () => drawer.close() })));

    const check = recompute(row);
    const verdict = check === row.implied_value_usd
      ? ', the same number board.json carries.'
      : ', which differs from the board: the data would be stale.';
    drawer.append(h('section', { class: 'detail-section' },
      h('h3', { text: 'Implied value' }),
      h('div', { class: 'equation' },
        equationRow('TVL', money(row.tvl_usd)),
        equationRow('Peer multiple', `${row.peer_multiple}x (${row.peer_count} live peers, ${row.peer_source} median)`),
        equationRow('Seven-day growth', percent(row.change_7d)),
        equationRow('Age with no token', age(row.age_days)),
        equationRow('Growth multiplier', String(row.growth_multiplier)),
        equationRow('Maturity multiplier', String(row.maturity_multiplier)),
        equationRow('Breadth multiplier', String(row.breadth_multiplier)),
        equationRow('Implied value', money(row.implied_value_usd))),
      h('p', {
        class: 'sub',
        text: `Model ${DATA.model_version}: the same function scores every protocol. The page recomputes this row as ${money(check)}${verdict} This is an estimate, not a price.`,
      })));

    const steps = (row.farm_steps || []).map((step) => {
      const at = step.indexOf(' Cost: ');
      const action = at >= 0 ? step.slice(0, at) : step;
      const tail = at >= 0 ? step.slice(at + 1) : '';
      return h('li', null, h('b', { text: action }), h('span', { class: 'cost', text: tail }));
    });
    drawer.append(h('section', { class: 'detail-section' },
      h('h3', { text: 'Farm plan' }),
      h('ol', { class: 'steps' }, steps)));

    if (typeof drawer.showModal === 'function') {
      if (!drawer.open) drawer.showModal();
    } else {
      drawer.setAttribute('open', '');
    }
  }

  // ---------- render ----------

  function render() {
    root.textContent = '';
    const shell = h('div', { class: 'shell' });
    shell.append(headerBar(), lede(), controls());
    shell.append(view.tab === 'pre' ? boardPanel() : livePanel());
    if (view.tab === 'pre') shell.append(modelPanel());
    root.append(shell);
    root.setAttribute('aria-busy', 'false');
    if (!drawer.isConnected) root.append(drawer);
    if (view.open) openDetail(view.open);
  }

  readHash();
  render();

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && drawer.open) drawer.close();
  });
})();
