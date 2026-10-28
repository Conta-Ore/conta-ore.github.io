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
    '.po-var{font-size:12.5px;padding:6px 0;border-top:1px solid var(--line-2)}.po-var:first-child{border-top:0}';
  document.head.appendChild(st);

  /* riquadro dei turni, in cima alla scheda Turni */
  var card = el('div', 'card'); card.id = 'po-card';
  card.innerHTML = '<h3>Turni dal portale</h3><div class="b">' +
    '<div id="po-accesso" hidden>' +
    '<p class="hint" style="margin:0 0 10px;font-size:12.5px">Il Ruolino entra nel portale dei turni con il tuo codice, segna i turni nel registro e tiene una copia di ogni versione, con data, ora e impronta.</p>' +
    '<div class="g2"><div class="f"><label for="po-codice">Codice operatore</label><input type="text" id="po-codice" autocomplete="username" autocapitalize="characters"></div>' +
    '<div class="f"><label for="po-password">Password</label><input type="password" id="po-password" autocomplete="current-password"></div></div>' +
    '<div class="btnrow"><button type="button" class="btn primary" id="po-entra">Collega il portale</button></div>' +
    '<div class="hint" id="po-acc-msg"></div>' +
    '<div class="hint">Codice e password restano su questo telefono e servono solo per entrare nel portale.</div></div>' +
    '<div id="po-dentro" hidden>' +
    '<div class="po-stato" id="po-stato"></div><div id="po-lista"></div>' +
    '<div class="btnrow"><button type="button" class="btn primary" id="po-invia">Invia la copia</button><button type="button" class="btn" id="po-aggiorna">Aggiorna</button></div>' +
    '<div class="hint" id="po-copie"></div>' +
    '<div class="btnrow"><button type="button" class="btn" id="po-archivio">Esporta l’archivio</button><button type="button" class="btn" id="po-esci">Scollega</button></div></div>' +
    '</div>';
  var pp = $('p-p'); pp.insertBefore(card, pp.firstElementChild);

  /* riquadro del riscontro, dopo il riepilogo del mese */
  var rc = el('div', 'card'); rc.id = 'po-riscontro';
  rc.innerHTML = '<h3>Riscontro delle ore</h3><div class="b"><table id="po-tab"></table><div class="hint" id="po-nota"></div><div id="po-var"></div></div>';
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
    stato(t + ' ✓');
  }

  $('po-entra').onclick = function () {
    var codice = $('po-codice').value.trim().toUpperCase(), password = $('po-password').value;
    if (!codice || !password) { $('po-acc-msg').textContent = 'Scrivi codice e password.'; return; }
    CO.salvaCredenziali(codice, password);
    $('po-password').value = ''; $('po-acc-msg').textContent = '';
    aggiorna();
  };
  $('po-aggiorna').onclick = aggiorna;
  $('po-archivio').onclick = function () { CO.esportaArchivio(); };
  $('po-esci').onclick = function () {
    if (confirm('Togliere codice e password da questo telefono? Le copie e il registro restano.')) { CO.esci(); vista('accesso'); }
  };
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && CO.credenziali() && Date.now() - ultimoGiro > 120000) aggiorna();
  });

  vista(CO.credenziali() ? 'dentro' : 'accesso');
  disegna().then(function (U) { var e = importa(U); return e && e.scritti ? disegna() : U; }).then(function () { if (CO.credenziali()) aggiorna(); });
  window.RuolinoPortale = { disegna: disegna, aggiorna: aggiorna, ultime: ultime };
})();
