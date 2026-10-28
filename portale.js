/* Ruolino istituzionale · turni dal portale: li scarica, ne tiene la copia, li segna nel registro e confronta le ore. */
(function () {
  'use strict';
  var CO = window.ContaOre, R = window.RP;
  if (!CO || !R) return;
  var $ = function (id) { return document.getElementById(id); };
  var due = function (n) { return (n < 10 ? '0' : '') + n; };
  var num = function (x) { return (Math.round(x * 10) / 10).toLocaleString('it-IT', { maximumFractionDigits: 1 }); };
  var MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
  var el = function (tag, cls, testo) { var x = document.createElement(tag); if (cls) x.className = cls; if (testo != null) x.textContent = testo; return x; };

  var st = document.createElement('style');
  st.textContent =
    '.po-stato{font-size:13.5px;font-weight:600;color:var(--good);margin-bottom:6px}.po-stato.no{color:var(--warn)}' +
    '.po-g{border-top:1px solid var(--line-2);padding:8px 0}.po-g:first-child{border-top:0}' +
    '.po-g.cambiato{background:var(--warn-bg);margin:0 -16px;padding:8px 16px}' +
    '.po-g .r1{display:flex;justify-content:space-between;gap:10px;font-size:14px}' +
    '.po-g .r1 b{font-family:"IBM Plex Mono",Menlo,Consolas,monospace;font-variant-numeric:tabular-nums}' +
    '.po-g .r2{font-size:12px;color:var(--muted);margin-top:2px}.po-g .prima{font-size:12px;color:var(--warn);margin-top:2px}' +
    '.po-sett{font-size:11.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin:12px 0 2px}' +
    '#po-tab td{text-align:right;font-family:"IBM Plex Mono",Menlo,Consolas,monospace;font-variant-numeric:tabular-nums}' +
    '#po-tab td:first-child{text-align:left;font-family:inherit}#po-tab td.diff{color:var(--warn);font-weight:600}' +
    '.po-var{font-size:12.5px;padding:6px 0;border-top:1px solid var(--line-2)}.po-var:first-child{border-top:0}' +
    '.po-mese{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:8px 0;border-top:1px solid var(--line-2);font-size:13.5px}' +
    '.po-mese .btn{flex:0 0 auto;width:auto;margin:0;padding:8px 12px;font-size:13px}.po-mese .q{display:block;font-size:12px;color:var(--muted)}';
  document.head.appendChild(st);

  /* riquadro dei turni, in cima alla scheda Turni */
  var card = el('div', 'card'); card.id = 'po-card';
  card.innerHTML = '<h3>Turni dal portale</h3><div class="b">' +
    '<div id="po-accesso" hidden>' +
    '<p class="hint" style="margin:0 0 10px;font-size:12.5px">Colleghi una volta sola. Da lì il Ruolino entra nel portale con il tuo codice, segna i turni nel registro con il posto di servizio, tiene una copia di ogni versione con data, ora e impronta, e a mese finito prepara il PDF del mese.</p>' +
    '<div class="g2"><div class="f"><label for="po-codice">Codice operatore</label><input type="text" id="po-codice" autocomplete="username" autocapitalize="characters"></div>' +
    '<div class="f"><label for="po-password">Password</label><input type="password" id="po-password" autocomplete="current-password"></div></div>' +
    '<div class="btnrow"><button type="button" class="btn primary" id="po-entra">Collega il portale</button></div>' +
    '<div class="hint" id="po-acc-msg"></div>' +
    '<div class="hint">Codice e password restano su questo telefono e servono solo per entrare nel portale.</div></div>' +
    '<div id="po-dentro" hidden>' +
    '<div class="po-stato" id="po-stato"></div><div id="po-lista"></div>' +
    '<div class="btnrow"><button type="button" class="btn primary" id="po-invia">Invia la copia</button><button type="button" class="btn" id="po-aggiorna">Aggiorna</button></div>' +
    '<div class="hint" id="po-copie"></div>' +
    '<div class="btnrow"><button type="button" class="btn" id="po-archivio">Esporta in PDF</button><button type="button" class="btn" id="po-esci">Scollega</button></div></div>' +
    '</div>';
  var pp = $('p-p'); pp.insertBefore(card, pp.firstElementChild);

  /* riquadro del riscontro, dopo il riepilogo del mese */
  var rc = el('div', 'card'); rc.id = 'po-riscontro';
  rc.innerHTML = '<h3>Riscontro delle ore</h3><div class="b"><table id="po-tab"></table><div class="hint" id="po-nota"></div><div id="po-var"></div><div id="po-mesi"></div></div>';
  var riep = Array.prototype.filter.call(pp.querySelectorAll('h3'), function (h) { return h.textContent.trim() === 'Riepilogo del mese'; })[0];
  var dopo = riep ? riep.closest('.card') : null;
  if (dopo && dopo.nextSibling) pp.insertBefore(rc, dopo.nextSibling); else pp.appendChild(rc);

  function vista(quale) { $('po-accesso').hidden = quale !== 'accesso'; $('po-dentro').hidden = quale !== 'dentro'; }
  function stato(t, errore) { $('po-stato').textContent = t; $('po-stato').className = errore ? 'po-stato no' : 'po-stato'; }
  var soloOrari = function (f) { return f.split(' + ').map(function (y) { return y.split('|')[0]; }).join(' + '); };

  /* l'ultima versione di ogni giorno, presa da tutte le copie salvate */
  function ultime(tutte) {
    var S = CO.storia(tutte), turni = [];
    Object.keys(S).forEach(function (d) { turni = turni.concat(S[d][S[d].length - 1].turni); });
    return { turni: turni, storia: S };
  }

  function disegnaSettimana(tutte, S) {
    var lista = $('po-lista'); lista.textContent = '';
    var buone = CO.leggibili(tutte), ultima = buone[buone.length - 1];
    if (!ultima) { $('po-copie').textContent = tutte.length ? 'Le copie salvate non hanno turni leggibili.' : 'Nessuna copia salvata finora.'; return; }
    var pross = ultima.dati.prossima;
    [['Questa settimana', function (d) { return !pross || d < pross; }], ['Prossima settimana', function (d) { return pross && d >= pross; }]].forEach(function (gr) {
      var giorni = ultima.dati.turni.filter(function (t) { return gr[1](t.data); });
      if (!giorni.length) return;
      lista.appendChild(el('div', 'po-sett', gr[0]));
      giorni.forEach(function (t) {
        var s = S[t.data] || [], riga = el('div', 'po-g' + (s.length > 1 ? ' cambiato' : ''));
        var r1 = el('div', 'r1'); r1.appendChild(el('span', '', CO.giorno(t.data)));
        r1.appendChild(el('b', '', CO.orario(t) + (CO.ore(t) ? ' · ' + CO.ore(t) : ''))); riga.appendChild(r1);
        if (t.servizio) {
          var ind = t.indirizzoServizio || {}, dove = [ind.indirizzo, ind.citta].filter(Boolean).join(', ');
          riga.appendChild(el('div', 'r2', String(t.servizio).trim() + (dove ? ' · ' + dove : '')));
        }
        s.slice(0, -1).forEach(function (x) { riga.appendChild(el('div', 'prima', 'prima: ' + soloOrari(x.f) + ' (visto il ' + CO.oraIt(x.quando) + ')')); });
        lista.appendChild(riga);
      });
    });
    $('po-invia').onclick = function () { CO.invia(ultima); };
    var ult = tutte[tutte.length - 1], ore = (Date.now() - new Date(ult.salvata_il).getTime()) / 3600000;
    $('po-copie').textContent = (tutte.length === 1 ? '1 copia salvata' : tutte.length + ' copie salvate') + ' sul telefono · l’ultima del ' + CO.oraIt(ult.salvata_il) + '.' +
      (ore > 36 ? ' Il portale mostra solo questa settimana e la prossima: le settimane passate non si recuperano più.' : '');
    $('po-copie').style.color = ore > 36 ? 'var(--warn)' : '';
  }

  /* portale, registro e busta, mese per mese */
  function disegnaRiscontro(U) {
    var regP = R.regDaTurniPortale(U.turni), reg = R.reg(), buste = R.leggiBuste(), mesi = {};
    Object.keys(regP).forEach(function (d) { mesi[d.slice(0, 7)] = 1; });
    Object.keys(buste).forEach(function (ym) { mesi[ym] = 1; });
    Object.keys(reg).forEach(function (d) { if (reg[d] && (reg[d].t && reg[d].t.length || reg[d].s)) mesi[d.slice(0, 7)] = 1; });
    var elenco = Object.keys(mesi).filter(function (ym) { return /^\d{4}-(0[1-9]|1[0-2])$/.test(ym); }).sort().reverse().slice(0, 6), tab = $('po-tab'), note = [];
    if (!elenco.length) { tab.innerHTML = ''; $('po-nota').textContent = 'Qui compaiono, mese per mese, le ore del portale, del registro e della busta.'; return; }
    var h = '<tr class="sub"><td>Mese</td><td>Portale</td><td>Registro</td><td>Busta</td></tr>';
    elenco.forEach(function (ym) {
      var giorniP = Object.keys(regP).filter(function (d) { return d.slice(0, 7) === ym; });
      // il portale dichiara i minuti di ogni turno: sono quelli che l'istituto conta; gli orari li ricontano con la regola del registro
      var minP = 0, conMinuti = true;
      U.turni.forEach(function (t) {
        if (String(t.data).slice(0, 7) !== ym || String(t.tipoGiornata || '').toUpperCase() !== 'TURNO') return;
        if (+t.minutiTurno > 0) minP += t.minutiTurno / 60; else conMinuti = false;
      });
      var oreOrari = giorniP.length ? R.riepilogo(ym, regP).ore : null;
      var oreP = giorniP.length ? (conMinuti ? minP : oreOrari) : null;
      var oreR = R.riepilogo(ym).ore;
      var B = buste[ym], oreB = B ? R.inputDaBusta(B).ore : null;
      // sugli stessi giorni, registro e orari del portale devono coincidere: se no, ci sono giorni segnati a mano
      var stessi = {}; giorniP.forEach(function (d) { if (reg[d]) stessi[d] = reg[d]; });
      var oreRP = giorniP.length ? R.riepilogo(ym, stessi).ore : null;
      var dPM = oreP != null && Math.abs(oreP - oreOrari) >= 0.05;
      var dRP = oreOrari != null && Math.abs(oreRP - oreOrari) >= 0.05, dRB = oreB != null && Math.abs(oreR - oreB) >= 0.5;
      var nome = MESI[+ym.slice(5, 7) - 1] + ' ' + ym.slice(0, 4);
      h += '<tr><td>' + nome + '</td><td' + (dPM ? ' class="diff"' : '') + '>' + (oreP == null ? '—' : num(oreP) + ' h') + '</td><td' + (dRP || dRB ? ' class="diff"' : '') + '>' + num(oreR) + ' h</td><td' + (dRB ? ' class="diff"' : '') + '>' + (oreB == null ? '—' : num(oreB) + ' h') + '</td></tr>';
      if (giorniP.length) note.push(nome + ': portale su ' + giorniP.length + (giorniP.length === 1 ? ' giorno' : ' giorni') + (dRP ? ', dove il registro ha ' + num(oreRP) + ' h (giorni segnati a mano)' : ''));
      if (dPM) note.push(nome + ': il portale dichiara ' + num(oreP) + ' h, dagli orari risultano ' + num(oreOrari) + ' h');
      if (dRB) note.push(nome + ': la busta paga ' + num(oreB) + ' h, il registro ne ha ' + num(oreR) + ' (' + (oreR > oreB ? '+' : '') + num(oreR - oreB) + ' h)');
    });
    tab.innerHTML = h;
    $('po-nota').textContent = 'Portale: le ore dichiarate dal portale, ultima versione di ogni giorno salvato. Registro: le ore segnate nel mese. Busta: le ore pagate, lette dal PDF.' + (note.length ? ' ' + note.join(' · ') + '.' : '');

    var cambiati = Object.keys(U.storia).filter(function (d) { return U.storia[d].length > 1; }).sort().reverse(), box = $('po-var');
    box.textContent = '';
    if (!cambiati.length) return;
    var det = el('details'), sm = el('summary', '', 'Variazioni del portale: ' + cambiati.length + (cambiati.length === 1 ? ' giorno' : ' giorni'));
    det.appendChild(sm); var dentro = el('div', 'b');
    cambiati.forEach(function (d) {
      dentro.appendChild(el('div', 'po-var', CO.giorno(d) + ' ' + d.slice(0, 4) + ': ' + U.storia[d].map(function (v) { return soloOrari(v.f) + ' (visto il ' + CO.oraIt(v.quando) + ')'; }).join(' → ')));
    });
    det.appendChild(dentro); box.appendChild(det);
  }

  async function disegna(tutte) {
    tutte = tutte || await CO.copie();
    var U = ultime(tutte);
    disegnaSettimana(tutte, U.storia);
    disegnaRiscontro(U);
    return U;
  }
  // segna nel registro l'ultima versione di ogni giorno; i giorni segnati a mano restano come sono
  function importa(U) {
    if (!U.turni.length) return null;
    var e = R.importaTurniPortale(U.turni);
    if (e && e.cambiati && typeof window.toast === 'function') window.toast('Il portale ha cambiato ' + (e.cambiati === 1 ? 'un giorno' : e.cambiati + ' giorni') + ': registro aggiornato.');
    return e;
  }

  /* ---- chiusura del mese: a mese finito il Ruolino prepara da solo il PDF (riepilogo, giorno per giorno, versioni dal portale) ---- */
  var KEY_CHIUSURE = 'gpg_chiusure', KEY_COLLEGATO = 'co_collegato';
  var nomeMese = function (ym) { return MESI[+ym.slice(5, 7) - 1] + ' ' + ym.slice(0, 4); };
  var ymOggi = function () { return CO.isoLocale(new Date()).slice(0, 7); };
  var iOS = function () { return typeof IOS !== 'undefined' ? !!IOS : /iPhone|iPad|iPod/.test(navigator.userAgent); };
  var haDati = function (r) { return !!(r && (r.t && r.t.length || r.s || r.o > 0)); };
  function leggiChiusure() { try { return JSON.parse(localStorage.getItem(KEY_CHIUSURE)) || {}; } catch (e) { return {}; } }
  function salvaChiusure(c) { try { localStorage.setItem(KEY_CHIUSURE, JSON.stringify(c)); } catch (e) { /* pieno */ } }
  function giorniDelMese(ym) { var reg = R.reg(); return Object.keys(reg).filter(function (d) { return d.slice(0, 7) === ym && haDati(reg[d]); }).sort(); }
  // un'impronta del registro del mese: se cambia dopo la chiusura, il mese si richiude
  function improntaMese(ym) {
    var reg = R.reg(), s = JSON.stringify(giorniDelMese(ym).map(function (d) { var r = reg[d]; return [d, r.t, r.s || '', r.o || 0, !!r.n, r.ob || '', r.src || '']; }));
    var h = 5381; for (var i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
    return h.toString(16) + ':' + s.length;
  }
  // si chiudono solo i mesi finiti dal collegamento in poi: i mesi vecchi del registro restano come sono
  function mesiDaChiudere() {
    var da = localStorage.getItem(KEY_COLLEGATO) || '', oggi = ymOggi(), C = leggiChiusure(), reg = R.reg(), mesi = {};
    if (!/^\d{4}-\d{2}$/.test(da)) return [];
    Object.keys(reg).forEach(function (d) { var ym = d.slice(0, 7); if (ym >= da && ym < oggi && haDati(reg[d])) mesi[ym] = 1; });
    return Object.keys(mesi).filter(function (ym) { return !C[ym] || C[ym].impronta !== improntaMese(ym); }).sort();
  }
  function disegnaMese(ym, c) {
    var reg = R.reg(), nGiorni = new Date(+ym.slice(0, 4), +ym.slice(5, 7), 0).getDate();
    var W = 1080, rh = 38, top = 400, H = top + nGiorni * rh + 110;
    var cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    var g = cv.getContext('2d');
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#111821'; g.fillRect(0, 0, W, 150);
    g.fillStyle = '#ffffff'; g.font = '700 46px system-ui,sans-serif'; g.fillText(nomeMese(ym) + (c.operatore ? ' · ' + c.operatore : ''), 48, 72);
    g.font = '400 30px system-ui,sans-serif'; g.fillText('Chiuso il ' + CO.oraIt(c.chiuso_il) + ' · Ruolino Paga', 48, 120);
    g.fillStyle = '#111821'; g.font = '600 34px system-ui,sans-serif';
    g.fillText(num(c.ore) + ' ore · ' + c.gg + ' giorni · ' + c.notti + ' notti' + (c.fest ? ' · ' + num(c.fest) + ' h festive' : '') + (c.ferie ? ' · ' + c.ferie + ' ferie o permessi' : ''), 48, 215);
    if (c.netto != null) { g.font = '400 30px system-ui,sans-serif'; g.fillText('Netto stimato dal Ruolino: ' + Math.round(c.netto).toLocaleString('it-IT') + ' €', 48, 262); }
    g.fillStyle = '#475569'; g.font = '600 24px system-ui,sans-serif';
    g.fillText('GIORNO', 48, 340); g.fillText('ORARIO', 220, 340); g.fillText('ORE', 560, 340); g.fillText('POSTO', 660, 340); g.fillText('FONTE', 975, 340);
    var y = top, FONTE = { portale: 'P', pdf: 'F', man: 'M', rot: 'R' };
    for (var d = 1; d <= nGiorni; d++) {
      var s = ym + '-' + due(d), r = reg[s], con = haDati(r);
      if (d % 2 === 0) { g.fillStyle = '#f3f5f9'; g.fillRect(0, y - 27, W, rh); }
      g.fillStyle = con ? '#111821' : '#94a3b8'; g.font = '500 26px system-ui,sans-serif';
      g.fillText(CO.giorno(s).split(' ').slice(0, 2).join(' '), 48, y);
      var orario = !con ? '—' : r.t && r.t.length ? r.t.map(function (t) { return t.i + '–' + (t.f || '…'); }).join(' + ') + (r.o > 0 ? ' + ' + num(r.o) + ' h' : '') : r.s ? r.s : num(r.o) + ' h';
      g.font = '600 26px ui-monospace,Menlo,Consolas,monospace'; g.fillText(orario.slice(0, 24), 220, y);
      g.font = '500 26px system-ui,sans-serif'; g.fillText(con && (r.t && r.t.length || r.o > 0) ? num(R.oreGiorno(r)) : '', 560, y);
      g.fillStyle = '#475569'; g.font = '400 24px system-ui,sans-serif'; g.fillText(con ? String(r.ob || '').slice(0, 26) : '', 660, y);
      g.fillText(con ? (FONTE[r.src] || 'M') : '', 1000, y);
      y += rh;
    }
    g.fillStyle = '#475569'; g.font = '400 22px system-ui,sans-serif';
    g.fillText('Fonte: P portale dei turni · F foglio di servizio · M segnato a mano · R rotazione.' + (c.versioni ? ' Seguono ' + c.versioni + (c.versioni === 1 ? ' versione' : ' versioni') + ' dei turni dal portale.' : ''), 48, H - 40);
    return cv;
  }
  // le versioni dei turni dal portale che toccano il mese, senza ripetere quelle uguali alla precedente
  function copieDelMese(ym, tutte) {
    var out = [], prima = null;
    CO.leggibili(tutte).forEach(function (c) {
      if (!c.dati.turni.some(function (t) { return String(t.data).slice(0, 7) === ym; })) return;
      var f = JSON.stringify(c.dati.turni); if (f === prima) return; prima = f; out.push(c);
    });
    return out;
  }
  async function pdfMese(ym) {
    var C = leggiChiusure(), c = C[ym]; if (!c) return null;
    var versioni = copieDelMese(ym, await CO.copie());
    c.versioni = versioni.length;
    var pagine = [await CO.jpeg(disegnaMese(ym, c))];
    for (var i = 0; i < versioni.length; i++) pagine.push(await CO.jpeg(CO.disegnaCopia(versioni[i])));
    return new File([CO.pdfDaImmagini(pagine)], 'ruolino_' + String(c.operatore || 'turni').replace(/[^\w-]/g, '') + '_' + ym + '.pdf', { type: 'application/pdf' });
  }
  function chiudiMese(ym) {
    var riep = R.riepilogo(ym), C = leggiChiusure(), vecchia = C[ym], netto = null;
    try { netto = R.nettoDaRegistro(ym); if (!isFinite(netto)) netto = null; } catch (e) { netto = null; }
    C[ym] = { chiuso_il: CO.isoLocale(new Date()), impronta: improntaMese(ym), ore: riep.ore, gg: riep.gg, notti: riep.notti, fest: riep.fest, ferie: riep.ferie, netto: netto,
      operatore: (CO.credenziali() || {}).codice || '', aggiornata: !!vecchia, inviato_il: null, salvato_il: null };
    salvaChiusure(C);
    if (vecchia) togliAvviso('mese-' + ym, true);   // il mese è cambiato: l'avviso vecchio non vale più, e torna anche se era stato rimandato
    return C[ym];
  }
  function togliAvviso(id, ancheRimando) {
    Array.prototype.forEach.call(document.querySelectorAll('#avvisi [data-id]'), function (x) { if (x.getAttribute('data-id') === id) x.remove(); });
    if (ancheRimando) { try { var a = JSON.parse(localStorage.getItem('gpg_avvisi')) || {}; delete a[id]; localStorage.setItem('gpg_avvisi', JSON.stringify(a)); } catch (e) { /* niente */ } }
  }
  // su Android il PDF finisce fra i download da solo; su iPhone serve il tocco su «Manda a te stesso»
  async function salvaMeseSulTelefono(ym) {
    if (iOS() || typeof window.scarica !== 'function') return false;
    var f = await pdfMese(ym); if (!f) return false;
    var ok = !!window.scarica(f, f.name);
    if (ok) { var C = leggiChiusure(); if (C[ym]) { C[ym].salvato_il = CO.isoLocale(new Date()); salvaChiusure(C); } }
    return ok;
  }
  async function mandaMese(ym) {
    var f = await pdfMese(ym); if (!f) return false;
    var C = leggiChiusure(), r = null;
    if (typeof window.condividi === 'function') { try { r = await window.condividi({ title: 'Turni ' + nomeMese(ym), text: 'Turni ' + nomeMese(ym) + ' · ' + num(C[ym].ore) + ' ore', files: [f] }); } catch (e) { r = null; } }
    if (r === 'abort') return false;
    if (r === 'share') { C[ym].inviato_il = CO.isoLocale(new Date()); if (typeof window.chiudiAvviso === 'function') window.chiudiAvviso('mese-' + ym); togliAvviso('mese-' + ym); }
    else { if (typeof window.scarica !== 'function' || !window.scarica(f, f.name)) return false; C[ym].salvato_il = CO.isoLocale(new Date()); }
    salvaChiusure(C); renderMesi(); return true;
  }
  // l'avviso resta finché il PDF non è stato mandato; «Più tardi» lo rimanda di tre giorni
  function avvisoMese(ym, c) {
    var id = 'mese-' + ym, nome = nomeMese(ym);
    if (typeof window.mostraAvviso !== 'function' || c.inviato_il) return;
    if (typeof window.avvisoChiuso === 'function' && window.avvisoChiuso(id, 3)) return;
    window.mostraAvviso(id, (c.aggiornata ? 'Il mese di ' + nome + ' è cambiato dopo la chiusura: ' : nome + ' è chiuso: ') + num(c.ore) + ' ore in ' + c.gg + ' giorni. Il PDF del mese' +
      (c.salvato_il ? ' è fra i download' : ' è pronto') + ': mandalo a te stesso, così resta anche fuori dal telefono.', [
      { t: 'Manda a te stesso', primo: true, f: function () { mandaMese(ym); } },
      { t: 'Più tardi', f: function () { if (typeof window.chiudiAvviso === 'function') window.chiudiAvviso(id); } }
    ]);
  }
  function renderMesi() {
    var box = $('po-mesi'); if (!box) return; box.textContent = '';
    var C = leggiChiusure(), mesi = Object.keys(C).sort().reverse(); if (!mesi.length) return;
    box.appendChild(el('div', 'po-sett', 'Mesi chiusi'));
    mesi.forEach(function (ym) {
      var c = C[ym], riga = el('div', 'po-mese'), testo = el('div', '', nomeMese(ym) + ' · ' + num(c.ore) + ' h · ' + c.gg + ' gg');
      testo.appendChild(el('span', 'q', c.inviato_il ? 'inviato il ' + CO.oraIt(c.inviato_il) : c.salvato_il ? 'fra i download dal ' + CO.oraIt(c.salvato_il) + ', non ancora inviato' : 'non ancora inviato'));
      riga.appendChild(testo);
      var b = el('button', 'btn', c.inviato_il ? 'Manda di nuovo' : 'Manda a te stesso'); b.type = 'button'; b.onclick = function () { mandaMese(ym); };
      riga.appendChild(b); box.appendChild(riga);
    });
  }
  var chiusuraInCorso = false;
  async function controllaChiusure() {
    if (chiusuraInCorso) return; chiusuraInCorso = true;
    try {
      var mesi = mesiDaChiudere();
      for (var i = 0; i < mesi.length; i++) { chiudiMese(mesi[i]); if (i === mesi.length - 1) await salvaMeseSulTelefono(mesi[i]); }
      // il calcolo segue il mese in corso quando il mese collegato è chiuso e quello nuovo ha già dei turni
      var link = localStorage.getItem('gpg_link') || '', oggi = ymOggi(), usa = R.usaNelCalcolo || window.usaNelCalcolo;
      if (mesi.length && link && link < oggi && giorniDelMese(oggi).length && typeof usa === 'function') usa(oggi, true);
      var C = leggiChiusure(), daMandare = Object.keys(C).filter(function (ym) { return !C[ym].inviato_il; }).sort().pop();
      if (daMandare) avvisoMese(daMandare, C[daMandare]);
      renderMesi();
    } finally { chiusuraInCorso = false; }
  }

  var ultimoGiro = 0;
  async function aggiorna() {
    if (!CO.credenziali()) { vista('accesso'); return; }
    vista('dentro'); stato('Aggiorno i turni dal portale…'); ultimoGiro = Date.now();
    var r = await CO.aggiorna();
    if (!r.ok) {
      if (r.motivo === 'credenziali' || r.motivo === 'accesso') { vista('accesso'); $('po-acc-msg').textContent = CO.spiega(r.motivo); return; }
      stato(CO.spiega(r.motivo), true); return;
    }
    var U = await disegna(), e = importa(U);
    if (e && e.scritti) U = await disegna();
    var hm = due(r.quando.getHours()) + ':' + due(r.quando.getMinutes());
    var t = r.cambiati ? 'Turni cambiati: copia salvata alle ' + hm : r.salvata ? 'Copia salvata alle ' + hm : 'Aggiornato alle ' + hm + ' · nessun cambio';
    if (e && e.scritti) t += ' · registro: ' + e.scritti + (e.scritti === 1 ? ' giorno segnato' : ' giorni segnati');
    if (r.ricevute) t += ' · ' + (r.ricevute === 1 ? '1 copia arrivata' : r.ricevute + ' copie arrivate') + ' dal guardiano';
    stato(t + ' ✓');
    await controllaChiusure();
    if (r.altre) aggiorna();                       // ne restano altre nella cassetta: un altro giro le porta giù
  }

  $('po-entra').onclick = function () {
    var codice = $('po-codice').value.trim().toUpperCase(), password = $('po-password').value;
    if (!codice || !password) { $('po-acc-msg').textContent = 'Scrivi codice e password.'; return; }
    CO.salvaCredenziali(codice, password);
    if (!localStorage.getItem(KEY_COLLEGATO)) localStorage.setItem(KEY_COLLEGATO, ymOggi());
    $('po-password').value = ''; $('po-acc-msg').textContent = '';
    aggiorna();
  };
  $('po-aggiorna').onclick = aggiorna;
  $('po-archivio').onclick = async function () { if (!(await CO.esportaPDF())) stato('Nessuna copia da esportare.', true); };
  $('po-esci').onclick = function () {
    if (confirm('Togliere codice e password da questo telefono? Le copie e il registro restano.')) { CO.esci(); vista('accesso'); }
  };
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && CO.credenziali() && Date.now() - ultimoGiro > 120000) aggiorna();
  });

  vista(CO.credenziali() ? 'dentro' : 'accesso');
  if (CO.credenziali() && !localStorage.getItem(KEY_COLLEGATO)) localStorage.setItem(KEY_COLLEGATO, ymOggi());   // collegato con una versione precedente
  disegna().then(function (U) { var e = importa(U); return e && e.scritti ? disegna() : U; })
    .then(function () { return controllaChiusure(); })
    .then(function () { if (CO.credenziali()) aggiorna(); });
  window.RuolinoPortale = { disegna: disegna, aggiorna: aggiorna, ultime: ultime, controllaChiusure: controllaChiusure, pdfMese: pdfMese, mandaMese: mandaMese, chiusure: leggiChiusure, mesiDaChiudere: mesiDaChiudere, disegnaMese: disegnaMese };
})();
