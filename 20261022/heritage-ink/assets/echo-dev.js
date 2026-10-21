/* EchoByJMG dev menu: dev log + feedback. Shown only on unpublished themes (previews) and in the theme editor. */
(function () {
  var dataEl = document.getElementById('echo-dev-data');
  if (!dataEl) return;
  var data;
  try { data = JSON.parse(dataEl.textContent); } catch (e) { return; }
  var role = window.Shopify && Shopify.theme && Shopify.theme.role;
  if (role === 'main' && !data.designMode) return;

  var store = {
    get: function (k) { try { return localStorage.getItem('echoDev.' + k) || ''; } catch (e) { return ''; } },
    set: function (k, v) { try { localStorage.setItem('echoDev.' + k, v); } catch (e) {} }
  };
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmtDate(d) {
    var t = new Date(d);
    if (isNaN(t)) return esc(d);
    return t.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) +
      (String(d).length > 10 ? ' ' + t.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '');
  }
  var pagePath = (function () {
    var u = new URL(location.href);
    ['preview_theme_id', '_ab', '_fd', '_sc', 'key', 'oseid'].forEach(function (k) { u.searchParams.delete(k); });
    return u.pathname + (u.searchParams.toString() ? '?' + u.searchParams.toString() : '');
  })();

  /* ---------- shell ---------- */
  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'edev-btn';
  btn.setAttribute('aria-expanded', 'false');
  btn.setAttribute('aria-controls', 'edev-panel');
  btn.textContent = 'DEV';

  var panel = document.createElement('aside');
  panel.id = 'edev-panel';
  panel.className = 'edev-panel';
  panel.hidden = true;
  panel.setAttribute('aria-label', 'Dev menu');
  panel.innerHTML =
    '<div class="edev-head">' +
      '<div class="edev-tabs" role="tablist">' +
        '<button type="button" role="tab" data-tab="log" aria-selected="true">Dev log</button>' +
        '<button type="button" role="tab" data-tab="fb" aria-selected="false">Feedback</button>' +
      '</div>' +
      '<button type="button" class="edev-x" aria-label="Close dev menu">×</button>' +
    '</div>' +
    '<div class="edev-body" data-pane="log"></div>' +
    '<div class="edev-body" data-pane="fb" hidden></div>' +
    '<div class="edev-foot">Preview only · ' + esc(data.template || '') + ' · theme ' + esc((window.Shopify && Shopify.theme && Shopify.theme.id) || '') + '</div>';

  document.body.appendChild(btn);
  document.body.appendChild(panel);

  function open(on) {
    panel.hidden = !on;
    btn.setAttribute('aria-expanded', on ? 'true' : 'false');
    store.set('open', on ? '1' : '');
    if (on && currentTab === 'fb') loadList();
  }
  btn.addEventListener('click', function () { open(panel.hidden); });
  panel.querySelector('.edev-x').addEventListener('click', function () { open(false); btn.focus(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !panel.hidden) { open(false); btn.focus(); } });

  var currentTab = store.get('tab') || 'log';
  function showTab(t) {
    currentTab = t;
    store.set('tab', t);
    panel.querySelectorAll('[role=tab]').forEach(function (b) { b.setAttribute('aria-selected', b.dataset.tab === t ? 'true' : 'false'); });
    panel.querySelectorAll('[data-pane]').forEach(function (p) { p.hidden = p.dataset.pane !== t; });
    if (t === 'fb' && !panel.hidden) loadList();
  }
  panel.querySelectorAll('[role=tab]').forEach(function (b) { b.addEventListener('click', function () { showTab(b.dataset.tab); }); });

  /* ---------- dev log ---------- */
  var logPane = panel.querySelector('[data-pane=log]');
  logPane.innerHTML = (data.log || []).map(function (r) {
    return '<section class="edev-rel"><div class="edev-rel-h"><b>v' + esc(r.v) + ' · ' + esc(r.title) + '</b><span>' + fmtDate(r.date) + '</span></div><ul>' +
      (r.items || []).map(function (i) {
        return '<li><span class="edev-tag edev-' + esc(String(i.type).toLowerCase()) + '">' + esc(i.type) + '</span>' + esc(i.text) + '</li>';
      }).join('') + '</ul></section>';
  }).join('') || '<p class="edev-muted">No entries yet.</p>';

  /* ---------- feedback ---------- */
  var fbPane = panel.querySelector('[data-pane=fb]');
  var url = (data.feedbackUrl || '').trim();
  if (!url) {
    fbPane.innerHTML = '<p class="edev-muted">Feedback isn’t connected yet. Add the web app URL in Theme settings › EchoByJMG › Feedback web app URL.</p>';
  } else {
    fbPane.innerHTML =
      '<form class="edev-form" novalidate>' +
        '<div class="edev-row">' +
          '<label>Your name<input name="name" required autocomplete="name"></label>' +
          '<label>Team<select name="team"><option>Client</option><option>Digital team</option></select></label>' +
        '</div>' +
        '<label>Type<select name="type"><option>Bug</option><option>Design</option><option>Content</option><option>Idea</option><option>Question</option></select></label>' +
        '<label>Comment<textarea name="message" rows="4" required maxlength="2000" placeholder="What should change, and where on the page?"></textarea></label>' +
        '<input name="website" tabindex="-1" autocomplete="off" class="edev-hp" aria-hidden="true">' +
        '<div class="edev-page">Page: <code>' + esc(pagePath) + '</code></div>' +
        '<button type="submit" class="edev-send">Send feedback</button>' +
        '<p class="edev-msg" role="status" aria-live="polite"></p>' +
      '</form>' +
      '<div class="edev-list-h"><b>Recent feedback</b><label class="edev-filter"><input type="checkbox" data-this-page> This page only</label></div>' +
      '<div class="edev-list"><p class="edev-muted">Loading…</p></div>';

    var form = fbPane.querySelector('form');
    var msg = fbPane.querySelector('.edev-msg');
    form.name.value = store.get('name');
    form.team.value = store.get('team') || 'Client';
    var thisPage = fbPane.querySelector('[data-this-page]');
    thisPage.checked = store.get('thisPage') === '1';
    thisPage.addEventListener('change', function () { store.set('thisPage', thisPage.checked ? '1' : ''); renderList(); });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      msg.textContent = '';
      if (!form.name.value.trim() || !form.message.value.trim()) {
        msg.textContent = 'Add your name and a comment.';
        (form.name.value.trim() ? form.message : form.name).focus();
        return;
      }
      store.set('name', form.name.value.trim());
      store.set('team', form.team.value);
      var payload = JSON.stringify({
        name: form.name.value.trim(), team: form.team.value, type: form.type.value,
        message: form.message.value.trim(), page: pagePath, website: form.website.value,
        viewport: window.innerWidth + '×' + window.innerHeight,
        theme: String((window.Shopify && Shopify.theme && Shopify.theme.id) || ''),
        template: data.template || ''
      });
      var send = form.querySelector('.edev-send');
      send.disabled = true;
      send.textContent = 'Sending…';
      function done(ok) {
        send.disabled = false;
        send.textContent = 'Send feedback';
        if (ok) {
          form.message.value = '';
          msg.textContent = 'Thanks, sent. It appears in the list below.';
          setTimeout(loadList, 800);
        } else {
          msg.textContent = 'Could not send. Check your connection and try again.';
        }
      }
      fetch(url, { method: 'POST', body: payload })
        .then(function (r) { return r.json(); })
        .then(function (j) { done(j && j.ok); })
        .catch(function () {
          // Some browsers block reading the reply; send blind and trust the sheet.
          fetch(url, { method: 'POST', mode: 'no-cors', body: payload }).then(function () { done(true); }, function () { done(false); });
        });
    });
  }

  var items = null, loading = false;
  function loadList() {
    if (!url || loading) return;
    loading = true;
    fetch(url + (url.indexOf('?') > -1 ? '&' : '?') + 'action=list')
      .then(function (r) { return r.json(); })
      .then(function (j) { items = (j && j.items) || []; renderList(); })
      .catch(function () { fbPane.querySelector('.edev-list').innerHTML = '<p class="edev-muted">Could not load feedback.</p>'; })
      .then(function () { loading = false; });
  }
  function renderList() {
    if (!items) return;
    var list = fbPane.querySelector('.edev-list');
    var shown = thisPageOnly() ? items.filter(function (i) { return i.page === pagePath; }) : items;
    list.innerHTML = shown.length ? shown.map(function (i) {
      var st = String(i.status || 'New');
      return '<article class="edev-item">' +
        '<div class="edev-item-h"><b>' + esc(i.name) + '</b> <span class="edev-muted">' + esc(i.team) + ' · ' + esc(i.type) + '</span>' +
        '<span class="edev-status edev-st-' + esc(st.toLowerCase().replace(/[^a-z]+/g, '-')) + '">' + esc(st) + '</span></div>' +
        '<p>' + esc(i.message) + '</p>' +
        (i.reply ? '<p class="edev-reply"><b>Reply:</b> ' + esc(i.reply) + '</p>' : '') +
        '<div class="edev-muted edev-meta">' + fmtDate(i.date) + ' · <a href="' + esc(i.page) + '">' + esc(i.page) + '</a></div>' +
        '</article>';
    }).join('') : '<p class="edev-muted">' + (thisPageOnly() ? 'No feedback on this page yet.' : 'No feedback yet.') + '</p>';
  }
  function thisPageOnly() { var c = fbPane.querySelector('[data-this-page]'); return c && c.checked; }

  showTab(currentTab);
  if (store.get('open') === '1') open(true);
})();
