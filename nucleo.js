/* Conta Ore · nucleo comune: lettura dal portale, archivio delle copie, credenziali. Usato dall'app e dal Ruolino. */
(function () {
  'use strict';
  var PONTE = (window.CONTA_ORE && window.CONTA_ORE.ponte) || '';
  var due = function (n) { return (n < 10 ? '0' : '') + n; };
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
  var orario = function (t) { return t.tipoGiornata === 'TURNO' ? t.oraInizio + '–' + t.oraFine : String(t.tipoGiornata || '').toLowerCase(); };
  var firma = function (t) { return orario(t) + '|' + String(t.servizio || '').trim(); };

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
      var r = d.transaction('copie').objectStore('copie').getAll(); r.onsuccess = function () { ok((r.result || []).sort(function (a, b) { return a.salvata_il < b.salvata_il ? -1 : 1; })); }; r.onerror = function () { ko(r.error); };
    }); });
  }
  // aggiunge e basta: una copia non si sovrascrive mai; se la chiave c'è già risponde false
  function aggiungi(c) {
    return db().then(function (d) { return new Promise(function (ok, ko) {
      var tx = d.transaction('copie', 'readwrite'), rq = tx.objectStore('copie').add(c), nuova = true;
      rq.onerror = function (e) { if (rq.error && rq.error.name === 'ConstraintError') { nuova = false; e.preventDefault(); } };
      tx.oncomplete = function () { ok(nuova); }; tx.onerror = function () { if (nuova) ko(tx.error); }; tx.onabort = function () { ko(tx.error); };
    }); });
  }
  // due finestre aperte insieme possono salvare nello stesso secondo: si riprova con l'ora nuova
  async function salvaCopia(c) {
    for (var i = 0; i < 3; i++) {
      c.salvata_il = isoLocale(new Date());
      if (await aggiungi(c)) return c;
      await new Promise(function (ok) { setTimeout(ok, 1100); });
    }
    throw new Error('copia non salvata');
  }
  // le copie con i turni letti; una pagina che non si è saputa leggere resta in archivio ma non fa da riferimento
  function leggibili(tutte) { return tutte.filter(function (c) { return !c.illeggibile && c.dati && Array.isArray(c.dati.turni); }); }
  // il telefono può liberare spazio cancellando i dati dei siti: si chiede di tenerli
  if (navigator.storage && navigator.storage.persist) navigator.storage.persisted().then(function (p) { if (!p) return navigator.storage.persist(); }).catch(function () { /* non supportato */ });

  var inCorso = null;
  // Chiede i turni al portale (passando dal ponte) e salva una copia se cambia qualsiasi cosa dei turni o se è un giorno nuovo.
  function aggiorna() {
    if (inCorso) return inCorso;
    inCorso = (async function () {
      var cred = mem.get('cred');
      if (!cred) return { ok: false, motivo: 'accesso' };
      if (!PONTE) return { ok: false, motivo: 'servizio' };
      var r;
      try {
        var res = await fetch(PONTE + '/turni', { method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ codice: cred.codice, password: cred.password, sessione: mem.get('sessione') || '' }) });
        r = await res.json();
      } catch (e) { return { ok: false, motivo: 'rete' }; }
      if (!r.ok) {
        if (r.motivo === 'credenziali') { mem.del('cred'); mem.del('sessione'); }
        return { ok: false, motivo: r.motivo };
      }
      if (r.sessione) mem.set('sessione', r.sessione);
      var tutte = await copie(), ultAny = tutte[tutte.length - 1], buone = leggibili(tutte), ult = buone[buone.length - 1];
      var impronta = await sha256(r.html), adesso = new Date(), oggi = isoLocale(adesso).slice(0, 10);
      var base = { data_portale: r.data_portale || null, indirizzo: r.indirizzo || null, sha256: impronta, html: r.html };
      var dati = leggiPagina(r.html);
      if (!dati) {
        // la pagina è cambiata e non la so leggere: la pagina originale si salva lo stesso
        var nuovaPagina = !ultAny || ultAny.sha256 !== impronta;
        if (nuovaPagina) await salvaCopia(Object.assign({ illeggibile: true, dati: null }, base));
        return { ok: false, motivo: 'pagina', salvata: nuovaPagina };
      }
      var cambiati = !!ult && JSON.stringify(ult.dati.turni) !== JSON.stringify(dati.turni);
      var salvata = false;
      if (!ult || cambiati || ult.salvata_il.slice(0, 10) !== oggi) {
        await salvaCopia(Object.assign({ dati: dati }, base));
        salvata = true;
      }
      return { ok: true, dati: dati, salvata: salvata, cambiati: cambiati, quando: adesso };
    })();
    inCorso.then(function () { inCorso = null; }, function () { inCorso = null; });
    return inCorso;
  }
  var TESTI = { accesso: 'Serve il codice operatore.', servizio: 'Servizio non ancora attivo.', rete: 'Senza connessione: restano i turni dell’ultima copia.',
    credenziali: 'Codice o password sbagliati.', pagina: 'Il portale ha cambiato la pagina: la copia è salvata, ma i turni non riesco a leggerli.', 'troppi tentativi': 'Troppi tentativi: riprova tra un quarto d’ora.' };
  function spiega(motivo) { return TESTI[motivo] || ('Il portale non risponde (' + motivo + '). Riprova più tardi.'); }

  /* storia di ogni giorno attraverso le copie: le versioni diverse, con la prima volta che sono state viste */
  function storia(tutte) {
    var S = {};
    leggibili(tutte).forEach(function (c) {
      var perData = {};
      c.dati.turni.forEach(function (t) { (perData[t.data] = perData[t.data] || []).push(t); });
      Object.keys(perData).forEach(function (d) {
        var f = perData[d].map(firma).join(' + '), s = S[d] = S[d] || [];
        if (!s.length || s[s.length - 1].f !== f) s.push({ f: f, quando: c.salvata_il, turni: perData[d] });
      });
    });
    return S;
  }

  var GG = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'], MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
  function giorno(d) { var x = new Date(d + 'T12:00:00'); return GG[x.getDay()] + ' ' + x.getDate() + ' ' + MESI[x.getMonth()]; }
  function oraIt(iso) { var d = new Date(iso); return d.toLocaleDateString('it-IT') + ' ' + due(d.getHours()) + ':' + due(d.getMinutes()); }
  function ore(t) { return t.minutiTurno ? String(t.minutiTurno / 60).replace('.', ',') + ' h' : ''; }

  /* immagine della settimana, con data, ora e impronta della pagina */
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
  function scarica(f) {
    var a = document.createElement('a'); a.href = URL.createObjectURL(f); a.download = f.name;
    document.body.appendChild(a); a.click(); setTimeout(function () { a.remove(); }, 3000);
  }
  async function condividi(files, testo) {
    try {
      if (navigator.canShare && navigator.canShare({ files: files })) { await navigator.share({ files: files, text: testo }); return; }
      if (files.length > 1 && navigator.canShare && navigator.canShare({ files: [files[0]] })) { await navigator.share({ files: [files[0]], text: testo }); return; }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    files.forEach(scarica);
  }
  // la copia come immagine più la pagina originale del portale, da mandare su WhatsApp o per email
  async function invia(c) {
    var png = await immagine(c), base = nomeFile(c);
    await condividi([new File([png], base + '.png', { type: 'image/png' }), new File([c.html], base + '_pagina-originale.html', { type: 'text/html' })],
      'Turni ' + (c.dati.operatore || '') + ' · copia del ' + oraIt(c.salvata_il));
  }
  async function esportaArchivio() {
    var tutte = await copie(), oggi = isoLocale(new Date());
    await condividi([new File([JSON.stringify({ programma: 'Conta Ore', esportato_il: oggi, copie: tutte })], 'conta-ore_archivio_' + oggi.slice(0, 10) + '.json', { type: 'application/json' })], '');
  }

  window.ContaOre = {
    ponte: PONTE, isoLocale: isoLocale, sha256: sha256, leggiPagina: leggiPagina, copie: copie, leggibili: leggibili, salvaCopia: salvaCopia, aggiorna: aggiorna, spiega: spiega,
    firma: firma, orario: orario, storia: storia, giorno: giorno, oraIt: oraIt, ore: ore,
    immagine: immagine, invia: invia, esportaArchivio: esportaArchivio,
    credenziali: function () { return mem.get('cred'); },
    salvaCredenziali: function (codice, password) { mem.set('cred', { codice: codice, password: password }); mem.del('sessione'); },
    esci: function () { mem.del('cred'); mem.del('sessione'); }
  };
})();
