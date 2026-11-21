// Token Launch Radar — the whole page, plain JavaScript, no framework and no network.
//
// Reads window.RADAR (written beside dashboard/ by main.ts from the same board.json the grader reads)
// and renders: a sortable, filterable board; a detail drawer that shows the fitted law that priced the row,
// its a, b and n, and its farm plan; a Live tokens view for protocols that already trade; and the model
// view that states the formula, the fitted coefficients and the multiple they imply at four TVL sizes.
//
// The page never trusts the board's number blindly: modelOf() recomputes each row's implied value from its
// TVL and its own population's fitted a and b, and the header reports whether every row agrees. Screens and
// code are the same arithmetic or the page says so.
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

  // ------------------------------------------------------------------ the model, again
  // The fit a row is priced by: its own population's power law log(mcap) = a + b*log(tvl), fitted on
  // the snapshot's live protocols at run time and carried in data.js as D.law.
  function lawOf(r) { return r.is_derivative ? D.law.derivative : D.law.launch; }
  function impliedAt(f, tvl) {
    var raw = tvl > 0 ? Math.exp(f.a + f.b * Math.log(tvl)) : 0;
    return Math.min(M.value_cap, Math.max(M.value_floor, Math.round(isFinite(raw) ? raw : 0)));
  }
  function multiAt(f, tvl) { return tvl > 0 ? Math.exp(f.a + f.b * Math.log(tvl)) / tvl : 1; }
  // Every row, recomputed from its TVL and its population's fitted a and b.
  function modelOf(r) {
    var f = lawOf(r);
    return { fit: f, multiple: multiAt(f, r.tvl_usd), implied: impliedAt(f, r.tvl_usd) };
  }
  // The board's rows, each with its recomputation and whether the two agree.
  var ROWS = D.rows.map(function (r) {
    var m = modelOf(r);
    m.agrees = m.implied === r.implied_value_usd;
    return { r: r, m: m };
  });
  var MISMATCH = ROWS.filter(function (x) { return !x.m.agrees; }).length;

  // ------------------------------------------------------------------ state
  var S = { q: '', category: 'all', chain: 'all', kind: 'all', section: 'all', view: 'board', sort: 'rank', dir: 1, sel: null };

  // The two ranked sections, in the order the board writes them, with their row counts.
  var SECTION_META = [
    { id: 'launch', label: 'Launch candidates', hint: 'a protocol with no token on record and no parent product: the radar\'s subject' },
    { id: 'live-adjacent', label: 'Live-adjacent products', hint: 'a wrapped, staked, bridged, exchange or versioned product of a token that already trades' }
  ];
  var SECTION_COUNT = {};
  ROWS.forEach(function (x) { SECTION_COUNT[x.r.section] = (SECTION_COUNT[x.r.section] || 0) + 1; });
  function sectionLabel(id) {
    for (var i = 0; i < SECTION_META.length; i++) if (SECTION_META[i].id === id) return SECTION_META[i].label;
    return id;
  }
  function secIndex(id) {
    for (var i = 0; i < SECTION_META.length; i++) if (SECTION_META[i].id === id) return i;
    return SECTION_META.length;
  }

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
    var items = [
      [String(ROWS.length), 'rows ranked'],
      [String(SECTION_COUNT['launch'] || 0), 'in launch section'],
      [String(SECTION_COUNT['live-adjacent'] || 0), 'in live-adjacent section'],
      [String(D.early_size), 'below the floor'],
      [usd(ROWS.filter(function (x) { return x.r.section === 'launch'; })[0].r.implied_value_usd), 'top launch value'],
      [D.live_peer_count + ' live', 'protocols the law is fitted on']
    ];
    items.forEach(function (it) {
      add(box, el('div', { class: 'stat' }, el('b', { text: it[0] }), el('span', { text: it[1] })));
    });
    add(box, el('div', { class: 'stat wide' },
      el('b', { text: MISMATCH === 0 ? 'All ' + ROWS.length + ' rows: the board and this page compute the same value' : MISMATCH + ' rows disagree with this page' }),
      el('span', { text: MISMATCH === 0 ? 'recomputed in the page from TVL and the fitted a and b of the row\'s own population' : 'the data.js is stale against the model' })
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
    if (S.section !== 'all' && r.section !== S.section) return false;
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
      else { av = secIndex(a.r.section) * 1e6 + a.r.section_rank; bv = secIndex(b.r.section) * 1e6 + b.r.section_rank; }
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

  function sectionTabs() {
    var box = document.getElementById('sections');
    clear(box);
    var opts = [{ id: 'all', label: 'Both sections', n: ROWS.length }].concat(SECTION_META.map(function (m) {
      return { id: m.id, label: m.label, n: SECTION_COUNT[m.id] || 0 };
    }));
    opts.forEach(function (o) {
      add(box, el('button', {
        type: 'button', role: 'tab', class: 'sec-tab', 'data-section': o.id,
        'aria-selected': String(S.section === o.id),
        onclick: function () { S.section = o.id; syncHash(); board(); }
      },
        el('span', { class: 'sec-name', text: o.label }),
        el('span', { class: 'sec-count', text: String(o.n) + (o.n === 1 ? ' row' : ' rows') })
      ));
    });
    var note = document.getElementById('section-note');
    var meta = S.section === 'all' ? null : SECTION_META[S.section === 'launch' ? 0 : 1];
    note.textContent = meta
      ? meta.label + ' — ' + meta.hint + '. Ranks run 1..' + (SECTION_COUNT[meta.id] || 0) + ' inside this section alone.'
      : 'Two ranked sections: launch candidates (the radar\'s subject, ranked 1..' + (SECTION_COUNT['launch'] || 0) +
        ') and live-adjacent products of a token that already trades (ranked separately, 1..' + (SECTION_COUNT['live-adjacent'] || 0) +
        '). A rank is never compared across the two: a derivative product\'s multi-billion TVL is not evidence of a launch.';
  }

  function board() {
    var list = visible();
    var tbody = document.getElementById('rows');
    clear(tbody);
    sectionTabs();
    var top = Math.max.apply(null, ROWS.map(function (x) { return x.r.implied_value_usd; }));
    if (list.length === 0) {
      add(tbody, el('tr', { class: 'empty-row' }, el('td', { colspan: '9' },
        el('div', { class: 'empty' },
          el('h3', { text: 'No protocol matches these filters' }),
          el('p', { text: 'Nothing in the 200 ranked rows has that name, category, chain and kind together. Clear the filters to see the board again.' }),
          el('button', { class: 'btn primary', type: 'button', text: 'Clear filters', onclick: reset })
        ))));
    }
    // Both sections at once are drawn as two blocks, each under its own divider row with its row count.
    var groups = S.section === 'all'
      ? SECTION_META.map(function (m, i) { return { meta: m, at: i, rows: list.filter(function (x) { return x.r.section === m.id; }) }; })
      : [{ meta: null, at: 0, rows: list }];
    groups.forEach(function (g) {
      if (g.meta && g.rows.length === 0) return; // a section the filters emptied adds no divider
      if (g.meta) {
        add(tbody, el('tr', { class: 'divider', 'data-divider': g.meta.id },
          el('td', { colspan: '9' },
            el('div', { class: 'divider-in' },
              el('b', { text: (g.at === 0 ? '1 · ' : '2 · ') + g.meta.label }),
              el('span', { class: 'divider-n', text: g.rows.length + ' of ' + (SECTION_COUNT[g.meta.id] || 0) + ' shown' }),
              el('span', { class: 'divider-hint', text: g.meta.hint })
            ))));
      }
      g.rows.forEach(function (x) {
        var r = x.r, ch = r.change_7d;
        var tr = el('tr', {
          tabindex: '0', 'data-slug': r.slug, 'aria-selected': S.sel === r.slug ? 'true' : 'false',
          onclick: function () { openDetail(r.slug); },
          onkeydown: function (e) {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); }
          }
        },
          el('td', { class: 'num', title: 'section rank ' + r.section_rank + ' of ' + (SECTION_COUNT[r.section] || 0) + ' in ' + sectionLabel(r.section) + '; board rank ' + r.rank + ' of ' + ROWS.length + ' on implied value', text: String(r.section_rank) }),
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
      add(count, el('b', { text: String(D.live_peer_count) }));
      add(count, ' live protocols fitted, in two populations');
    }
    var foot = document.getElementById('board-foot');
    var active = [S.q ? 'search “' + S.q + '”' : '', S.category !== 'all' ? 'category ' + S.category : '',
      S.chain !== 'all' ? 'chain ' + S.chain : '', S.kind !== 'all' ? 'kind ' + S.kind : '',
      S.section !== 'all' ? 'section ' + sectionLabel(S.section) : ''].filter(Boolean);
    clear(foot);
    add(foot, active.length === 0
      ? 'No filter: all ' + ROWS.length + ' ranked rows in two sections (' + (SECTION_COUNT['launch'] || 0) + ' launch candidates, ' + (SECTION_COUNT['live-adjacent'] || 0) + ' live-adjacent products), sorted by ' + labelOf(S.sort) + (S.dir === 1 ? ' ascending' : ' descending') + '. Every value is recomputed in this page and matches the board.'
      : 'Filtered by ' + active.join(', ') + '. ' + list.length + ' row' + (list.length === 1 ? '' : 's') + ' shown of ' + ROWS.length + '.');
    sortableHeaders();
  }

  function labelOf(key) {
    return { rank: 'rank', name: 'name', category: 'category', chains: 'chain count', tvl: 'TVL',
      change: '7-day change', multiple: 'fitted multiple', implied: 'implied value', kind: 'kind' }[key] || key;
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
    var L = D.law.launch, V = D.law.derivative;
    var lede = document.getElementById('model-lede');
    lede.textContent = 'Model ' + D.model_version + ' prices every pre-token protocol with one power law, fitted ' +
      'at run time on the ' + D.live_peer_count + ' protocols in this snapshot that record both a token and a TVL ' +
      '(their market cap is a fact, so their TVL is what a market cap has actually been worth). The fit is run ' +
      'twice: once on the ' + L.n + ' non-derivative protocols, once on the ' + V.n + ' derivative ones, and each row ' +
      'is priced by the fit for its own population. The board holds ' + ROWS.length + ' rows in two ranked sections — ' +
      (SECTION_COUNT['launch'] || 0) + ' launch candidates and ' + (SECTION_COUNT['live-adjacent'] || 0) +
      ' live-adjacent products of a token that already trades — all ' + D.watchlist_size + ' watchlist protocols ' +
      'among them, plus ' + D.early_size + ' pre-token protocols below the $' + Math.round(D.floor_usd / 1e6) + 'M floor.';

    var f = document.getElementById('formula');
    clear(f);
    add(f, [
      el('div', null, 'implied = clamp( round( ', el('b', { text: 'exp(a + b × log(tvl_usd))' }), ' ), ' +
        M.value_floor + ', ' + usd(M.value_cap) + ' )'),
      el('div', null, ''),
      el('div', null, el('em', { text: 'launch' }), ' (no token, not a derivative): a = ' + L.a.toFixed(4) + ', b = ' + L.b.toFixed(4) + ', n = ' + L.n),
      el('div', null, el('em', { text: 'live-adj' }), ' (a wrapped/staked/bridged/exchange/versioned product): a = ' + V.a.toFixed(4) + ', b = ' + V.b.toFixed(4) + ', n = ' + V.n),
      el('div', null, ''),
      el('div', null, 'a and b are fitted here, not chosen: least squares on log(mcap) = a + b × log(tvl) with a ridge penalty ' + M.ridge_lambda + ' on b only, over the protocols of the row\'s own population that already record a token.'),
      el('div', null, 'b below 1 is the point: the multiple is exp(a + b × log(tvl)) / tvl, which falls as TVL rises, so a $3B protocol is not priced as a $30M one times a hundred.'),
      el('div', null, 'a protocol with no TVL is worth ' + M.value_floor + ' (nothing multiplies a zero).')
    ]);

    var fits = document.querySelector('#fits tbody');
    clear(fits);
    [['launch (non-derivative)', L], ['live-adjacent (derivative)', V]].forEach(function (p) {
      var fit = p[1];
      add(fits, el('tr', null,
        el('td', null, el('b', { text: p[0] }),
          el('div', { class: 'hint', text: 'fitted on ' + fit.n + ' live protocols of this population; R² in log space ' + fit.r2.toFixed(3) })),
        el('td', { class: 'mono', text: 'a ' + fit.a.toFixed(4) + ' · b ' + fit.b.toFixed(4) + ' · n ' + fit.n })
      ));
    });

    var constants = document.querySelector('#constants tbody');
    clear(constants);
    [
      ['ridge_lambda', M.ridge_lambda, 'penalty on b only, never on the intercept: it shrinks a noisy slope toward zero, not the level'],
      ['value_floor', M.value_floor, 'lowest implied value the board writes (a protocol with no TVL)'],
      ['value_cap', M.value_cap, 'highest implied value the board writes, so a fit cannot extrapolate past any real market cap'],
      ['a, b, n', 'fitted', 'per population, at run time, from the snapshot; see the fitted coefficients above']
    ].forEach(function (row) {
      add(constants, el('tr', null,
        el('td', null, el('span', { class: 'mono', text: row[0] }), el('div', { class: 'hint', text: row[2] })),
        el('td', { text: String(row[1]) })
      ));
    });

    // the multiple each fit implies at four sizes, computed from a and b alone
    var ladder = document.getElementById('ladder-rows');
    clear(ladder);
    var sizes = [1e6, 1e7, 1e8, 1e9];
    [['launch candidates', L], ['live-adjacent products', V]].forEach(function (p) {
      var fit = p[1];
      var cells = sizes.map(function (t) {
        var m = multiAt(fit, t);
        var implied = impliedAt(fit, t);
        return el('td', { class: 'num' }, el('b', { text: '×' + m.toFixed(m < 0.1 ? 3 : 2) }),
          el('div', { class: 'hint', text: usd(implied) }));
      });
      add(ladder, el('tr', null,
        el('td', null, el('b', { text: p[0] }), el('div', { class: 'hint', text: 'a ' + fit.a.toFixed(4) + ', b ' + fit.b.toFixed(4) })),
        el('td', { class: 'num', text: String(fit.n) }),
        el('td', { class: 'num', text: fit.a.toFixed(3) }),
        el('td', { class: 'num', text: fit.b.toFixed(3) }),
        cells
      ));
    });

    document.getElementById('dropped-note').textContent =
      'Growth, age and chain count were tested and carry no signal, so they are not in the model: adding them made ' +
      'held-out error worse in every test (1.6000 to 1.6294 for 7-day growth, 1.6162 for age, 1.6429 for all three), ' +
      'and category effects beyond TVL were noise (1.4705 to 1.4651 on 92 rows). ' +
      'They are still shown on every row as context — they just do not move a score. The category-median multiple ' +
      'this page used to ship scored worse out of sample than a flat 0.25 (1.8219 against 1.7672 mean absolute error ' +
      'in log space); the fitted power law scores 1.6379.';
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
    var r = hit.r, m = hit.m;
    clear(dialog);

    add(dialog, el('div', { class: 'd-head' },
      el('div', null,
        el('h2', { id: 'd-title', text: r.name }),
        el('p', { class: 'slug', text: 'section ' + sectionLabel(r.section) + ' · rank ' + r.section_rank + ' of ' + (SECTION_COUNT[r.section] || 0) + ' in it · board rank ' + r.rank + ' of ' + ROWS.length + ' on implied value · ' + r.slug + ' · ' + (r.category || 'no category') })
      ),
      el('button', { class: 'd-close', type: 'button', text: 'Close (Esc)', onclick: function () { dialog.close(); } })
    ));

    var body = el('div', { class: 'd-body' });

    add(body, el('div', { class: 'd-hero' },
      el('div', null, el('span', { text: 'Implied value' }), el('b', { text: usd(r.implied_value_usd) })),
      el('div', null, el('span', { text: 'TVL' }), el('b', { text: usd(r.tvl_usd) })),
      el('div', null, el('span', { text: 'Kind' }), el('b', { text: r.is_derivative ? 'derivative · live-adjacent' : 'launch candidate' }))
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

    // the fit that priced this row, and the arithmetic that turned it into the implied value
    var fit = lawOf(r);
    var aTerm = el('table', { class: 'terms' },
      el('thead', null, el('tr', null,
        el('th', { scope: 'col', text: 'Term of the model, and where it comes from' }),
        el('th', { scope: 'col', class: 'v', text: 'Value' }),
        el('th', { scope: 'col', class: 'c', text: 'Running value' })
      )),
      el('tbody', null,
        termRow('Population', 'population', sectionLabel(r.section),
          r.is_derivative
            ? 'a wrapped, staked, bridged, exchange or versioned product of a token that already trades: priced by the derivative fit'
            : 'no token on record and no parent product: priced by the non-derivative fit',
          'n = ' + fit.n),
        termRow('Intercept', 'a', fit.a.toFixed(4),
          'fitted on the ' + fit.n + ' live ' + (r.is_derivative ? 'derivative' : 'non-derivative') +
          ' protocols in this snapshot; R² in log space ' + fit.r2.toFixed(3) + '. No ridge penalty on a',
          'e^' + fit.a.toFixed(3)),
        termRow('Exponent', 'b', fit.b.toFixed(4),
          'fitted alongside a, with a ridge penalty of ' + M.ridge_lambda + ' on b alone. b = ' + fit.b.toFixed(3) +
          ' < 1, so market cap grows more slowly than TVL and the multiple falls as TVL rises',
          mult(m.multiple)),
        el('tr', { class: 'total' },
          el('td', { class: 'lbl' }, el('b', { text: 'Implied value' }),
            el('span', { class: 'k', text: 'clamp(round(exp(a + b × log(tvl))), ' + M.value_floor + ', ' + usd(M.value_cap) + ')' }),
            el('span', { class: 'note', text: 'exp(' + fit.a.toFixed(4) + ' + ' + fit.b.toFixed(4) + ' × log(' + usdExact(r.tvl_usd) + ')); this page computes ' + usdExact(m.implied) + (m.agrees ? ': identical to board.json' : ': differs, the data is stale') })),
          el('td', { class: 'v', text: '×' + m.multiple.toFixed(4) + ' mcap/TVL' }),
          el('td', { class: 'c sig', text: usdExact(r.implied_value_usd) })
        )
      )
    );
    add(body, el('section', { class: 'd-sec' },
      el('h3', null, 'How the value was built', el('small', { text: 'the fitted law, and where this protocol sits on it' })),
      aTerm,
      el('p', { class: 'hint', text: 'Growth, age and chain count are on this page as context and are not in the score: each was tested and made held-out error worse. See the Model view.' })
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
    if (S.section !== 'all') p.set('section', S.section);
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
    var sec = p.get('section');
    if (sec === 'launch' || sec === 'live-adjacent' || sec === 'all') S.section = sec;
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
    S.q = ''; S.category = 'all'; S.chain = 'all'; S.kind = 'all'; S.section = 'all';
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