/* Salva turni — copia dei propri turni dal portale aziendale
   Si apre dal segnalibro, sulla pagina dei turni del portale, dopo l'accesso.
   Non legge password e da solo non manda niente a nessuno: rilegge la pagina dei turni come la manda il server,
   scrive l'orario accanto a ogni turno sulla pagina vera, ne fa una foto con data e ora e prepara i file da tenere.
   Cosa farne lo decide chi lo usa: inviarli a sé stesso, salvarli, metterli nell'archivio di Salva turni. */
(async function () {
  'use strict';
  var VERSIONE = '2026.10.28';
  // l'archivio sta nello stesso sito da cui arriva questo file (lo dice l'indirizzo dello script del segnalibro)
  var SCRIPT = document.currentScript && document.currentScript.src ? new URL(document.currentScript.src) : null;
  var ARCHIVIO = SCRIPT ? SCRIPT.origin + SCRIPT.pathname.replace(/[^/]*$/, '') : null;
  var ORIGINE_ARCHIVIO = SCRIPT ? SCRIPT.origin : null;
  // la libreria per la foto (html-to-image, licenza MIT) sta nello stesso sito, nella cartella lib
  var LIB = ARCHIVIO ? ARCHIVIO + 'lib/html-to-image.js' : 'https://cdn.jsdelivr.net/npm/html-to-image@1.11.13/dist/html-to-image.js';
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

  // barra di stato mentre lavora
  var barra = document.createElement('div');
  barra.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:2147483647;background:#111;color:#fff;font:600 14px/1.4 system-ui,sans-serif;padding:10px 14px;text-align:center';
  var stato = function (t) { barra.textContent = 'Salva turni · ' + t; if (!barra.parentNode) document.documentElement.appendChild(barra); };
  var fineStato = function () { if (barra.parentNode) barra.remove(); };

  // i turni che la pagina aperta ha in memoria (componente React con la lista «turni»)
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
  // i turni nella pagina come la manda il server (dati React Server Components)
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

  // scrive l'orario accanto a ogni turno, sulla pagina vera, e mette in cima i dati della copia
  function scriviSullaPagina(turni, testa) {
    var vecchi = document.querySelectorAll('[data-salva-turni]');
    for (var v = 0; v < vecchi.length; v++) vecchi[v].remove();
    var perGiorno = {};
    turni.forEach(function (t) { if (t.tipoGiornata === 'TURNO') (perGiorno[t.data] = perGiorno[t.data] || []).push(t); });
    var mostrati = {}, scritti = 0;
    var bottoni = Array.prototype.filter.call(document.querySelectorAll('button'), function (b) { return /vedi orario/i.test(b.innerText); });
    var contatore = {};
    bottoni.forEach(function (b) {
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
      riga.innerHTML = 'Orario: ' + esc(oraSola(t)) + (oreTurno(t) ? ' · ' + esc(oreTurno(t)) : '') +
        '<div style="font:400 11px/1.3 system-ui,sans-serif;color:#475569;margin-top:2px">scritto da Salva turni con i dati di questa pagina · turno n. ' + esc(t.id) + '</div>';
      b.insertAdjacentElement('afterend', riga);
      scritti++;
    });
    // giorni che il portale non mostra più (passati) ma che la pagina contiene ancora
    var nascosti = turni.filter(function (t) { return !mostrati[t.data]; });
    var box = document.createElement('div');
    box.setAttribute('data-salva-turni', '1');
    box.style.cssText = 'margin:10px auto;max-width:560px;padding:12px 14px;border-radius:14px;border:2px solid #111;background:#fff;color:#111;font:14px/1.4 system-ui,sans-serif';
    box.innerHTML = '<div style="font-weight:700;font-size:16px">Copia dei turni</div>' +
      '<div>Salvata il <b>' + esc(testa.quando) + '</b> da <b>' + esc(location.host) + '</b></div>' +
      '<div>Operatore <b>' + esc(testa.operatore || '?') + '</b> · settimana dal ' + esc(testa.settimana || '?') + ' · dati presi dalla ' + esc(testa.origine) + '</div>' +
      (nascosti.length ? '<div style="margin-top:8px;font-weight:600">Altri giorni nella pagina (passati o senza orario)</div>' +
        nascosti.map(function (t) {
          return '<div>' + esc(giornoBreve(t.data)) + ' · <b>' + esc(oraSola(t)) + '</b>' + (oreTurno(t) ? ' · ' + esc(oreTurno(t)) : '') +
            (t.servizio ? ' · ' + esc(String(t.servizio).trim()) : '') + '</div>';
        }).join('') : '') +
      '<div style="margin-top:8px;font:11px/1.3 ui-monospace,Menlo,Consolas,monospace;word-break:break-all;color:#475569">Impronta dei dati (SHA-256): ' + esc(testa.impronta || 'non calcolata') + '</div>';
    var radice = document.querySelector('.min-h-dvh') || document.body;
    radice.insertBefore(box, radice.firstChild);
    return { scritti: scritti, nascosti: nascosti.length, box: box };
  }

  // carica la libreria che trasforma la pagina in immagine
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

  // mette i dati dentro l'immagine (blocco iTXt «salva-turni»), cosi' la foto si porta dietro anche i numeri
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
    var fine = png.length - 12; // il blocco IEND e' sempre l'ultimo, 12 byte
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

  // apre gli orari uno per uno sul sito, per chi registra lo schermo
  async function apriOrariUnoPerUno() {
    var chiudi = function () {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    };
    var bottoni = Array.prototype.filter.call(document.querySelectorAll('button'), function (b) { return /vedi orario/i.test(b.innerText); });
    for (var i = 0; i < bottoni.length; i++) {
      bottoni[i].scrollIntoView({ block: 'center' }); await aspetta(1200);
      bottoni[i].click(); await aspetta(2200);
      chiudi(); await aspetta(700);
    }
  }

  try {
    stato('leggo i turni…');
    var mem = propsInMemoria(), html = null, dati = null, origine = 'pagina del server';
    try {
      var r = await fetch(location.href, { credentials: 'include', cache: 'no-store' });
      if (r.ok) { html = await r.text(); dati = leggiPagina(html); }
    } catch (e) { html = null; }
    if (!dati || !Array.isArray(dati.turni)) {
      if (!mem) { fineStato(); alert('Salva turni: apri la pagina dei turni, dopo l\'accesso, e tocca di nuovo il segnalibro.'); return; }
      dati = { turni: JSON.parse(JSON.stringify(mem.turni)), alias: mem.operatore && mem.operatore.alias, thisMonday: String(mem.thisMonday || ''), nextMonday: String(mem.nextMonday || '') };
      origine = 'memoria della pagina'; html = null;
    }
    var adesso = new Date(), iso = isoLocale(adesso);
    var copia = {
      programma: 'Salva turni', versione: VERSIONE, salvato_il: iso, pagina: location.href, origine: origine,
      operatore: dati.alias || null, settimana_dal: dati.thisMonday || null, prossima_dal: dati.nextMonday || null, turni: dati.turni,
      sha256_pagina_originale: html ? await sha256(html) : null, pagina_originale: html
    };
    var testo = JSON.stringify(copia, null, 1), impronta = await sha256(testo);
    var quando = adesso.toLocaleDateString('it-IT') + ' alle ' + adesso.toLocaleTimeString('it-IT');
    var settimana = String(dati.thisMonday || '').split('-').reverse().join('/');
    // il testo da mandare su WhatsApp o per email: si legge anche senza aprire file
    var riassunto = ['Turni ' + (dati.alias || '') + ', settimana dal ' + settimana, 'Salvati il ' + quando + ' da ' + location.host, '']
      .concat(dati.turni.map(function (t) {
        return giornoBreve(t.data) + ': ' + oraSola(t) + (oreTurno(t) ? ' (' + oreTurno(t) + ')' : '') + (t.servizio ? ' · ' + String(t.servizio).trim() : '');
      }))
      .concat(['', 'Impronta dei dati (SHA-256): ' + impronta]).join('\n');
    var esito = scriviSullaPagina(dati.turni, { quando: quando, operatore: dati.alias, settimana: settimana, origine: origine, impronta: impronta });
    window.scrollTo(0, 0);

    stato('faccio la foto della pagina…');
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

    var base = 'turni_' + String(dati.alias || 'operatore').replace(/[^\w-]/g, '') + '_' + (dati.thisMonday || 'settimana') + '_salvati_' + iso.slice(0, 19).replace(/[-:]/g, '').replace('T', '-');
    var fileDati = new File([testo], base + '.json', { type: 'application/json' });
    var fileFoto = foto ? new File([foto], base + '.png', { type: 'image/png' }) : null;

    // pannello con le azioni: ogni salvataggio parte da un tocco, come vogliono i browser
    var pan = document.createElement('div');
    pan.setAttribute('data-salva-turni-pannello', '1');
    pan.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:2147483647;max-height:92vh;overflow:auto;background:#fff;color:#111;border-top:3px solid #111;font:14px/1.4 system-ui,sans-serif;padding:14px;box-shadow:0 -8px 30px rgba(0,0,0,.25)';
    var btn = 'display:block;width:100%;margin-top:8px;padding:13px;border-radius:12px;font:600 15px system-ui,sans-serif;';
    pan.innerHTML = '<div style="max-width:560px;margin:0 auto">' +
      '<div style="font-weight:700;font-size:17px">Turni salvati · ' + esc(quando) + '</div>' +
      '<div>' + esc(dati.turni.length) + ' giorni letti dalla ' + esc(origine) + ', ' + esc(esito.scritti) + ' orari scritti sulla pagina' +
      (esito.nascosti ? ', ' + esc(esito.nascosti) + ' altri giorni (passati o senza orario) nel riquadro in alto' : '') + '.</div>' +
      (foto ? '<img alt="" style="display:block;margin:10px auto 0;max-width:100%;max-height:34vh;border:1px solid #ccc;border-radius:8px">' :
        '<div style="margin-top:8px;color:#b45309">La foto automatica non è riuscita: chiudi questo riquadro e fai lo screenshot del telefono, gli orari restano scritti sulla pagina.</div>') +
      '<button data-a="invia" style="' + btn + 'border:0;background:#111;color:#fff">Invia foto e dati (scegli WhatsApp, Gmail…)</button>' +
      '<div style="display:flex;gap:8px"><button data-a="wa" style="' + btn + 'flex:1;border:0;background:#16a34a;color:#fff">WhatsApp: il testo</button>' +
      '<button data-a="mail" style="' + btn + 'flex:1;border:0;background:#2563eb;color:#fff">Email: il testo</button></div>' +
      (foto ? '<button data-a="foto" style="' + btn + 'border:1px solid #111;background:#fff;color:#111">Salva la foto (dentro ci sono anche i dati)</button>' : '') +
      '<button data-a="dati" style="' + btn + 'border:1px solid #111;background:#fff;color:#111">Salva i dati (.json)</button>' +
      '<button data-a="archivio" style="' + btn + 'border:1px solid #2563eb;background:#eff6ff;color:#1e3a8a">Metti nell’archivio</button>' +
      '<button data-a="video" style="' + btn + 'border:1px solid #999;background:#fff;color:#111">Apri gli orari uno per uno (per il video)</button>' +
      '<button data-a="chiudi" style="' + btn + 'border:0;background:#f4f4f5;color:#111">Chiudi (gli orari restano sulla pagina, per lo screenshot)</button>' +
      '<div data-msg style="margin-top:8px;font-size:12px;color:#555">Il consiglio: «Invia a me stesso» su WhatsApp o per email, così la data dell\'invio la mette un altro.</div></div>';
    document.documentElement.appendChild(pan);
    if (foto) pan.querySelector('img').src = URL.createObjectURL(foto);
    var msg = function (t) { pan.querySelector('[data-msg]').textContent = t; };

    pan.addEventListener('click', async function (e) {
      var b = e.target.closest('button[data-a]'); if (!b) return;
      var a = b.getAttribute('data-a');
      if (a === 'invia') {
        var testoTxt = new File([testo], base + '.txt', { type: 'text/plain' });
        var conFoto = fileFoto ? [fileFoto, testoTxt] : [testoTxt];
        var testoMsg = 'Turni salvati il ' + quando + ' (' + (dati.alias || '') + ', settimana dal ' + settimana + ')';
        try {
          if (navigator.canShare && navigator.canShare({ files: conFoto })) { await navigator.share({ files: conFoto, title: 'Turni', text: testoMsg }); msg('Inviato.'); return; }
          if (fileFoto && navigator.canShare && navigator.canShare({ files: [fileFoto] })) { await navigator.share({ files: [fileFoto], title: 'Turni', text: testoMsg }); msg('Inviata la foto: salva anche i dati col pulsante qui sotto.'); return; }
        } catch (err) { if (err && err.name === 'AbortError') return; }
        if (fileFoto) scarica(fileFoto, fileFoto.name); else scarica(fileDati, fileDati.name);
        msg('Questo browser non sa inviare i file: li ho salvati, mandali tu.');
      } else if (a === 'wa') {
        var w2 = window.open('https://wa.me/?text=' + encodeURIComponent(riassunto), '_blank');
        msg(w2 ? 'Scegli la chat «Tu» (te stesso) in WhatsApp e invia. Foto e dati si mandano col pulsante nero.' : 'Il browser ha bloccato WhatsApp: consenti i popup e riprova.');
      } else if (a === 'mail') {
        var m = document.createElement('a');
        m.href = 'mailto:?subject=' + encodeURIComponent('Turni ' + (dati.alias || '') + ' settimana dal ' + settimana + ' (salvati il ' + quando + ')') + '&body=' + encodeURIComponent(riassunto);
        m.style.display = 'none'; document.documentElement.appendChild(m); m.click(); setTimeout(function () { m.remove(); }, 2000);
        msg('Scrivi il tuo indirizzo come destinatario e invia. Foto e dati si mandano col pulsante nero.');
      } else if (a === 'foto') { scarica(fileFoto, fileFoto.name); msg('Foto salvata: ' + fileFoto.name);
      } else if (a === 'dati') { scarica(fileDati, fileDati.name); msg('Dati salvati: ' + fileDati.name);
      } else if (a === 'archivio') {
        if (!ARCHIVIO) { msg('Non so dov’è l’archivio: salva la foto o i dati e caricali tu.'); return; }
        var w = window.open(ARCHIVIO + '#da-portale', '_blank');
        if (!w) { msg('Il browser ha bloccato la finestra: consenti i popup per questo sito e riprova.'); return; }
        var consegnato = false;
        var ascolta = function (ev) {
          if (ev.origin !== ORIGINE_ARCHIVIO || ev.source !== w || !ev.data || ev.data.tipo !== 'archivio-pronto') return;
          w.postMessage({ tipo: 'salva-turni', copia: copia }, ORIGINE_ARCHIVIO);
          consegnato = true; window.removeEventListener('message', ascolta);
          msg('Mandato all’archivio: conferma nella scheda che si è aperta.');
        };
        window.addEventListener('message', ascolta);
        setTimeout(function () { if (!consegnato) { window.removeEventListener('message', ascolta); msg('L’archivio non ha risposto: salva la foto o i dati e caricali tu.'); } }, 20000);
      } else if (a === 'video') {
        pan.style.display = 'none';
        await apriOrariUnoPerUno();
        pan.style.display = '';
        msg('Fatto: ferma la registrazione dello schermo.');
      } else if (a === 'chiudi') { pan.remove(); }
    });
  } catch (err) {
    fineStato();
    alert('Salva turni: non è riuscito (' + (err && err.message ? err.message : err) + ').');
  } finally {
    window.__salvaTurniAttivo = false;
  }
})();
