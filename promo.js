/* Blok Dunyo — promokodlar. index.html yonida turadi. */
(function () {
  'use strict';
  var PROMO_KEY = 'blokdunyo:promos';
  var CODES = { BLOKDUNYO: 100, DOBRO: 50, USTA2026: 250 };

  function readUsed() {
    try { var a = JSON.parse(localStorage.getItem(PROMO_KEY) || '[]'); return Array.isArray(a) ? a : []; }
    catch (e) { return []; }
  }
  function writeUsed(list) { try { localStorage.setItem(PROMO_KEY, JSON.stringify(list)); } catch (e) {} }
  function currentCoins() { try { return (typeof coins === 'number') ? coins : null; } catch (e) { return null; } }
  function syncHeader() {
    var c = document.getElementById('coins'), n = currentCoins();
    if (c && n !== null) c.textContent = '\u25ce ' + n;
    var b = document.querySelector('#pg-home .me small');
    if (b && n !== null) b.textContent = '\u25ce ' + n + ' tanga';
  }
  function redeem(raw) {
    var code = String(raw || '').trim().toUpperCase().replace(/\s+/g, '');
    if (!code) return { ok: false, msg: 'Promokodni yozing' };
    if (readUsed().indexOf(code) !== -1) return { ok: false, msg: 'Bu promokod allaqachon ishlatilgan' };
    if (!Object.prototype.hasOwnProperty.call(CODES, code)) return { ok: false, msg: 'Bunday promokod topilmadi' };
    if (currentCoins() === null) return { ok: false, msg: 'Ilova hali yuklanmadi, sahifani yangilang' };
    var used = readUsed(); used.push(code); writeUsed(used);
    coins = coins + CODES[code];
    if (typeof save === 'function') save();
    syncHeader();
    return { ok: true, msg: 'Tayyor! \u25ce ' + CODES[code] + ' tanga qo\u02bbshildi' };
  }
  function addStyle() {
    if (document.getElementById('promo-css')) return;
    var st = document.createElement('style');
    st.id = 'promo-css';
    st.textContent =
      '.promo{background:var(--surface);border-radius:16px;padding:14px;margin:14px 0 6px;box-shadow:0 1px 3px rgba(0,0,0,.08)}' +
      '.promo b{display:block;font-size:15px;margin-bottom:8px}' +
      '.promo .prow{display:flex;gap:8px;align-items:center}' +
      '.promo .prow input{flex:1;min-width:0;border:1px solid #dfe3e8;border-radius:10px;padding:10px 12px;font:inherit;background:var(--bg);color:inherit}' +
      '.promo .prow input:focus{outline:2px solid var(--accent,#3db8a5);outline-offset:1px}' +
      '.promo .prow .btn{white-space:nowrap}' +
      '.promo .pm{font-size:13px;margin-top:8px;min-height:16px;color:var(--muted)}' +
      '.promo .pm.ok{color:#1f8a6d}' +
      '.promo .pm.bad{color:#c23d3d}';
    document.head.appendChild(st);
  }
  function build() {
    var home = document.getElementById('pg-home');
    if (!home) return null;
    var old = home.querySelector('.promo');
    if (old) return old;
    var box = document.createElement('div');
    box.className = 'promo';
    box.innerHTML =
      '<b>Promokod</b><div class="prow">' +
      '<input id="pcode" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="24" placeholder="Masalan: BLOKDUNYO" aria-label="Promokod">' +
      '<button class="btn" type="button" data-a="promo">Olish</button></div>' +
      '<div class="pm" id="pmsg" role="status"></div>';
    var me = home.querySelector('.me');
    if (me && me.parentNode === home) me.insertAdjacentElement('afterend', box);
    else home.insertBefore(box, home.firstChild);
    return box;
  }
  function submit() {
    var input = document.getElementById('pcode'), out = document.getElementById('pmsg');
    if (!input || !out) return;
    var r = redeem(input.value);
    out.textContent = r.msg;
    out.className = 'pm ' + (r.ok ? 'ok' : 'bad');
    if (r.ok) input.value = '';
  }
  addStyle();
  var origRenderHome = window.renderHome;
  if (typeof origRenderHome === 'function') {
    window.renderHome = function () { var o = origRenderHome.apply(this, arguments); addStyle(); build(); return o; };
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('[data-a="promo"]') : null;
    if (b) { e.preventDefault(); submit(); }
  });
  document.addEventListener('keydown', function (e) {
    if (e.target && e.target.id === 'pcode' && e.key === 'Enter') { e.preventDefault(); submit(); }
  });
  var homeEl = document.getElementById('pg-home');
  if (homeEl && !homeEl.classList.contains('off')) build();
})();
