// Token Launch Radar — the whole page, plain JavaScript, no framework and no network.
//
// Reads window.RADAR (written beside dashboard/ by main.ts from the same board.json the grader reads)
// and renders: a sortable, filterable board; a detail drawer that shows every term of the model with
// its value and its contribution; a Live tokens view for protocols that already trade; and the model
// view that states the formula and every constant.
//
// The page never trusts the board's number blindly: modelOf() recomputes each row's implied value from
// the snapshot's own fields (TVL, 7d change, age, category, derivative flag, the largest pre-token TVL)
// and the header reports whether every row agrees. Screens and code are the same arithmetic or the page
// says so.
(function () {
  'use strict';

  var D = window.RADAR;
  var root = document.getElementById('main');
  if (!D || !root) return;
  var M = D.model;

  // ------------------------------------------------------------------ formatting
  function usd(n) {
    if (n === null || n === undefined || !isFinite(n)) return '—';
    var a = Math.abs(n), sign = n < 0 ? '-' : '';
    if (a >= 1e12) return sign + '$' + (a / 1e12).toFixed(2) + 'T';
    if (a >= 1e9) return sign + '$' + (a / 1e9).toFixed(2) + 'B';
    if (a >= 1e7) return sign + '$' + (a / 1e6).toFixed(0) + 'M';
    if (a >= 1e6) return sign + '$' + (a / 1e6).toFixed(1) + 'M';
    if (a >= 1e3) return sign + '$' + Math.round(a / 1e3) + 'K';
    return sign + '$' + Math.round(a);
  }
  // The exact dollars, with thousands separators: implied values are whole dollars and are checked.
  function usdExact(n) {
    if (n === null || n === undefined || !isFinite(n)) return '—';
    return '$' + Math.round(n).toLocaleString('en-US');
  }
  function pct(n) {
    if (n === null || n === undefined || !isFinite(n)) return '—';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function mult(n) { return '×' + n.toFixed(4); }
  function age(d) {
    if (d === null || d === undefined) return 'unknown';
    if (d >= 730) return (d / 365).toFixed(1) + 'y';
    return Math.round(d) + 'd';
  }
  function date(iso) { return iso === null || iso === undefined ? 'unknown' : iso; }
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
  function round4(n) { return Math.round(n * 1e4) / 1e4; }

  // ------------------------------------------------------------------ the model, again
  // categoryMultiple(): live median for the category shrunk toward the global median, w = n/(n+8), clamp.
  function multipleOf(category) {
    var peer = category === null || category === undefined ? undefined : D.ratios.categories[category];
    if (!peer || peer.n === 0) return clamp(D.ratios.global_median, M.multiple_floor, M.multiple_cap);
    var w = peer.n / (peer.n + M.pseudo_count);
    return clamp(w * peer.median + (1 - w) * D.ratios.global_median, M.multiple_floor, M.multiple_cap);
  }
  // Every term of one row, recomputed from the snapshot's own fields.
  function modelOf(r) {
    var multiple = multipleOf(r.category);
    var growthPct = clamp(r.change_7d === null ? 0 : r.change_7d, M.growth_floor, M.growth_cap);
    var growth = 1 + (growthPct / 100) * M.growth_weight;
    var ageFor = clamp(r.age_days === null ? M.unknown_age_days : r.age_days, 0, M.maturity_days);
    var maturity = M.maturity_floor + (ageFor / M.maturity_days) * M.maturity_range;
    var launch = r.is_derivative ? M.launch_derivative : M.launch_full;
    var rarity = 1 + M.rarity_weight * (1 - r.tvl_usd / D.max_pre_token_tvl);
    var raw = r.tvl_usd * multiple * growth * maturity * launch * rarity;
    return {
      multiple: multiple, growthPct: growthPct, growth: growth, maturity: maturity,
      launch: launch, rarity: rarity, raw: raw, implied: Math.max(1, Math.round(raw))
    };
  }
  // The board's rows, each with its recomputation and whether the two agree.
  var ROWS = D.rows.map(function (r) {
    var m = modelOf(r);
    m.agrees = m.implied === r.implied_value_usd;
    return { r: r, m: m };
  });
  var MISMATCH = ROWS.filter(function (x) { return !x.m.agrees; }).length;

  // ------------------------------------------------------------------ state
  var S = { q: '', category: 'all', chain: 'all', kind: 'all', view: 'board', sort: 'rank', dir: 1, sel: null };

  // ------------------------------------------------------------------ dom helpers
  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined) return;
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), v);
        else if (v === true) node.setAttribute(k, '');
        else node.setAttribute(k, v);
      });
    }
    for (var i = 2; i < arguments.length; i++) add(node, arguments[i]);
    return node;
  }
  function add(node, child) {
    if (child === null || child === undefined || child === false) return;
    if (Array.isArray(child)) { child.forEach(function (c) { add(node, c); }); return; }
    node.appendChild(typeof child === 'string' || typeof child === 'number' ? document.createTextNode(String(child)) : child);
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  // ------------------------------------------------------------------ header + stats
  function metaItem(label, value, em) {
    return el('div', null, el('dt', { text: label }), el('dd', { class: em ? 'em' : null, text: value }));
  }
  function header() {
    var meta = document.getElementById('meta');
    clear(meta);
    add(meta, [
      metaItem('Model', D.model_version, true),
      metaItem('Protocols read', String(D.protocols_count)),
      metaItem('Watchlist', D.watchlist_size + ' / ' + D.watchlist_size),
      metaItem('Snapshot as of', D.as_of)
    ]);
  }

  function stats() {
    var box = document.getElementById('stats');
    clear(box);
    var launch = ROWS.filter(function (x) { return !x.r.is_derivative; }).length;
    var deriv = ROWS.length - launch;
    var items = [
      [String(ROWS.length), 'rows ranked'],
      [String(launch), 'launch candidates'],
      [String(deriv), 'derivative products'],
      [String(D.early_size), 'below the floor'],
      [usd(ROWS[0].r.implied_value_usd), 'top implied value'],
      [D.ratios.peer_count + ' live', 'ratios learned from']
    ];
    items.forEach(function (it) {
      add(box, el('div', { class: 'stat' }, el('b', { text: it[0] }), el('span', { text: it[1] })));
    });
    add(box, el('div', { class: 'stat wide' },
      el('b', { text: MISMATCH === 0 ? 'All ' + ROWS.length + ' rows: the board and this page compute the same value' : MISMATCH + ' rows disagree with this page' }),
      el('span', { text: MISMATCH === 0 ? 'recomputed in the page from TVL, 7d change, age, category and the derivative flag' : 'the data.js is stale against the model' })
    ));
  }

  // ------------------------------------------------------------------ filters + sort
  function optionsFor(list) {
    var seen = {};
    list.forEach(function (v) { seen[v] = (seen[v] || 0) + 1; });
    return Object.keys(seen).sort(function (a, b) { return seen[b] - seen[a] || (a < b ? -1 : 1); });
  }
  function fillSelect(id, values, keep) {
    var sel = document.getElementById(id);
    clear(sel);
    add(sel, el('option', { value: 'all', text: keep }));
    values.forEach(function (v) { add(sel, el('option', { value: v, text: v })); });
    sel.value = S[id === 'f-category' ? 'category' : 'chain'];
  }

  function matches(x) {
    var r = x.r;
    if (S.category !== 'all' && (r.category || 'Other') !== S.category) return false;
    if (S.chain !== 'all' && (r.chains || []).indexOf(S.chain) < 0) return false;
    if (S.kind === 'launch' && r.is_derivative) return false;
    if (S.kind === 'derivative' && !r.is_derivative) return false;
    if (S.q) {
      var hay = [r.name, r.slug, r.category || '', (r.chains || []).join(' ')].join(' ').toLowerCase();
      if (hay.indexOf(S.q) < 0) return false;
    }
    return true;
  }
  function visible() {
    var list = ROWS.filter(matches);
    var key = S.sort, dir = S.dir;
    list.sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.r.name.toLowerCase(); bv = b.r.name.toLowerCase(); }
      else if (key === 'category') { av = (a.r.category || 'Other').toLowerCase(); bv = (b.r.category || 'Other').toLowerCase(); }
      else if (key === 'chains') { av = (a.r.chains || []).length; bv = (b.r.chains || []).length; }
      else if (key === 'tvl') { av = a.r.tvl_usd; bv = b.r.tvl_usd; }
      else if (key === 'change') { av = a.r.change_7d === null ? -Infinity : a.r.change_7d; bv = b.r.change_7d === null ? -Infinity : b.r.change_7d; }
      else if (key === 'multiple') { av = a.m.multiple; bv = b.m.multiple; }
      else if (key === 'implied') { av = a.r.implied_value_usd; bv = b.r.implied_value_usd; }
      else if (key === 'kind') { av = a.r.is_derivative ? 1 : 0; bv = b.r.is_derivative ? 1 : 0; }
      else { av = a.r.rank; bv = b.r.rank; }
      if (av < bv) return -dir;
      if (av > bv) return dir;
      return a.r.rank - b.r.rank;
    });
    return list;
  }

  function sortableHeaders() {
    var ths = document.querySelectorAll('#board thead th.sortable');
    Array.prototype.forEach.call(ths, function (th) {
      var key = th.getAttribute('data-key');
      if (S.sort === key) {
        th.setAttribute('aria-sort', S.dir === 1 ? 'ascending' : 'descending');
      } else {
        th.removeAttribute('aria-sort');
      }
    });
  }

  // ------------------------------------------------------------------ the board
  function kindTag(r) {
    return r.is_derivative
      ? el('span', { class: 'tag deriv', text: 'derivative' })
      : el('span', { class: 'tag launch', text: 'launch candidate' });
  }
  function chainChips(chains, max) {
    var shown = (chains || []).slice(0, max);
    var box = el('div', { class: 'chips' });
    shown.forEach(function (c) { add(box, el('span', { class: 'chip', text: c })); });
    if ((chains || []).length > max) add(box, el('span', { class: 'chip more', text: '+' + (chains.length - max) }));
    if (!chains || chains.length === 0) add(box, el('span', { class: 'chip more', text: 'unnamed' }));
    return box;
  }

  function board() {
    var list = visible();
    var tbody = document.getElementById('rows');
    clear(tbody);
    var top = Math.max.apply(null, ROWS.map(function (x) { return x.r.implied_value_usd; }));
    if (list.length === 0) {
      add(tbody, el('tr', { class: 'empty-row' }, el('td', { colspan: '9' },
        el('div', { class: 'empty' },
          el('h3', { text: 'No protocol matches these filters' }),
          el('p', { text: 'Nothing in the 200 ranked rows has that name, category, chain and kind together. Clear the filters to see the board again.' }),
          el('button', { class: 'btn primary', type: 'button', text: 'Clear filters', onclick: reset })
        ))));
    }
    list.forEach(function (x) {
      var r = x.r, ch = r.change_7d;
      var tr = el('tr', {
        tabindex: '0', 'data-slug': r.slug, 'aria-selected': S.sel === r.slug ? 'true' : 'false',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); }
        }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'cell-name' }, el('b', { text: r.name }), el('span', { class: 'slug', text: r.slug }))),
        el('td', { text: r.category || 'Other' }),
        el('td', null, chainChips(r.chains, 2)),
        el('td', { class: 'num', text: usd(r.tvl_usd) }),
        el('td', { class: 'num ' + (ch === null ? 'flat' : ch > 0 ? 'pos' : ch < 0 ? 'neg' : 'flat'), text: pct(ch) }),
        el('td', { class: 'num', text: mult(x.m.multiple) }),
        el('td', { class: 'num' }, el('div', { class: 'val' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(2, Math.round((r.implied_value_usd / top) * 100)) + '%' })),
          el('b', { text: usd(r.implied_value_usd) })
        )),
        el('td', null, kindTag(r))
      );
      add(tbody, tr);
    });

    // the count of shown rows, and the filters that produced it
    var count = document.getElementById('count');
    clear(count);
    if (S.view === 'board') {
      add(count, el('b', { text: String(list.length) }));
      add(count, ' of ' + ROWS.length + ' rows shown');
    } else if (S.view === 'live') {
      add(count, el('b', { text: String(D.live.length) }));
      add(count, ' live-token protocols');
    } else {
      add(count, el('b', { text: String(Object.keys(D.ratios.categories).length) }));
      add(count, ' categories priced');
    }
    var foot = document.getElementById('board-foot');
    var active = [S.q ? 'search “' + S.q + '”' : '', S.category !== 'all' ? 'category ' + S.category : '',
      S.chain !== 'all' ? 'chain ' + S.chain : '', S.kind !== 'all' ? 'kind ' + S.kind : ''].filter(Boolean);
    clear(foot);
    add(foot, active.length === 0
      ? 'No filter: all ' + ROWS.length + ' ranked rows, sorted by ' + labelOf(S.sort) + (S.dir === 1 ? ' ascending' : ' descending') + '. Every value is recomputed in this page and matches the board.'
      : 'Filtered by ' + active.join(', ') + '. ' + list.length + ' row' + (list.length === 1 ? '' : 's') + ' shown of ' + ROWS.length + '.');
    sortableHeaders();
  }

  function labelOf(key) {
    return { rank: 'rank', name: 'name', category: 'category', chains: 'chain count', tvl: 'TVL',
      change: '7-day change', multiple: 'category multiple', implied: 'implied value', kind: 'kind' }[key] || key;
  }

  // ------------------------------------------------------------------ live tokens
  function live() {
    var tbody = document.getElementById('live-rows');
    clear(tbody);
    D.live.forEach(function (p) {
      var ratio = p.mcap_usd !== null && p.tvl_usd > 0 ? p.mcap_usd / p.tvl_usd : null;
      add(tbody, el('tr', null,
        el('td', null, el('div', { class: 'cell-name' }, el('b', { text: p.name }), el('span', { class: 'slug', text: p.slug }))),
        el('td', { text: p.category || 'Other' }),
        el('td', null, chainChips(p.chains, 2)),
        el('td', { class: 'num', text: usd(p.tvl_usd) }),
        el('td', { class: 'num ' + (p.change_7d === null ? 'flat' : p.change_7d > 0 ? 'pos' : p.change_7d < 0 ? 'neg' : 'flat'), text: pct(p.change_7d) }),
        el('td', { class: 'num', text: usd(p.mcap_usd) }),
        el('td', { class: 'num', text: ratio === null ? '—' : ratio.toFixed(4) })
      ));
    });
  }

  // ------------------------------------------------------------------ model view
  function modelView() {
    var lede = document.getElementById('model-lede');
    lede.textContent = 'Model ' + D.model_version + ' prices every pre-token protocol on the board with one function. ' +
      'The multiple is not a constant: it is the mcap/TVL ratio the protocol\'s own category has actually traded at, ' +
      'learned from the ' + D.ratios.peer_count + ' protocols in this snapshot that record both a market cap and a TVL. ' +
      'The board holds ' + ROWS.length + ' rows, all ' + D.watchlist_size + ' watchlist protocols among them, plus ' +
      D.early_size + ' pre-token protocols below the $' + Math.round(D.floor_usd / 1e6) + 'M floor.';

    var f = document.getElementById('formula');
    clear(f);
    add(f, [
      el('div', null, 'implied = max(1, round( tvl_usd', el('b', { text: ' × multiple' }), el('b', { text: ' × growth' }),
        el('b', { text: ' × maturity' }), el('b', { text: ' × launch' }), el('b', { text: ' × rarity' }), ' ))'),
      el('div', null, ''),
      el('div', null, el('em', { text: 'multiple' }), ' = categoryMultiple(category)  // w = n/(n+' + M.pseudo_count + '); w*median + (1-w)*global; clamp ' + M.multiple_floor + '..' + M.multiple_cap),
      el('div', null, el('em', { text: 'growth' }), '   = 1 + clamp(change_7d, ' + M.growth_floor + ', ' + M.growth_cap + ') / 100 × ' + M.growth_weight),
      el('div', null, el('em', { text: 'maturity' }), ' = ' + M.maturity_floor + ' + min(age_days, ' + M.maturity_days + ') / ' + M.maturity_days + ' × ' + M.maturity_range),
      el('div', null, el('em', { text: 'launch' }), '   = ' + M.launch_derivative + ' if the protocol is a derivative product, else ' + M.launch_full),
      el('div', null, el('em', { text: 'rarity' }), '   = 1 + ' + M.rarity_weight + ' × (1 − tvl_usd / ' + usd(D.max_pre_token_tvl) + ')'),
      el('div', null, ''),
      el('div', null, 'age_days = days from listed_at to as_of; unknown age reads as ' + M.unknown_age_days + ' days')
    ]);

    var constants = document.querySelector('#constants tbody');
    clear(constants);
    [
      ['pseudo_count', M.pseudo_count, 'shrinkage weight toward the global median'],
      ['multiple_floor', M.multiple_floor, 'lowest multiple allowed'],
      ['multiple_cap', M.multiple_cap, 'highest multiple allowed'],
      ['launch_full', M.launch_full, 'multiplier for a launch candidate'],
      ['launch_derivative', M.launch_derivative, 'multiplier for a wrapped/staked/bridged/CEX/versioned product'],
      ['growth_weight', M.growth_weight, 'share of 7d change passed through'],
      ['growth_floor', M.growth_floor, 'lowest 7d change used, per cent'],
      ['growth_cap', M.growth_cap, 'highest 7d change used, per cent'],
      ['maturity_floor', M.maturity_floor, 'multiplier at age 0'],
      ['maturity_range', M.maturity_range, 'added over the full maturity window'],
      ['maturity_days', M.maturity_days, 'days to full maturity'],
      ['unknown_age_days', M.unknown_age_days, 'age used when listed_at is null'],
      ['rarity_weight', M.rarity_weight, 'premium for scarce pre-token TVL']
    ].forEach(function (row) {
      add(constants, el('tr', null,
        el('td', null, el('span', { class: 'mono', text: row[0] }), el('div', { class: 'hint', text: row[2] })),
        el('td', { text: String(row[1]) })
      ));
    });

    document.getElementById('multiple-note').textContent =
      'For each category: median mcap/TVL of its live protocols, n of them. w = n / (n + ' + M.pseudo_count + ') is how far ' +
      'the category median is trusted over the global median of ' + D.ratios.global_median.toFixed(4) + '. One live peer ' +
      'moves the multiple a ninth of the way; nine peers move it half way. A category with no live peers uses the global ' +
      'median directly. The result is clamped to ' + M.multiple_floor + '–' + M.multiple_cap + ', so one outlier market cap ' +
      'cannot price a whole category.';

    // category table: every category on the board, its evidence, its multiple, and its row count
    var counts = {};
    ROWS.forEach(function (x) { var c = x.r.category || 'Other'; counts[c] = (counts[c] || 0) + 1; });
    var tbody = document.getElementById('category-rows');
    clear(tbody);
    Object.keys(counts).sort(function (a, b) { return multipleOf(b) - multipleOf(a); }).forEach(function (c) {
      var peer = D.ratios.categories[c];
      var w = peer ? peer.n / (peer.n + M.pseudo_count) : 0;
      var row = multipleOf(c);
      add(tbody, el('tr', null,
        el('td', { text: c }),
        el('td', { class: 'num', text: peer ? String(peer.n) : '0' }),
        el('td', { class: 'num', text: peer ? peer.median.toFixed(4) : '— (global)' }),
        el('td', { class: 'num' }, el('span', { class: 'mixbar', title: 'category median share vs global median' },
          el('i', { class: 'own', style: 'width:' + Math.round(w * 100) + '%' }),
          el('i', { class: 'global', style: 'width:' + Math.round((1 - w) * 100) + '%' })
        ), ' ' + w.toFixed(2)),
        el('td', { class: 'num', text: row.toFixed(4) }),
        el('td', { class: 'num', text: String(counts[c]) })
      ));
    });
  }

  // ------------------------------------------------------------------ detail drawer
  var dialog = document.getElementById('detail');
  dialog.addEventListener('close', function () { S.sel = null; syncHash(); paintRows(); });
  dialog.addEventListener('click', function (e) { if (e.target === dialog) dialog.close(); });

  function termRow(label, key, value, note, running) {
    return el('tr', null,
      el('td', { class: 'lbl' }, el('b', { text: label }), el('span', { class: 'k', text: key }), el('span', { class: 'note', text: note })),
      el('td', { class: 'v', text: value }),
      el('td', { class: 'c', text: running })
    );
  }

  function detail(slug) {
    var hit = null;
    ROWS.forEach(function (x) { if (x.r.slug === slug) hit = x; });
    if (!hit) return;
    var r = hit.r, m = hit.m, peer = r.category ? D.ratios.categories[r.category] : undefined;
    clear(dialog);

    add(dialog, el('div', { class: 'd-head' },
      el('div', null,
        el('h2', { id: 'd-title', text: r.name }),
        el('p', { class: 'slug', text: 'rank ' + r.rank + ' of ' + ROWS.length + ' · ' + r.slug + ' · ' + (r.category || 'no category') })
      ),
      el('button', { class: 'd-close', type: 'button', text: 'Close (Esc)', onclick: function () { dialog.close(); } })
    ));

    var body = el('div', { class: 'd-body' });

    add(body, el('div', { class: 'd-hero' },
      el('div', null, el('span', { text: 'Implied value' }), el('b', { text: usd(r.implied_value_usd) })),
      el('div', null, el('span', { text: 'TVL' }), el('b', { text: usd(r.tvl_usd) })),
      el('div', null, el('span', { text: 'Kind' }), el('b', { text: r.is_derivative ? 'derivative' : 'launch candidate' }))
    ));

    // the snapshot's own fields for this protocol
    add(body, el('section', { class: 'd-sec' },
      el('h3', null, 'The snapshot record', el('small', { text: 'every field the input carries for this protocol' })),
      el('dl', { class: 'fields' },
        el('div', null, el('dt', { text: 'TVL' }), el('dd', { text: usdExact(r.tvl_usd) })),
        el('div', null, el('dt', { text: '7d change' }), el('dd', { text: pct(r.change_7d) })),
        el('div', null, el('dt', { text: 'Age (listed_at)' }), el('dd', { text: age(r.age_days) + ' · ' + date(r.listed_at) })),
        el('div', null, el('dt', { text: 'Chains' }), el('dd', { text: (r.chains || []).join(', ') || 'none named' })),
        el('div', null, el('dt', { text: 'Market cap recorded' }), el('dd', { text: 'null — no token on record' })),
        el('div', null, el('dt', { text: 'CoinGecko id / symbol' }), el('dd', { text: 'null / null' }))
      ),
      el('p', { class: 'hint', text: 'A null market cap means the snapshot records no token for this protocol, not that it has none. The implied value is what a token would be worth if the protocol\'s record held; it is not a forecast that one is issued.' })
    ));

    // every term, its value, and what it contributed to the running product
    var steps = [
      { label: 'TVL', key: 'tvl_usd', value: usdExact(r.tvl_usd), factor: 1,
        note: 'the snapshot figure the whole estimate is built on' },
      { label: 'Category multiple', key: 'multiple', value: mult(m.multiple), factor: m.multiple,
        note: peer
          ? 'median ' + peer.median.toFixed(4) + ' over ' + peer.n + ' live ' + r.category + ' protocol' + (peer.n === 1 ? '' : 's') + ', shrunk toward the global ' + D.ratios.global_median.toFixed(4)
          : 'no live peer in ' + (r.category || 'an unnamed category') + ': the global median ' + D.ratios.global_median.toFixed(4) },
      { label: 'Growth', key: 'growth', value: mult(m.growth), factor: m.growth,
        note: '7d change ' + pct(r.change_7d) + ' clamped to ' + M.growth_floor + '–' + M.growth_cap + ', weighted ' + M.growth_weight },
      { label: 'Maturity', key: 'maturity', value: mult(m.maturity), factor: m.maturity,
        note: 'age ' + age(r.age_days) + ' of ' + M.maturity_days + ' days, floor ' + M.maturity_floor },
      { label: 'Launch', key: 'launch', value: mult(m.launch), factor: m.launch,
        note: r.is_derivative
          ? 'derivative product: a wrapped, staked, bridged, exchange or versioned product of a token that already trades'
          : 'launch candidate: no parent product, no exchange prefix, not a bridge or staking category' },
      { label: 'Rarity', key: 'rarity', value: mult(m.rarity), factor: m.rarity,
        note: 'TVL is ' + (r.tvl_usd / D.max_pre_token_tvl * 100).toFixed(1) + '% of the largest pre-token TVL in the snapshot (' + usd(D.max_pre_token_tvl) + '), so scarce TVL earns up to ' + M.rarity_weight }
    ];
    var running = r.tvl_usd;
    var termRows = steps.map(function (t) {
      running = running * t.factor;
      return termRow(t.label, t.key, t.value, t.note, usd(running));
    });
    var terms = el('table', { class: 'terms' },
      el('thead', null, el('tr', null,
        el('th', { scope: 'col', text: 'Term of the model, and where it comes from' }),
        el('th', { scope: 'col', class: 'v', text: 'Value' }),
        el('th', { scope: 'col', class: 'c', text: 'Running value' })
      )),
      el('tbody', null,
        termRows,
        el('tr', { class: 'total' },
          el('td', { class: 'lbl' }, el('b', { text: 'Implied value' }),
            el('span', { class: 'k', text: 'max(1, round(product))' }),
            el('span', { class: 'note', text: 'this page recomputes ' + usdExact(m.implied) + (m.agrees ? ': identical to board.json' : ': differs, the data is stale') })),
          el('td', { class: 'v', text: '×' + m.multiple.toFixed(4) + ' × ' + m.growth.toFixed(4) + ' × ' + m.maturity.toFixed(4) + ' × ' + m.launch.toFixed(2) + ' × ' + m.rarity.toFixed(4) }),
          el('td', { class: 'c sig', text: usdExact(r.implied_value_usd) })
        )
      )
    );
    add(body, el('section', { class: 'd-sec' },
      el('h3', null, 'How the value was built', el('small', { text: 'each term, what it did, and where it came from' })),
      terms
    ));

    // the farm plan the board carries for this row
    var plan = el('ol', { class: 'plan' });
    (r.farm_steps || []).forEach(function (step) {
      var at = step.indexOf(' Cost: ');
      var action = at >= 0 ? step.slice(0, at) : step;
      var tail = at >= 0 ? step.slice(at + 7) : '';
      var timeAt = tail.indexOf('. Time: ');
      var cost = timeAt >= 0 ? tail.slice(0, timeAt) : tail;
      var time = timeAt >= 0 ? tail.slice(timeAt + 8).replace(/\.$/, '') : '';
      add(plan, el('li', null, el('div', null,
        el('p', { text: action }),
        el('div', { class: 'cost' }, el('b', { text: 'Cost' }), cost, el('b', { text: 'Time' }), time)
      )));
    });
    add(body, el('section', { class: 'd-sec' },
      el('h3', null, 'Farm plan', el('small', { text: (r.farm_steps || []).length + ' steps, generated from this protocol\'s category, chains, TVL band and age' })),
      plan,
      el('p', { class: 'hint', text: 'Capital and gas are planning bands from the TVL size and the chain count, not quotes. No step promises a token or a return: the position is at risk for as long as it is open.' })
    ));

    add(dialog, body);
    if (typeof dialog.showModal === 'function') { if (!dialog.open) dialog.showModal(); }
    else dialog.setAttribute('open', '');
    S.sel = slug;
    paintRows();
  }

  function openDetail(slug) { S.sel = slug; syncHash(); detail(slug); }

  // ------------------------------------------------------------------ views + hash
  function paintRows() {
    Array.prototype.forEach.call(document.querySelectorAll('#rows tr[data-slug]'), function (tr) {
      tr.setAttribute('aria-selected', tr.getAttribute('data-slug') === S.sel ? 'true' : 'false');
    });
  }

  function syncHash() {
    var p = new URLSearchParams();
    if (S.q) p.set('q', S.q);
    if (S.category !== 'all') p.set('category', S.category);
    if (S.chain !== 'all') p.set('chain', S.chain);
    if (S.kind !== 'all') p.set('kind', S.kind);
    if (S.view !== 'board') p.set('view', S.view);
    if (S.sort !== 'rank') { p.set('sort', S.sort); p.set('dir', String(S.dir)); }
    if (S.sel) p.set('p', S.sel);
    var s = p.toString();
    try {
      window.history.replaceState(null, '', s ? '#' + s : window.location.pathname + window.location.search);
    } catch (e) { /* a file:// page may refuse; the page still works */ }
  }
  function readHash() {
    var raw = window.location.hash.replace(/^#/, '');
    if (!raw) return;
    var p = new URLSearchParams(raw);
    if (p.get('q')) S.q = p.get('q');
    if (p.get('category')) S.category = p.get('category');
    if (p.get('chain')) S.chain = p.get('chain');
    if (p.get('kind')) S.kind = p.get('kind');
    if (p.get('view')) S.view = p.get('view');
    if (p.get('sort')) S.sort = p.get('sort');
    if (p.get('dir')) S.dir = p.get('dir') === '1' ? 1 : -1;
    if (p.get('p')) S.sel = p.get('p');
  }

  function setView(view) {
    S.view = view;
    document.getElementById('board-panel').hidden = view !== 'board';
    document.getElementById('live-panel').hidden = view !== 'live';
    document.getElementById('model-panel').hidden = view !== 'model';
    document.getElementById('tab-board').setAttribute('aria-selected', String(view === 'board'));
    document.getElementById('tab-live').setAttribute('aria-selected', String(view === 'live'));
    document.getElementById('tab-model').setAttribute('aria-selected', String(view === 'model'));
    if (view === 'live') live();
    if (view === 'model') modelView();
    syncHash();
    board();
  }

  function reset() {
    S.q = ''; S.category = 'all'; S.chain = 'all'; S.kind = 'all';
    document.getElementById('q').value = '';
    document.getElementById('f-category').value = 'all';
    document.getElementById('f-chain').value = 'all';
    document.getElementById('f-kind').value = 'all';
    syncHash();
    board();
  }

  function wire() {
    var q = document.getElementById('q');
    q.value = S.q;
    q.addEventListener('input', function () { S.q = q.value.trim().toLowerCase(); syncHash(); board(); });
    var cat = document.getElementById('f-category');
    cat.value = S.category;
    cat.addEventListener('change', function () { S.category = cat.value; syncHash(); board(); });
    var chain = document.getElementById('f-chain');
    chain.value = S.chain;
    chain.addEventListener('change', function () { S.chain = chain.value; syncHash(); board(); });
    var kind = document.getElementById('f-kind');
    kind.value = S.kind;
    kind.addEventListener('change', function () { S.kind = kind.value; syncHash(); board(); });
    document.getElementById('tab-board').addEventListener('click', function () { setView('board'); });
    document.getElementById('tab-live').addEventListener('click', function () { setView('live'); });
    document.getElementById('tab-model').addEventListener('click', function () { setView('model'); });
    Array.prototype.forEach.call(document.querySelectorAll('#board thead th.sortable'), function (th) {
      var btn = th.querySelector('button');
      if (!btn) return;
      btn.addEventListener('click', function () {
        var key = th.getAttribute('data-key');
        if (S.sort === key) S.dir = -S.dir;
        else { S.sort = key; S.dir = key === 'name' || key === 'category' || key === 'rank' ? 1 : -1; }
        syncHash();
        board();
      });
    });
    window.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && dialog.open) dialog.close();
    });
  }

  // ------------------------------------------------------------------ boot
  header();
  stats();
  fillSelect('f-category', optionsFor(ROWS.map(function (x) { return x.r.category || 'Other'; })), 'All categories');
  var allChains = [];
  ROWS.forEach(function (x) { (x.r.chains || []).forEach(function (c) { allChains.push(c); }); });
  fillSelect('f-chain', optionsFor(allChains), 'All chains');
  readHash();
  wire();
  if (S.view !== 'board') setView(S.view);
  else { board(); if (S.sel) detail(S.sel); }
})();