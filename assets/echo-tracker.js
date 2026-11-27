/*
  Rescued yarn tracker: live batches built from the products.
  The server already renders the rows from the "Yarn batch" list (history). This script loads the product
  feed (templates/collection.yarn-data.liquid, 50 products per page), groups the products by batch, adds up
  kg, pieces and live stock per batch, replaces any list row with the same batch ID, sorts everything by
  logged date (newest first) and updates the four numbers at the top.
  If anything fails, the server-rendered rows stay as they are.
  Numbers get thousands separators (1,460 kg) and count up from 0 (about 2.4 s) when they scroll into view.
*/
(function (root) {
  'use strict';

  /* translated strings and number format from the layout (window.Echo.i18n); English is the fallback */
  var I = (root.Echo && root.Echo.i18n) || {};
  var MONTHS = (I.months || 'Jan,Feb,Mar,Apr,May,Jun,Jul,Aug,Sep,Oct,Nov,Dec').split(',');
  var THOUSANDS = I.thousands || ',';
  var DECIMAL = I.decimal || '.';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function parseNum(v) {
    if (v == null) return NaN;
    var m = String(v).replace(/\s/g, '').replace(',', '.').match(/^-?\d+(\.\d+)?/);
    return m ? parseFloat(m[0]) : NaN;
  }
  function round3(n) { return Math.round(n * 1000) / 1000; }
  function fmtNum(n) { return String(round3(n)); }
  /* 1460 -> "1,460", 1380.5 -> "1,380.5" (same as snippets/echo-num.liquid) */
  function fmtNumber(n) {
    var p = String(round3(n)).split('.');
    p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, THOUSANDS);
    return p.join(DECIMAL);
  }
  function fmtKg(n) { return fmtNumber(n) + ' kg'; }
  // the big number on the tracker page: whole kilograms, so it stays on one line
  function fmtKgWhole(n) { return fmtNumber(Math.round(n)) + ' kg'; }

  /*
    Count-up: the number runs from 0 to its value as it comes into view (1 second by default, fast at the
    start and slowing into the final value, like the common CountUp.js default). The speed can be changed per number with
    data-yarn-duration="3000" (milliseconds) on the element.
    No animation (final number straight away) for visitors who prefer reduced motion, browsers without
    IntersectionObserver, and zero values. While counting only whole numbers are shown, the exact value
    (for example 1,380.5) appears at the end. Each element animates once per value.
  */
  var DURATION = 1000;
  function durationOf(el) {
    var d = parseInt(el.getAttribute('data-yarn-duration'), 10);
    return d >= 300 && d <= 10000 ? d : DURATION;
  }
  function reducedMotion() {
    return !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }
  function runCount(el, to, format) {
    var start = null;
    var duration = durationOf(el);
    function frame(ts) {
      if (start === null) start = ts;
      var p = Math.min(1, (ts - start) / duration);
      var eased = p >= 1 ? 1 : 1 - Math.pow(2, -10 * p);
      el.textContent = p >= 1 ? format(to) : format(Math.floor(to * eased));
      if (p < 1) root.requestAnimationFrame(frame);
    }
    root.requestAnimationFrame(frame);
  }
  function showNumber(el, to, format) {
    if (!el) return;
    var final = format(to);
    el.style.fontVariantNumeric = 'tabular-nums';
    if (el.__yarnShown === to) { el.textContent = final; return; }
    if (!(to > 0) || reducedMotion() || !root.IntersectionObserver || !root.requestAnimationFrame) {
      el.__yarnShown = to;
      el.textContent = final;
      return;
    }
    el.textContent = format(0);
    var io = new root.IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        if (!entries[i].isIntersecting) continue;
        io.disconnect();
        el.__yarnShown = to;
        runCount(el, to, format);
        return;
      }
    }, { threshold: 0.3 });
    io.observe(el);
  }
  function normId(s) { return String(s == null ? '' : s).trim().toLowerCase(); }
  function dateKey(d) {
    var m = String(d || '').match(/^(\d{4})-(\d{2})(-(\d{2}))?/);
    return m ? m[1] + '-' + m[2] + '-' + (m[4] || '01') : '';
  }
  function showDate(k) {
    var m = String(k || '').match(/^(\d{4})-(\d{2})/);
    return m && MONTHS[+m[2] - 1] ? MONTHS[+m[2] - 1] + ' ' + m[1] : '';
  }

  /* items: [{h,u,n,b,k,p,l,s,f,d}] -> [{key,id,kg,pieces,left,last,fibre,logged,products}] */
  function aggregate(items) {
    var map = Object.create(null);
    var order = [];
    (items || []).forEach(function (it) {
      var id = String(it.b == null ? '' : it.b).trim();
      if (!id || id === '[ID]') return;
      var key = normId(id);
      var b = map[key];
      if (!b) {
        b = map[key] = { key: key, id: id, kg: 0, pieces: 0, left: 0, last: false, fibres: Object.create(null), logged: '', names: Object.create(null), products: [] };
        order.push(key);
      }
      var kg = parseNum(it.k); if (!isNaN(kg)) b.kg += kg;
      var pc = parseNum(it.p); if (!isNaN(pc)) b.pieces += pc;
      var lf = parseNum(it.l); if (!isNaN(lf)) b.left += lf;
      if (it.s === 'last') b.last = true;
      var f = String(it.f == null ? '' : it.f).trim();
      if (f) b.fibres[f] = (b.fibres[f] || 0) + 1;
      var dk = dateKey(it.d);
      if (dk && (!b.logged || dk < b.logged)) b.logged = dk;
      var nk = String(it.n || it.h || '').toLowerCase();
      if (!b.names[nk]) {
        b.names[nk] = 1;
        b.products.push({ u: it.u, n: it.n || it.h });
      }
    });
    return order.map(function (k) {
      var b = map[k];
      var best = '', bestN = 0;
      Object.keys(b.fibres).forEach(function (f) { if (b.fibres[f] > bestN) { best = f; bestN = b.fibres[f]; } });
      b.fibre = best;
      b.kg = round3(b.kg);
      b.pieces = Math.round(b.pieces);
      b.left = Math.round(b.left);
      return b;
    });
  }

  function statusHtml(b) {
    if (b.left <= 0) return '<span class="tstat closed">' + esc(I.closed || 'Closed') + '</span>';
    if (b.last) return '<span class="tstat last">' + esc(I.lastPieces || 'Last pieces') + '</span>';
    return '<span class="tstat">' + esc((I.openLeft || 'Open \u00b7 __COUNT__ left').replace('__COUNT__', b.left)) + '</span>';
  }

  function rowFromBatch(b, logged) {
    var links = b.products.map(function (p) {
      return '<a class="link" href="' + esc(p.u) + '">' + esc(p.n) + '</a>';
    }).join('<br>');
    var html = '<tr data-src="live" data-bid="' + esc(b.id) + '" data-logged="' + esc(logged) + '" data-kg="' + b.kg +
      '" data-pieces="' + b.pieces + '" data-left="' + b.left + '">' +
      '<td class="mono" style="text-transform:none;letter-spacing:0;color:var(--ink)">' + esc(b.id) + '</td>' +
      '<td>' + (esc(showDate(logged)) || '–') + '</td>' +
      '<td>' + esc(b.fibre) + '</td>' +
      '<td class="num">' + fmtKg(b.kg) + '</td>' +
      '<td>' + links + '</td>' +
      '<td class="num">' + b.pieces + '</td>' +
      '<td>' + statusHtml(b) + '</td></tr>';
    return { src: 'live', bid: b.id, logged: logged, kg: b.kg, pieces: b.pieces, left: b.left, fibre: b.fibre, html: html };
  }

  /*
    existing: rows already on the page [{src, bid, logged, kg, pieces, left, el}]
    batches:  result of aggregate()
    Returns { rows, stats } where rows is the final ordered list (newest first).
  */
  function merge(existing, batches) {
    var liveKeys = Object.create(null);
    var serverLogged = Object.create(null);
    batches.forEach(function (b) { liveKeys[b.key] = true; });
    var rows = [];
    existing.forEach(function (r) {
      if (batches.length && r.src === 'block') return; // example rows are dropped once real data exists
      if (r.src === 'mo' && liveKeys[normId(r.bid)]) { serverLogged[normId(r.bid)] = r.logged; return; }
      rows.push(r);
    });
    batches.forEach(function (b) {
      rows.push(rowFromBatch(b, b.logged || serverLogged[b.key] || ''));
    });
    rows = rows.map(function (r, i) { return { r: r, i: i }; }).sort(function (a, b) {
      var x = a.r.logged || '9999-99-99';
      var y = b.r.logged || '9999-99-99';
      if (x === y) return a.i - b.i;
      return x < y ? 1 : -1;
    }).map(function (o) { return o.r; });

    var stats = { kg: 0, batches: rows.length, pieces: 0, open: 0 };
    rows.forEach(function (r) {
      stats.kg += isNaN(r.kg) ? 0 : r.kg;
      stats.pieces += isNaN(r.pieces) ? 0 : r.pieces;
      if (r.left > 0) stats.open += 1;
    });
    stats.kg = round3(stats.kg);
    return { rows: rows, stats: stats };
  }

  /* ---------------------------------- browser ---------------------------------- */

  function readRows(tbody) {
    return Array.prototype.map.call(tbody.querySelectorAll('tr'), function (tr) {
      var kg = parseNum(tr.getAttribute('data-kg'));
      var pieces = parseNum(tr.getAttribute('data-pieces'));
      var left = parseNum(tr.getAttribute('data-left'));
      return {
        src: tr.getAttribute('data-src') || '',
        bid: tr.getAttribute('data-bid') || '',
        logged: dateKey(tr.getAttribute('data-logged')),
        kg: isNaN(kg) ? 0 : kg,
        pieces: isNaN(pieces) ? 0 : pieces,
        left: isNaN(left) ? 0 : left,
        fibre: tr.cells && tr.cells[2] ? tr.cells[2].textContent.trim() : '',
        el: tr
      };
    });
  }

  function fetchJson(url) {
    return fetch(url, { credentials: 'same-origin' }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    });
  }

  function loadItems(src) {
    var sep = src.indexOf('?') === -1 ? '?' : '&';
    return fetchJson(src + sep + 'page=1').then(function (first) {
      var items = (first.items || []).slice();
      var pages = Math.max(1, parseInt(first.pages, 10) || 1);
      var jobs = [];
      for (var p = 2; p <= pages; p++) jobs.push(fetchJson(src + sep + 'page=' + p));
      return Promise.all(jobs).then(function (rest) {
        rest.forEach(function (d) { items = items.concat(d.items || []); });
        return items;
      });
    });
  }

  /*
    Totals for the home page and other pages ([data-yarn-total="kg|batches"] elements).
    batches: result of aggregate() on the light feed; history: [{bid, kg}] from the Yarn batch list.
    A list entry whose batch ID has products is replaced by the products, every other entry still counts.
  */
  function totalsFrom(batches, history) {
    var live = Object.create(null);
    var kg = 0;
    var n = 0;
    batches.forEach(function (b) { live[b.key] = true; kg += b.kg; n += 1; });
    (history || []).forEach(function (h) {
      if (live[normId(h.bid)]) return;
      var v = parseNum(h.kg);
      kg += isNaN(v) ? 0 : v;
      n += 1;
    });
    return { kg: round3(kg), batches: n };
  }

  function readHistory() {
    var el = document.querySelector('script[data-yarn-history]');
    if (!el) return null;
    var rows = [];
    try { rows = JSON.parse(el.textContent || '[]'); } catch (e) { rows = []; }
    return {
      src: el.getAttribute('data-src'),
      rows: rows.map(function (r) { return { bid: r[0], kg: r[1] }; })
    };
  }

  function initTotals() {
    var els = document.querySelectorAll('[data-yarn-total]');
    if (!els.length) return;
    var hist = readHistory();
    if (!hist || !hist.src) return;
    loadItems(hist.src).then(function (items) {
      var batches = aggregate(items);
      if (!batches.length) return; // nothing on the products yet: keep the server numbers
      var t = totalsFrom(batches, hist.rows);
      Array.prototype.forEach.call(els, function (el) {
        if (el.closest && el.closest('[data-yarn-band]')) return; // the band uses the tracker calculation
        var kind = el.getAttribute('data-yarn-total');
        if (kind === 'kg') showNumber(el, t.kg, fmtKgWhole);
        else if (kind === 'batches') showNumber(el, t.batches, fmtNumber);
      });
    }).catch(function () { /* keep the server numbers */ });
  }


  /*
    Summary blocks on other pages (Tracker band on About us): the same calculation as the tracker page.
    Loads the tracker page, reads its server rows, adds the live product feed with merge(), and fills
    [data-yarn-total="kg|batches|pieces|open"] and the latest rows in [data-yarn-log] inside [data-yarn-band].
  */
  function summaryFrom(url) {
    return fetch(url, { credentials: 'same-origin' }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.text();
    }).then(function (html) {
      var doc = new root.DOMParser().parseFromString(html, 'text/html');
      var host = doc.getElementById('yarn-tracker');
      var tbody = host && host.querySelector('table.tracker tbody');
      if (!host || !tbody) throw new Error('no tracker');
      var rows = readRows(tbody);
      return loadItems(host.getAttribute('data-src')).then(function (items) {
        return merge(rows, aggregate(items));
      });
    });
  }

  function initBands() {
    var bands = document.querySelectorAll('[data-yarn-band]');
    if (!bands.length) return;
    var url = bands[0].getAttribute('data-yarn-band');
    if (!url) return;
    summaryFrom(url).then(function (res) {
      Array.prototype.forEach.call(bands, function (band) {
        var st = res.stats;
        var map = { kg: [st.kg, fmtKgWhole], batches: [st.batches, fmtNumber], pieces: [st.pieces, fmtNumber], open: [st.open, fmtNumber] };
        Array.prototype.forEach.call(band.querySelectorAll('[data-yarn-total]'), function (el) {
          var m = map[el.getAttribute('data-yarn-total')];
          if (m) { el.setAttribute('data-band', '1'); showNumber(el, m[0], m[1]); }
        });
        var log = band.querySelector('[data-yarn-log]');
        if (!log) return;
        var n = parseInt(log.getAttribute('data-yarn-log'), 10) || 3;
        var real = res.rows.filter(function (r) { return r.src !== 'block'; }).slice(0, n);
        if (!real.length) return;
        log.innerHTML = real.map(function (r) {
          return '<div class="r"><span class="id">' + esc(r.bid) + '</span><span>' + esc(r.fibre || '') + '</span><span class="kg">' +
            fmtKg(r.kg) + '</span><span class="dt">' + (esc(showDate(r.logged)) || '') + '</span></div>';
        }).join('');
      });
    }).catch(function () { /* keep the server numbers */ });
  }

  function setStat(scope, name, value, format) {
    showNumber(scope.querySelector('[data-stat="' + name + '"]'), value, format);
  }

  function init() {
    var host = document.getElementById('yarn-tracker');
    if (!host || !window.fetch) return;
    var src = host.getAttribute('data-src');
    var tbody = host.querySelector('table.tracker tbody');
    if (!src || !tbody) return;
    host.setAttribute('aria-busy', 'true');
    loadItems(src).then(function (items) {
      var batches = aggregate(items);
      if (!batches.length) return;
      var res = merge(readRows(tbody), batches);
      var frag = document.createDocumentFragment();
      res.rows.forEach(function (r) {
        if (r.el) { frag.appendChild(r.el); return; }
        var t = document.createElement('tbody');
        t.innerHTML = r.html;
        frag.appendChild(t.firstElementChild);
      });
      tbody.textContent = '';
      tbody.appendChild(frag);
      var page = document.documentElement;
      setStat(page, 'kg', res.stats.kg, fmtKgWhole);
      setStat(page, 'batches', res.stats.batches, fmtNumber);
      setStat(page, 'pieces', res.stats.pieces, fmtNumber);
      setStat(page, 'open', res.stats.open, fmtNumber);
    }).catch(function () {
      /* keep the server-rendered rows */
    }).then(function () {
      host.removeAttribute('aria-busy');
    });
  }

  function start() {
    if (root.__echoYarnStarted) return; // the script may be included more than once
    root.__echoYarnStarted = true;
    init();
    initTotals();
    initBands();
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { aggregate: aggregate, merge: merge, totalsFrom: totalsFrom, parseNum: parseNum, dateKey: dateKey, showDate: showDate, fmtNumber: fmtNumber, fmtKg: fmtKg, fmtKgWhole: fmtKgWhole };
  } else if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
  }
})(this);
