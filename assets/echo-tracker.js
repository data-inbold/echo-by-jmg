/*
  Rescued yarn tracker: live batches built from the products.
  The server already renders the rows from the "Yarn batch" list (history). This script loads the product
  feed (templates/collection.yarn-data.liquid, 50 products per page), groups the products by batch, adds up
  kg, pieces and live stock per batch, replaces any list row with the same batch ID, sorts everything by
  logged date (newest first) and updates the four numbers at the top.
  If anything fails, the server-rendered rows stay as they are.
*/
(function (root) {
  'use strict';

  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

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
    if (b.left <= 0) return '<span class="tstat closed">Closed</span>';
    if (b.last) return '<span class="tstat last">Last pieces</span>';
    return '<span class="tstat">Open · ' + b.left + ' left</span>';
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
      '<td class="num">' + fmtNum(b.kg) + ' kg</td>' +
      '<td>' + links + '</td>' +
      '<td class="num">' + b.pieces + '</td>' +
      '<td>' + statusHtml(b) + '</td></tr>';
    return { src: 'live', bid: b.id, logged: logged, kg: b.kg, pieces: b.pieces, left: b.left, html: html };
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

  function setStat(root, name, text) {
    var el = root.querySelector('[data-stat="' + name + '"]');
    if (el) el.textContent = text;
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
      setStat(page, 'kg', fmtNum(res.stats.kg) + ' kg');
      setStat(page, 'batches', String(res.stats.batches));
      setStat(page, 'pieces', String(res.stats.pieces));
      setStat(page, 'open', String(res.stats.open));
    }).catch(function () {
      /* keep the server-rendered rows */
    }).then(function () {
      host.removeAttribute('aria-busy');
    });
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { aggregate: aggregate, merge: merge, parseNum: parseNum, dateKey: dateKey, showDate: showDate };
  } else if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  }
})(this);
