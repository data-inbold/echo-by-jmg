/* EchoByJMG theme interactions. Mirrors the behaviour of the approved wireframe. */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };
  var R = (window.Echo && window.Echo.routes) || {};

  /* ---------- money, same format as the theme: "DKK 2,150" ---------- */
  function money(cents) {
    var cur = (window.Echo && window.Echo.currency) || 'DKK';
    var v = cents / 100;
    if (v % 1 !== 0) return cur + ' ' + v.toFixed(2);
    return cur + ' ' + Math.round(v).toLocaleString('en-US');
  }

  /* ---------- toast ---------- */
  function toast(msg) {
    var o = $('#overlays'); if (!o) return;
    var t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = msg;
    o.appendChild(t); setTimeout(function () { t.remove(); }, 2600);
  }
  window.EchoToast = toast;

  /* ---------- header menus ---------- */
  var hdr = $('header.site');
  function setMenu(name) {
    if (!hdr) return;
    ['mega', 'story', 'menu'].forEach(function (k) {
      var btn = $('[data-act="' + k + '"]', hdr), panel = $('[data-panel="' + k + '"]', hdr);
      var open = (k === name) && panel && panel.hidden;
      if (panel) panel.hidden = !open;
      if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }
  function closeMenus() { if (hdr) { $$('[data-panel]', hdr).forEach(function (p) { p.hidden = true; }); $$('[aria-expanded]', hdr).forEach(function (b) { b.setAttribute('aria-expanded', 'false'); }); } }

  /* Desktop: Shop and Our Story also open on hover (mouse only; touch keeps tap-to-open). */
  var hoverOpenedAt = 0;
  if (hdr && window.matchMedia && matchMedia('(hover: hover) and (pointer: fine)').matches) {
    var openT = null, closeT = null;
    var isOpen = function (k) { var p = $('[data-panel="' + k + '"]', hdr); return p && !p.hidden; };
    var showMenu = function (k) { if (!isOpen(k)) { setMenu(k); hoverOpenedAt = Date.now(); } };
    var cancel = function () { clearTimeout(openT); clearTimeout(closeT); };
    var scheduleClose = function () {
      clearTimeout(openT); clearTimeout(closeT);
      closeT = setTimeout(function () { if (isOpen('mega') || isOpen('story')) closeMenus(); }, 250);
    };
    ['mega', 'story'].forEach(function (k) {
      var btn = $('[data-act="' + k + '"]', hdr), panel = $('[data-panel="' + k + '"]', hdr);
      if (!btn || !panel) return;
      btn.addEventListener('mouseenter', function () {
        cancel();
        openT = setTimeout(function () { showMenu(k); }, (isOpen('mega') || isOpen('story')) ? 0 : 120);
      });
      btn.addEventListener('mouseleave', scheduleClose);
      panel.addEventListener('mouseenter', cancel);
      panel.addEventListener('mouseleave', scheduleClose);
    });
  }

  /* ---------- overlays: bag and search ---------- */
  var scrimHtml = '<div class="scrim" data-close></div>';
  function openBag() {
    var bag = $('#echo-bag'); if (!bag) return;
    closeMenus(); closeSearch();
    bag.hidden = false; document.documentElement.style.overflow = 'hidden';
    var x = $('.drawer .x', bag); if (x) x.focus();
  }
  function closeBag() { var bag = $('#echo-bag'); if (bag) bag.hidden = true; document.documentElement.style.overflow = ''; }
  function openSearch() {
    var s = $('#echo-search'); if (!s) return;
    closeMenus(); closeBag(); s.hidden = false; document.documentElement.style.overflow = 'hidden';
    var inp = $('#s-q'); if (inp) { inp.focus(); inp.select(); }
  }
  function closeSearch() { var s = $('#echo-search'); if (s) s.hidden = true; document.documentElement.style.overflow = ''; }
  function closeOverlays() { closeBag(); closeSearch(); }

  /* ---------- cart (Shopify Ajax API) ---------- */
  function refreshBag(open) {
    return fetch(R.root.replace(/\/$/, '') + '/?sections=echo-bag', { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var html = data['echo-bag']; if (!html) return;
        var tmp = document.createElement('div'); tmp.innerHTML = html;
        var fresh = $('#echo-bag', tmp), cur = $('#echo-bag');
        if (fresh && cur) { var wasOpen = !cur.hidden; cur.innerHTML = fresh.innerHTML; cur.hidden = !(open || wasOpen); }
        var cnt = fresh ? fresh.getAttribute('data-count') : null;
        if (cnt !== null) $$('[data-bag-count]').forEach(function (el) { el.textContent = cnt; });
        $$('[data-bag-label]').forEach(function (el) { el.setAttribute('aria-label', 'Bag, ' + cnt + ' items'); });
        if (open) openBag();
        if (document.body.classList.contains('template-cart')) location.reload();
      });
  }
  function post(url, body) {
    return fetch(url + '.js', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw j; return j; }); });
  }
  function addToBag(items) {
    return post(R.cartAdd, { items: items }).then(function () { return refreshBag(true); })
      .catch(function (e) { toast((e && (e.description || e.message)) || 'Could not add to bag.'); });
  }
  function changeLine(line, qty) { return post(R.cartChange, { line: line, quantity: qty }).then(function () { return refreshBag(true); }); }
  function applyCode(box) {
    var inp = $('input', box), msg = $('[data-dcmsg]', box), v = (inp.value || '').trim();
    if (!v) return;
    fetch(R.cart + '.js', { credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (cart) {
      var codes = (cart.discount_codes || []).map(function (d) { return d.code; });
      if (codes.indexOf(v) === -1) codes.push(v);
      return post(R.cartUpdate, { discount: codes.join(',') });
    }).then(function (cart) {
      var hit = (cart.discount_codes || []).filter(function (d) { return d.code.toUpperCase() === v.toUpperCase(); })[0];
      if (hit && !hit.applicable) { msg.textContent = 'That code is not valid for this bag. Check the spelling, or contact us.'; msg.style.color = '#A3392B'; return; }
      return refreshBag(!!$('.drawer', box.closest('#echo-bag') || document));
    }).catch(function () { msg.textContent = 'That code is not valid. Check the spelling, or contact us.'; msg.style.color = '#A3392B'; });
  }
  function removeCode(code) {
    fetch(R.cart + '.js', { credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (cart) {
      var codes = (cart.discount_codes || []).map(function (d) { return d.code; }).filter(function (c) { return c !== code; });
      return post(R.cartUpdate, { discount: codes.join(',') });
    }).then(function () { refreshBag(true); });
  }

  /* ---------- search (predictive) ---------- */
  var sTimer;
  function runSearch(q) {
    var res = $('#s-res'), pop = $('#s-popular'); if (!res) return;
    q = q.trim();
    if (!q) { res.innerHTML = ''; if (pop) pop.hidden = false; return; }
    if (pop) pop.hidden = true;
    clearTimeout(sTimer);
    sTimer = setTimeout(function () {
      fetch(R.predictive + '?q=' + encodeURIComponent(q) + '&resources[type]=product&resources[limit]=10&section_id=echo-predictive', { credentials: 'same-origin' })
        .then(function (r) { return r.text(); })
        .then(function (html) {
          var tmp = document.createElement('div'); tmp.innerHTML = html;
          var inner = $('[data-predictive]', tmp); res.innerHTML = inner ? inner.innerHTML : '';
        });
    }, 180);
  }

  /* ---------- hero rotation (every 5 s, pauses on hover/focus) ---------- */
  function initHero() {
    var hero = $('#hero'); if (!hero) return;
    var slides = $$('[data-slide]', hero); if (slides.length < 2) return;
    var cta = $('#hero-cta'), media = $('#hero-media'), i = 0, paused = false;
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    hero.addEventListener('mouseenter', function () { paused = true; });
    hero.addEventListener('mouseleave', function () { paused = false; });
    setInterval(function () {
      if (paused || document.hidden || hero.contains(document.activeElement)) return;
      var next = (i + 1) % slides.length;
      media.classList.add('fading');
      setTimeout(function () {
        slides[i].hidden = true; slides[next].hidden = false; i = next;
        if (cta) { cta.href = slides[i].getAttribute('data-url'); cta.textContent = slides[i].getAttribute('data-cta'); }
        $$('[data-tab]', hero).forEach(function (t) { if (+t.getAttribute('data-tab') === i) t.setAttribute('aria-current', 'true'); else t.removeAttribute('aria-current'); });
        media.classList.remove('fading');
      }, reduce ? 0 : 250);
    }, 5000);
  }

  /* ---------- collection filters (colour family, last pieces) ---------- */
  var shop = { fam: '', last: false };
  function applyShop() {
    var grid = $('[data-shop-grid]'); if (!grid) return;
    var cards = $$('.card[data-family]', grid), n = 0, tile = $('.edit-tile', grid);
    cards.forEach(function (c) {
      var fams = (c.getAttribute('data-family') || '').split(/\s+/);
      var ok = (!shop.fam || fams.indexOf(shop.fam) > -1) && (!shop.last || c.getAttribute('data-state') === 'last');
      if (ok) { c.removeAttribute('data-hidden'); n++; } else c.setAttribute('data-hidden', '');
    });
    if (tile) {
      var vis = cards.filter(function (c) { return !c.hasAttribute('data-hidden'); });
      if (vis.length > 4) { vis[3].after(tile); tile.hidden = false; } else tile.hidden = true;
    }
    var cnt = $('[data-shop-count]'); if (cnt) cnt.textContent = n + ' product' + (n === 1 ? '' : 's');
    var empty = $('[data-shop-empty]'); if (empty) { empty.hidden = n > 0; grid.hidden = n === 0; }
    $$('[data-fam]').forEach(function (b) { b.setAttribute('aria-pressed', (b.getAttribute('data-fam') === shop.fam) ? 'true' : 'false'); });
    $$('[data-last]').forEach(function (b) { b.setAttribute('aria-pressed', shop.last ? 'true' : 'false'); });
  }

  /* ---------- gift finder ---------- */
  var gift = { budget: '', occ: '' };
  function applyGifts() {
    var grid = $('[data-gift-grid]'); if (!grid) return;
    var occBtn = gift.occ ? $('[data-occ="' + gift.occ + '"]') : null;
    var list = occBtn ? (occBtn.getAttribute('data-handles') || '').split(',') : null;
    var cards = $$('.card[data-handle]', grid), n = 0;
    cards.forEach(function (c, idx) {
      var p = +c.getAttribute('data-price') / 100, grp = (c.getAttribute('data-group') || c.getAttribute('data-handle')).split(' ');
      var okB = !gift.budget || (gift.budget === 'u700' && p < 700) || (gift.budget === '700' && p >= 700 && p <= 1000) || (gift.budget === '1000' && p > 1000);
      var okO = !list || grp.some(function (h) { return list.indexOf(h) > -1; });
      var ok = okB && okO && (gift.budget || gift.occ || c.hasAttribute('data-popular'));
      if (ok) { c.removeAttribute('data-hidden'); n++; } else c.setAttribute('data-hidden', '');
    });
    var t = $('[data-gift-title]'); if (t) t.textContent = (gift.budget || gift.occ) ? 'Gift ideas' : 'Popular gifts';
    $$('[data-clear-gift]').forEach(function (b) { b.hidden = !(gift.budget || gift.occ); });
    var empty = $('[data-gift-empty]'); if (empty) { empty.hidden = n > 0; grid.hidden = n === 0; }
    $$('[data-budget]').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-budget') === gift.budget ? 'true' : 'false'); });
    $$('[data-occ]').forEach(function (b) {
      var on = b.getAttribute('data-occ') === gift.occ; b.setAttribute('aria-pressed', on ? 'true' : 'false');
      var nm = $('.name', b); if (nm) { nm.style.textDecoration = on ? 'underline' : ''; nm.textContent = nm.getAttribute('data-label') + (on ? ' ✓' : ''); }
    });
  }

  /* ---------- help search ---------- */
  var help = { q: '', topic: '' };
  function applyHelp() {
    var box = $('#faq-results'); if (!box) return;
    var q = help.q.toLowerCase(), any = 0;
    $$('[data-topic-group]', box).forEach(function (g) {
      var t = g.getAttribute('data-topic-group'), shown = 0;
      $$('details.acc', g).forEach(function (d) {
        var ok = (!help.topic || help.topic === t) && (!q || d.textContent.toLowerCase().indexOf(q) > -1);
        d.hidden = !ok; if (ok) shown++;
      });
      g.hidden = shown === 0; any += shown;
    });
    var none = $('[data-faq-none]'); if (none) { none.hidden = any > 0; var qq = $('[data-faq-q]', none); if (qq) qq.textContent = help.q; }
    $$('[data-topic]').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-topic') === help.topic ? 'true' : 'false'); });
  }

  /* ---------- product page ---------- */
  function pdpQty(d) {
    var f = $('[data-pdp-form]'); if (!f) return;
    var inp = $('input[name="quantity"]', f), out = $('[data-qty-out]', f);
    var v = Math.max(1, (+inp.value || 1) + d); inp.value = v; if (out) out.textContent = v;
  }
  function pdpThumb(btn) {
    var g = btn.closest('.gallery'); if (!g) return;
    var idx = +btn.getAttribute('data-img');
    $$('[data-main]', g).forEach(function (m) { m.hidden = (+m.getAttribute('data-main') !== idx); });
    $$('[data-img]', g).forEach(function (b) { b.setAttribute('aria-pressed', b === btn ? 'true' : 'false'); });
  }

  /* ---------- returns steps ---------- */
  function retStep(n) {
    var box = $('[data-returns]'); if (!box) return;
    $$('[data-ret-step]', box).forEach(function (s) { s.hidden = +s.getAttribute('data-ret-step') !== n; });
    $$('[data-ret-label]', box).forEach(function (s) { s.style.color = +s.getAttribute('data-ret-label') === n ? 'var(--ink)' : ''; });
  }

  /* ---------- events ---------- */
  document.addEventListener('click', function (e) {
    var t = e.target;
    var a = t.closest('a[href^="#"]');
    if (a && a.getAttribute('href').length > 1) {
      var el = document.getElementById(a.getAttribute('href').slice(1));
      if (el) { e.preventDefault(); el.scrollIntoView({ behavior: 'smooth' }); return; }
    }
    if (t.closest('[data-close]')) { e.preventDefault(); closeOverlays(); return; }
    if (t.closest('[data-toast]')) { e.preventDefault(); toast(t.closest('[data-toast]').getAttribute('data-toast')); return; }
    var b = t.closest('button,[data-act]');
    if (!b) { if (hdr && !hdr.contains(t)) closeMenus(); return; }
    var act = b.getAttribute('data-act');
    if (act === 'mega' || act === 'story' || act === 'menu') {
      e.preventDefault();
      // A click right after hover opened this menu should keep it open, not toggle it shut.
      if (act !== 'menu' && Date.now() - hoverOpenedAt < 600) return;
      setMenu(act); return;
    }
    if (act === 'bag') { e.preventDefault(); openBag(); return; }
    if (act === 'search') { e.preventDefault(); openSearch(); return; }
    if (b.hasAttribute('data-lq')) { e.preventDefault(); changeLine(+b.getAttribute('data-line'), Math.max(0, +b.getAttribute('data-q') + (+b.getAttribute('data-lq')))); return; }
    if (b.hasAttribute('data-rm')) { e.preventDefault(); changeLine(+b.getAttribute('data-rm'), 0); return; }
    if (b.hasAttribute('data-applycode')) { e.preventDefault(); applyCode(b.closest('[data-dcbox]')); return; }
    if (b.hasAttribute('data-rmcode')) { e.preventDefault(); removeCode(b.getAttribute('data-rmcode')); return; }
    if (b.hasAttribute('data-fam')) { shop.fam = b.getAttribute('data-fam'); if (!shop.fam) shop.last = false; applyShop(); return; }
    if (b.hasAttribute('data-last')) { shop.last = !shop.last; applyShop(); return; }
    if (b.hasAttribute('data-qty')) { e.preventDefault(); pdpQty(+b.getAttribute('data-qty')); return; }
    if (b.hasAttribute('data-img')) { e.preventDefault(); pdpThumb(b); return; }
    if (b.hasAttribute('data-amount')) {
      e.preventDefault();
      var f = b.closest('form'), id = $('input[name="id"]', f); id.value = b.getAttribute('data-amount');
      $$('[data-amount]', f).forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
      var pr = $('[data-gc-price]'); if (pr) pr.textContent = b.getAttribute('data-label'); return;
    }
    if (b.hasAttribute('data-budget')) { var v = b.getAttribute('data-budget'); gift.budget = gift.budget === v ? '' : v; applyGifts(); return; }
    if (b.hasAttribute('data-occ')) { var o = b.getAttribute('data-occ'); gift.occ = gift.occ === o ? '' : o; applyGifts(); return; }
    if (b.hasAttribute('data-clear-gift')) { gift = { budget: '', occ: '' }; applyGifts(); return; }
    if (b.hasAttribute('data-topic')) { help.topic = b.getAttribute('data-topic'); applyHelp(); return; }
    if (b.hasAttribute('data-retback')) { retStep(0); return; }
    if (b.hasAttribute('data-ret-next')) {
      var box = b.closest('[data-ret-step]'), ok = true;
      $$('input', box).forEach(function (inp) { inp.required = true; if (!inp.reportValidity()) ok = false; inp.required = false; });
      if (ok) retStep(1); return;
    }
    if (b.hasAttribute('data-retreset')) { retStep(0); return; }
  });

  document.addEventListener('submit', function (e) {
    var f = e.target;
    if (f.hasAttribute('data-pdp-form')) {
      if (e.submitter && e.submitter.hasAttribute('data-buynow')) return; /* native post, then checkout */
      e.preventDefault();
      var fd = new FormData(f);
      addToBag([{ id: +fd.get('id'), quantity: +(fd.get('quantity') || 1) }]);
      return;
    }
    if (f.hasAttribute('data-gc-form')) { e.preventDefault(); var r = $('[data-gc-result]'); if (r) r.hidden = false; return; }
    if (f.hasAttribute('data-goto')) {
      e.preventDefault(); location.href = f.getAttribute('data-goto'); return;
    }
  });

  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t.id === 'sort') { var u = new URL(location.href); u.searchParams.set('sort_by', t.value); location.href = u.toString(); }
    if (t.hasAttribute('data-autosubmit')) t.form.submit();
  });

  document.addEventListener('input', function (e) {
    if (e.target.id === 's-q') runSearch(e.target.value);
    if (e.target.id === 'faq-q') { help.q = e.target.value; applyHelp(); }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target.classList && e.target.classList.contains('dc')) { e.preventDefault(); applyCode(e.target.closest('[data-dcbox]')); return; }
    if (e.key === 'Escape') { closeOverlays(); closeMenus(); }
  });

  function init() {
    initHero();
    if ($('[data-shop-grid]')) applyShop();
    if ($('[data-gift-grid]')) applyGifts();
    if ($('#faq-results')) {
      var m = location.hash.match(/^#topic-(.+)$/);
      if (m) help.topic = decodeURIComponent(m[1]);
      applyHelp();
    }
    if (location.hash === '#bag') openBag();
    $$('form[data-returns-form]').forEach(function (f) { if (f.querySelector('.ok')) retStep(2); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.EchoBag = { open: openBag, refresh: refreshBag, add: addToBag };
})();
