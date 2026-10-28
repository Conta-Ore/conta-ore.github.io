/* Conta Ore · Salva turni */
(async function () {
  'use strict';
  var VERSIONE = '2026.10.28-3';
  var SCRIPT = document.currentScript && document.currentScript.src ? new URL(document.currentScript.src) : null;
  var SITO = SCRIPT ? SCRIPT.origin + SCRIPT.pathname.replace(/[^/]*$/, '') : null;
  var LIB = SITO ? SITO + 'lib/html-to-image.js' : 'https://cdn.jsdelivr.net/npm/html-to-image@1.11.13/dist/html-to-image.js';
  if (window.__salvaTurniAttivo) return;
  window.__salvaTurniAttivo = true;

  var due = function (n) { return (n < 10 ? '0' : '') + n; };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var aspetta = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var GG = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];
  var giornoBreve = function (d) { var x = new Date(d + 'T12:00:00'); return GG[x.getDay()] + ' ' + String(d).slice(8, 10) + '/' + String(d).slice(5, 7); };
  var oraSola = function (t) { return t.tipoGiornata === 'TURNO' ? t.oraInizio + ' – ' + t.oraFine : String(t.tipoGiornata || '').toLowerCase(); };
  var oreTurno = function (t) { return t.minutiTurno ? String(t.minutiTurno / 60).replace('.', ',') + ' h' : ''; };
  function isoLocale(d) {
    var off = -d.getTimezoneOffset();
    return d.getFullYear() + '-' + due(d.getMonth() + 1) + '-' + due(d.getDate()) + 'T' + due(d.getHours()) + ':' + due(d.getMinutes()) + ':' +
      due(d.getSeconds()) + (off >= 0 ? '+' : '-') + due(Math.floor(Math.abs(off) / 60)) + ':' + due(Math.abs(off) % 60);
  }
  async function sha256(testo) {
    try {
      var h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(testo));
      return Array.prototype.map.call(new Uint8Array(h), function (b) { return (b < 16 ? '0' : '') + b.toString(16); }).join('');
    } catch (e) { return null; }
  }

  var barra = document.createElement('div');
  barra.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:2147483647;background:#111;color:#fff;font:600 15px/1.4 system-ui,sans-serif;padding:12px 14px;text-align:center';
  var stato = function (t) { barra.textContent = t; if (!barra.parentNode) document.documentElement.appendChild(barra); };
  var fineStato = function () { if (barra.parentNode) barra.remove(); };

  function propsInMemoria() {
    var els = document.querySelectorAll('body *');
    for (var i = 0; i < els.length; i++) {
      var k = Object.keys(els[i]).find(function (x) { return x.indexOf('__reactFiber') === 0; });
      if (!k) continue;
      var f = els[i][k]; while (f.return) f = f.return;
      var pila = [f];
      while (pila.length) {
        var x = pila.pop(), p = x.memoizedProps;
        if (p && Array.isArray(p.turni)) return p;
        if (x.child) pila.push(x.child);
        if (x.sibling) pila.push(x.sibling);
      }
      return null;
    }
    return null;
  }
  function leggiPagina(html) {
    var s = '', re = /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g, m;
    while ((m = re.exec(html))) { try { s += JSON.parse(m[1]); } catch (e) { /* pezzo non testuale */ } }
    function arrayDopo(chiave) {
      var i = s.indexOf('"' + chiave + '":['); if (i < 0) return null;
      i = s.indexOf('[', i);
      var d = 0, inStr = false, sc = false;
      for (var j = i; j < s.length; j++) {
        var c = s[j];
        if (inStr) { if (sc) sc = false; else if (c === '\\') sc = true; else if (c === '"') inStr = false; continue; }
        if (c === '"') inStr = true; else if (c === '[') d++; else if (c === ']') { d--; if (d === 0) { try { return JSON.parse(s.slice(i, j + 1)); } catch (e) { return null; } } }
      }
      return null;
    }
    function valore(chiave) { var m2 = s.match(new RegExp('"' + chiave + '":"([^"]*)"')); return m2 ? m2[1] : null; }
    return { turni: arrayDopo('turni'), alias: valore('alias'), thisMonday: valore('thisMonday'), nextMonday: valore('nextMonday') };
  }

  function scriviSullaPagina(turni, testa) {
    var vecchi = document.querySelectorAll('[data-salva-turni]');
    for (var v = 0; v < vecchi.length; v++) vecchi[v].remove();
    var perGiorno = {};
    turni.forEach(function (t) { if (t.tipoGiornata === 'TURNO') (perGiorno[t.data] = perGiorno[t.data] || []).push(t); });
    var mostrati = {}, contatore = {};
    Array.prototype.filter.call(document.querySelectorAll('button'), function (b) { return /vedi orario/i.test(b.innerText); }).forEach(function (b) {
      var k = Object.keys(b).find(function (x) { return x.indexOf('__reactFiber') === 0; });
      var f = k ? b[k] : null, data = null;
      while (f) { if (typeof f.key === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(f.key)) { data = f.key; break; } f = f.return; }
      if (!data || !perGiorno[data]) return;
      var n = contatore[data] = (contatore[data] || 0) + 1, t = perGiorno[data][n - 1];
      if (!t) return;
      mostrati[data] = true;
      var riga = document.createElement('div');
      riga.setAttribute('data-salva-turni', '1');
      riga.style.cssText = 'margin-top:8px;padding:9px 12px;border-radius:12px;border:2px solid #2563eb;background:#eff6ff;color:#0f172a;font:600 15px/1.3 system-ui,sans-serif';
      riga.textContent = 'Orario: ' + oraSola(t) + (oreTurno(t) ? ' · ' + oreTurno(t) : '');
      b.insertAdjacentElement('afterend', riga);
    });
    var altri = turni.filter(function (t) { return !mostrati[t.data]; });
    var box = document.createElement('div');
    box.setAttribute('data-salva-turni', '1');
    box.style.cssText = 'margin:10px auto;max-width:560px;padding:12px 14px;border-radius:14px;border:2px solid #111;background:#fff;color:#111;font:14px/1.4 system-ui,sans-serif';
    box.innerHTML = '<div style="font-weight:700;font-size:16px">Turni salvati il ' + esc(testa.quando) + '</div>' +
      '<div>' + esc(location.host) + ' · ' + esc(testa.operatore || '') + ' · settimana dal ' + esc(testa.settimana || '') + '</div>' +
      (altri.length ? '<div style="margin-top:8px;font-weight:600">Altri giorni</div>' +
        altri.map(function (t) {
          return '<div>' + esc(giornoBreve(t.data)) + ' · <b>' + esc(oraSola(t)) + '</b>' + (oreTurno(t) ? ' · ' + esc(oreTurno(t)) : '') +
            (t.servizio ? ' · ' + esc(String(t.servizio).trim()) : '') + '</div>';
        }).join('') : '');
    var radice = document.querySelector('.min-h-dvh') || document.body;
    radice.insertBefore(box, radice.firstChild);
  }

  function caricaLibreria() {
    return new Promise(function (ok) {
      if (window.htmlToImage) return ok(true);
      var s = document.createElement('script'); s.src = LIB; s.async = true;
      s.onload = function () { ok(!!window.htmlToImage); };
      s.onerror = function () { ok(false); };
      document.head.appendChild(s);
      setTimeout(function () { ok(!!window.htmlToImage); }, 15000);
    });
  }
  var CRC = (function () { var t = [], c; for (var n = 0; n < 256; n++) { c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(u8) { var c = 0xffffffff; for (var i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
  async function pngConDati(blob, testo) {
    var png = new Uint8Array(await blob.arrayBuffer());
    var kw = new TextEncoder().encode('salva-turni'), dati = new TextEncoder().encode(testo);
    var corpo = new Uint8Array(kw.length + 5 + dati.length);
    corpo.set(kw, 0); corpo.set([0, 0, 0, 0, 0], kw.length); corpo.set(dati, kw.length + 5);
    var tipo = new TextEncoder().encode('iTXt'), chunk = new Uint8Array(12 + corpo.length), dv = new DataView(chunk.buffer);
    dv.setUint32(0, corpo.length); chunk.set(tipo, 4); chunk.set(corpo, 8);
    var perCrc = new Uint8Array(4 + corpo.length); perCrc.set(tipo, 0); perCrc.set(corpo, 4);
    dv.setUint32(8 + corpo.length, crc32(perCrc));
    var fine = png.length - 12;
    var out = new Uint8Array(png.length + chunk.length);
    out.set(png.subarray(0, fine), 0); out.set(chunk, fine); out.set(png.subarray(fine), fine + chunk.length);
    return new Blob([out], { type: 'image/png' });
  }
  function scarica(blob, nome) {
    var url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = nome; a.style.display = 'none';
    a.addEventListener('click', function (e) { e.stopPropagation(); });
    document.documentElement.appendChild(a); a.click();
    setTimeout(function () { a.remove(); URL.revokeObjectURL(url); }, 5000);
  }

  try {
    stato('Salvo i turni…');
    var mem = propsInMemoria(), html = null, dati = null;
    try {
      var r = await fetch(location.href, { credentials: 'include', cache: 'no-store' });
      if (r.ok) { html = await r.text(); dati = leggiPagina(html); }
    } catch (e) { html = null; }
    if (!dati || !Array.isArray(dati.turni)) {
      if (!mem) { fineStato(); alert('Apri la pagina dei turni e tocca di nuovo Salva turni.'); return; }
      dati = { turni: JSON.parse(JSON.stringify(mem.turni)), alias: mem.operatore && mem.operatore.alias, thisMonday: String(mem.thisMonday || ''), nextMonday: String(mem.nextMonday || '') };
      html = null;
    }
    var adesso = new Date(), iso = isoLocale(adesso);
    var copia = {
      programma: 'Conta Ore · Salva turni', versione: VERSIONE, salvato_il: iso, pagina: location.href,
      operatore: dati.alias || null, settimana_dal: dati.thisMonday || null, prossima_dal: dati.nextMonday || null, turni: dati.turni,
      sha256_pagina_originale: html ? await sha256(html) : null, pagina_originale: html
    };
    var testo = JSON.stringify(copia, null, 1);
    var quando = adesso.toLocaleDateString('it-IT') + ' alle ' + adesso.toLocaleTimeString('it-IT').slice(0, 5);
    var settimana = String(dati.thisMonday || '').split('-').reverse().join('/');
    var riassunto = ['Turni ' + (dati.alias || '') + ', settimana dal ' + settimana + ' (salvati il ' + quando + ')']
      .concat(dati.turni.map(function (t) {
        return giornoBreve(t.data) + ': ' + oraSola(t) + (oreTurno(t) ? ' (' + oreTurno(t) + ')' : '') + (t.servizio ? ' · ' + String(t.servizio).trim() : '');
      })).join('\n');
    scriviSullaPagina(dati.turni, { quando: quando, operatore: dati.alias, settimana: settimana });
    window.scrollTo(0, 0);

    var foto = null;
    if (await caricaLibreria()) {
      try {
        await aspetta(300);
        var raw = await window.htmlToImage.toBlob(document.body, {
          backgroundColor: '#ffffff', pixelRatio: Math.min(2, window.devicePixelRatio || 1), cacheBust: false,
          filter: function (n) { return n !== barra; }
        });
        if (raw) foto = await pngConDati(raw, testo);
      } catch (e) { foto = null; }
    }
    fineStato();

    var nome = 'turni_' + String(dati.alias || 'operatore').replace(/[^\w-]/g, '') + '_' + (dati.thisMonday || 'settimana') + '_salvati_' + iso.slice(0, 19).replace(/[-:]/g, '').replace('T', '-');
    var file = foto ? new File([foto], nome + '.png', { type: 'image/png' }) : new File([testo], nome + '.json', { type: 'application/json' });
    var iOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (!iOS) scarica(file, file.name);

    var pan = document.createElement('div');
    pan.setAttribute('data-salva-turni-pannello', '1');
    pan.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:2147483647;max-height:90vh;overflow:auto;background:#fff;color:#111;border-top:3px solid #111;font:15px/1.4 system-ui,sans-serif;padding:14px;box-shadow:0 -8px 30px rgba(0,0,0,.25)';
    var btn = 'display:block;width:100%;margin-top:10px;padding:14px;border-radius:12px;font:600 16px system-ui,sans-serif;';
    pan.innerHTML = '<div style="max-width:560px;margin:0 auto">' +
      '<div style="font-weight:700;font-size:18px">✓ Turni salvati</div>' +
      '<div>' + esc(quando) + ' · ' + esc(dati.turni.length) + ' giorni</div>' +
      (foto ? '<img alt="" style="display:block;margin:10px auto 0;max-width:100%;max-height:40vh;border:1px solid #ccc;border-radius:8px">' : '') +
      '<button data-a="invia" style="' + btn + 'border:0;background:#111;color:#fff">Salva o invia</button>' +
      '<button data-a="chiudi" style="' + btn + 'border:0;background:#f4f4f5;color:#111">Chiudi</button></div>';
    document.documentElement.appendChild(pan);
    if (foto) pan.querySelector('img').src = URL.createObjectURL(foto);

    pan.addEventListener('click', async function (e) {
      var b = e.target.closest('button[data-a]'); if (!b) return;
      if (b.getAttribute('data-a') === 'chiudi') { pan.remove(); return; }
      try {
        if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], text: riassunto }); return; }
      } catch (err) { if (err && err.name === 'AbortError') return; }
      scarica(file, file.name);
      window.open('https://wa.me/?text=' + encodeURIComponent(riassunto), '_blank');
    });
  } catch (err) {
    fineStato();
    alert('Salva turni non è riuscito: ' + (err && err.message ? err.message : err));
  } finally {
    window.__salvaTurniAttivo = false;
  }
})();
