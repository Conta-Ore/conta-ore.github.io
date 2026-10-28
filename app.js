(function () {
  'use strict';
  var PONTE = (window.CONTA_ORE && window.CONTA_ORE.ponte) || '';
  var $ = function (id) { return document.getElementById(id); };
  var due = function (n) { return (n < 10 ? '0' : '') + n; };
  var GG = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];
  var MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
  var giorno = function (d) { var x = new Date(d + 'T12:00:00'); return GG[x.getDay()] + ' ' + x.getDate() + ' ' + MESI[x.getMonth()]; };
  var orario = function (t) { return t.tipoGiornata === 'TURNO' ? t.oraInizio + '–' + t.oraFine : String(t.tipoGiornata || '').toLowerCase(); };
  var ore = function (t) { return t.minutiTurno ? String(t.minutiTurno / 60).replace('.', ',') + ' h' : ''; };
  var firma = function (t) { return orario(t) + '|' + String(t.servizio || '').trim(); };
  var oraIt = function (iso) { var d = new Date(iso); return d.toLocaleDateString('it-IT') + ' ' + due(d.getHours()) + ':' + due(d.getMinutes()); };
  function isoLocale(d) {
    var off = -d.getTimezoneOffset();
    return d.getFullYear() + '-' + due(d.getMonth() + 1) + '-' + due(d.getDate()) + 'T' + due(d.getHours()) + ':' + due(d.getMinutes()) + ':' +
      due(d.getSeconds()) + (off >= 0 ? '+' : '-') + due(Math.floor(Math.abs(off) / 60)) + ':' + due(Math.abs(off) % 60);
  }
  async function sha256(testo) {
    var h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(testo));
    return Array.prototype.map.call(new Uint8Array(h), function (b) { return (b < 16 ? '0' : '') + b.toString(16); }).join('');
  }
  var mem = {
    get: function (k) { try { return JSON.parse(localStorage.getItem('co_' + k)); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem('co_' + k, JSON.stringify(v)); } catch (e) { /* pieno */ } },
    del: function (k) { try { localStorage.removeItem('co_' + k); } catch (e) { /* niente */ } }
  };

  /* lettura della pagina dei turni come la manda il portale */
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
    var turni = arrayDopo('turni');
    if (!Array.isArray(turni)) return null;
    return { turni: turni.filter(function (t) { return t && /^\d{4}-\d{2}-\d{2}$/.test(String(t.data)); }), operatore: valore('alias'),
      settimana: valore('thisMonday'), prossima: valore('nextMonday') };
  }

  /* archivio sul telefono: una copia non si sovrascrive mai */
  var DB = null;
  function db() {
    return new Promise(function (ok, ko) {
      if (DB) return ok(DB);
      var r = indexedDB.open('conta-ore', 1);
      r.onupgradeneeded = function () { r.result.createObjectStore('copie', { keyPath: 'salvata_il' }); };
      r.onsuccess = function () { DB = r.result; ok(DB); };
      r.onerror = function () { ko(r.error); };
    });
  }
  function copie() {
    return db().then(function (d) { return new Promise(function (ok, ko) {
      var r = d.transaction('copie').objectStore('copie').getAll(); r.onsuccess = function () { ok(r.result || []); }; r.onerror = function () { ko(r.error); };
    }); });
  }
  function aggiungi(c) {
    return db().then(function (d) { return new Promise(function (ok, ko) {
      var tx = d.transaction('copie', 'readwrite'); tx.objectStore('copie').add(c);
      tx.oncomplete = function () { ok(); }; tx.onerror = function () { ko(tx.error); };
    }); });
  }

  /* immagine della settimana, con data, ora e impronta */
  function immagine(c) {
    var righe = c.dati.turni, W = 1080, rh = 92, top = 210, H = top + righe.length * rh + 190;
    var cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    var g = cv.getContext('2d');
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#111821'; g.fillRect(0, 0, W, 150);
    g.fillStyle = '#ffffff'; g.font = '700 46px system-ui,sans-serif'; g.fillText('Turni ' + (c.dati.operatore || ''), 48, 72);
    g.font = '400 30px system-ui,sans-serif'; g.fillText('Copia del ' + oraIt(c.salvata_il) + ' · dal portale', 48, 120);
    var y = top;
    righe.forEach(function (t, i) {
      if (i % 2) { g.fillStyle = '#f3f5f9'; g.fillRect(0, y - 58, W, rh); }
      g.fillStyle = '#111821'; g.font = '600 32px system-ui,sans-serif'; g.fillText(giorno(t.data), 48, y);
      g.font = '700 34px system-ui,sans-serif'; g.fillText(orario(t), 300, y);
      g.font = '400 30px system-ui,sans-serif'; g.fillText(ore(t), 560, y);
      g.fillStyle = '#475569'; g.font = '400 26px system-ui,sans-serif';
      g.fillText(String(t.servizio || '').trim().slice(0, 34), 660, y);
      y += rh;
    });
    g.fillStyle = '#475569'; g.font = '400 24px system-ui,sans-serif';
    g.fillText('Ora del portale: ' + (c.data_portale || '-'), 48, H - 120);
    g.fillText(String(c.indirizzo || ''), 48, H - 84);
    g.font = '400 20px ui-monospace,Menlo,Consolas,monospace';
    g.fillText('Impronta della pagina (SHA-256): ' + c.sha256, 48, H - 44);
    return new Promise(function (ok) { cv.toBlob(ok, 'image/png'); });
  }
  function nomeFile(c) { return 'turni_' + String(c.dati.operatore || 'operatore').replace(/[^\w-]/g, '') + '_' + c.salvata_il.slice(0, 19).replace(/[-:]/g, '').replace('T', '-'); }
  async function invia(c) {
    var png = await immagine(c), base = nomeFile(c);
    var file = new File([png], base + '.png', { type: 'image/png' });
    var pagina = new File([c.html], base + '_pagina-originale.html', { type: 'text/html' });
    var testo = 'Turni ' + (c.dati.operatore || '') + ' · copia del ' + oraIt(c.salvata_il);
    try {
      if (navigator.canShare && navigator.canShare({ files: [file, pagina] })) return await navigator.share({ files: [file, pagina], text: testo });
      if (navigator.canShare && navigator.canShare({ files: [file] })) return await navigator.share({ files: [file], text: testo });
    } catch (e) { if (e && e.name === 'AbortError') return; }
    [file, pagina].forEach(function (f) {
      var a = document.createElement('a'); a.href = URL.createObjectURL(f); a.download = f.name;
      document.body.appendChild(a); a.click(); setTimeout(function () { a.remove(); }, 3000);
    });
  }

  /* schermate */
  function mostra(id) { ['accesso', 'turni'].forEach(function (x) { $(x).hidden = x !== id; }); }
  function stato(t, errore) { $('stato').textContent = t; $('stato').className = errore ? 'stato no' : 'stato'; }

  async function disegna() {
    var tutte = (await copie()).sort(function (a, b) { return a.salvata_il < b.salvata_il ? -1 : 1; });
    var ultima = tutte[tutte.length - 1];
    var lista = $('lista'); lista.textContent = '';
    if (!ultima) return;
    var storia = {};
    tutte.forEach(function (c) {
      var perData = {};
      c.dati.turni.forEach(function (t) { (perData[t.data] = perData[t.data] || []).push(t); });
      Object.keys(perData).forEach(function (d) {
        var f = perData[d].map(firma).join(' + '), s = storia[d] = storia[d] || [];
        if (!s.length || s[s.length - 1].f !== f) s.push({ f: f, quando: c.salvata_il });
      });
    });
    var sett = ultima.dati.settimana, pross = ultima.dati.prossima;
    var gruppi = [['Questa settimana', function (d) { return !pross || d < pross; }], ['Prossima settimana', function (d) { return pross && d >= pross; }]];
    gruppi.forEach(function (gr) {
      var giorni = ultima.dati.turni.filter(function (t) { return gr[1](t.data); });
      if (!giorni.length) return;
      var h = document.createElement('h2'); h.textContent = gr[0]; lista.appendChild(h);
      giorni.forEach(function (t) {
        var s = storia[t.data] || [];
        var riga = document.createElement('div'); riga.className = 'giorno' + (s.length > 1 ? ' cambiato' : '') + (t.tipoGiornata === 'TURNO' ? '' : ' libero');
        var a = document.createElement('div'); a.className = 'g'; a.textContent = giorno(t.data); riga.appendChild(a);
        var b = document.createElement('div'); b.className = 'o'; b.textContent = orario(t) + (ore(t) ? ' · ' + ore(t) : ''); riga.appendChild(b);
        if (t.servizio) {
          var c = document.createElement('div'); c.className = 's';
          var ind = t.indirizzoServizio || {};
          c.textContent = String(t.servizio).trim() + ([ind.indirizzo, ind.citta].filter(Boolean).length ? ' · ' + [ind.indirizzo, ind.citta].filter(Boolean).join(', ') : '');
          riga.appendChild(c);
        }
        s.slice(0, -1).forEach(function (x) {
          var p = document.createElement('div'); p.className = 'prima';
          p.textContent = 'prima: ' + x.f.split(' + ').map(function (y) { return y.split('|')[0]; }).join(' + ') + ' (visto il ' + oraIt(x.quando) + ')';
          riga.appendChild(p);
        });
        lista.appendChild(riga);
      });
    });
    $('invia').onclick = function () { invia(ultima); };
    $('copie').textContent = tutte.length === 1 ? '1 copia salvata sul telefono' : tutte.length + ' copie salvate sul telefono';
  }

  async function aggiorna() {
    var cred = mem.get('cred');
    if (!cred) { mostra('accesso'); return; }
    mostra('turni');
    if (!PONTE) { stato('Servizio non ancora attivo.', true); return; }
    stato('Aggiorno i turni…');
    var r;
    try {
      var res = await fetch(PONTE + '/turni', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ codice: cred.codice, password: cred.password, sessione: mem.get('sessione') || '' }) });
      r = await res.json();
    } catch (e) { stato('Senza connessione: questi sono i turni dell’ultima copia.', true); return; }
    if (!r.ok) {
      if (r.motivo === 'credenziali') { mem.del('cred'); mem.del('sessione'); mostra('accesso'); $('acc-msg').textContent = 'Codice o password sbagliati.'; return; }
      stato('Il portale non risponde (' + r.motivo + '). Riprova più tardi.', true); return;
    }
    if (r.sessione) mem.set('sessione', r.sessione);
    var dati = leggiPagina(r.html);
    if (!dati) { stato('Non trovo i turni nella pagina del portale.', true); return; }
    var tutte = (await copie()).sort(function (a, b) { return a.salvata_il < b.salvata_il ? -1 : 1; });
    var ult = tutte[tutte.length - 1];
    var adesso = new Date(), oggi = isoLocale(adesso).slice(0, 10);
    var uguale = ult && JSON.stringify(ult.dati.turni.map(firma)) === JSON.stringify(dati.turni.map(firma));
    if (!uguale || ult.salvata_il.slice(0, 10) !== oggi) {
      await aggiungi({ salvata_il: isoLocale(adesso), data_portale: r.data_portale || null, indirizzo: r.indirizzo || null,
        sha256: await sha256(r.html), html: r.html, dati: dati });
      stato(uguale || !ult ? 'Copia salvata alle ' + due(adesso.getHours()) + ':' + due(adesso.getMinutes()) + ' ✓' : 'Turni cambiati: copia salvata ✓');
    } else {
      stato('Aggiornato alle ' + due(adesso.getHours()) + ':' + due(adesso.getMinutes()) + ' · nessun cambio');
    }
    await disegna();
  }

  $('entra').onclick = function () {
    var codice = $('codice').value.trim().toUpperCase(), password = $('password').value;
    if (!codice || !password) { $('acc-msg').textContent = 'Scrivi codice e password.'; return; }
    mem.set('cred', { codice: codice, password: password }); mem.del('sessione');
    $('password').value = ''; $('acc-msg').textContent = '';
    aggiorna();
  };
  $('esci').onclick = function () { if (confirm('Togliere codice e password da questo telefono? Le copie salvate restano.')) { mem.del('cred'); mem.del('sessione'); mostra('accesso'); } };
  $('archivio').onclick = async function () {
    var tutte = (await copie()).sort(function (a, b) { return a.salvata_il < b.salvata_il ? -1 : 1; });
    var f = new File([JSON.stringify({ programma: 'Conta Ore', esportato_il: isoLocale(new Date()), copie: tutte })], 'conta-ore_archivio_' + isoLocale(new Date()).slice(0, 10) + '.json', { type: 'application/json' });
    try { if (navigator.canShare && navigator.canShare({ files: [f] })) return await navigator.share({ files: [f] }); } catch (e) { if (e && e.name === 'AbortError') return; }
    var a = document.createElement('a'); a.href = URL.createObjectURL(f); a.download = f.name; document.body.appendChild(a); a.click(); setTimeout(function () { a.remove(); }, 3000);
  };

  /* installazione sulla schermata Home */
  var standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  var iOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (!standalone && iOS) { $('installa').hidden = false; $('inst-ios').hidden = false; }
  var richiesta = null;
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); richiesta = e; if (!standalone) { $('installa').hidden = false; $('inst-and').hidden = false; } });
  $('inst-and').onclick = function () { if (richiesta) { richiesta.prompt(); richiesta = null; $('installa').hidden = true; } };
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function () { /* niente */ });

  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && mem.get('cred')) aggiorna(); });
  disegna().then(aggiorna);
})();
