(function () {
  'use strict';
  var CO = window.ContaOre;
  var $ = function (id) { return document.getElementById(id); };
  var due = function (n) { return (n < 10 ? '0' : '') + n; };
  var giorno = CO.giorno, orario = CO.orario, ore = CO.ore, oraIt = CO.oraIt;

  function mostra(id) { ['accesso', 'turni'].forEach(function (x) { $(x).hidden = x !== id; }); }
  function stato(t, errore) { $('stato').textContent = t; $('stato').className = errore ? 'stato no' : 'stato'; }

  async function disegna() {
    var tutte = await CO.copie(), buone = CO.leggibili(tutte);
    var ultima = buone[buone.length - 1];
    var lista = $('lista'); lista.textContent = '';
    if (!ultima) return;
    var storia = CO.storia(tutte);
    var pross = ultima.dati.prossima;
    [['Questa settimana', function (d) { return !pross || d < pross; }], ['Prossima settimana', function (d) { return pross && d >= pross; }]].forEach(function (gr) {
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
          var ind = t.indirizzoServizio || {}, dove = [ind.indirizzo, ind.citta].filter(Boolean).join(', ');
          c.textContent = String(t.servizio).trim() + (dove ? ' · ' + dove : '');
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
    $('invia').onclick = function () { CO.invia(ultima); };
    $('copie').textContent = (tutte.length === 1 ? '1 copia salvata sul telefono' : tutte.length + ' copie salvate sul telefono') + ' · l’ultima del ' + oraIt(tutte[tutte.length - 1].salvata_il);
  }

  async function aggiorna() {
    if (!CO.credenziali()) { mostra('accesso'); return; }
    mostra('turni');
    stato('Aggiorno i turni…');
    var r = await CO.aggiorna();
    if (!r.ok) {
      if (r.motivo === 'credenziali' || r.motivo === 'accesso') { mostra('accesso'); $('acc-msg').textContent = CO.spiega(r.motivo); return; }
      stato(CO.spiega(r.motivo), true); return;
    }
    var hm = due(r.quando.getHours()) + ':' + due(r.quando.getMinutes());
    stato((r.cambiati ? 'Turni cambiati: copia salvata alle ' + hm : r.salvata ? 'Copia salvata alle ' + hm : 'Aggiornato alle ' + hm + ' · nessun cambio') +
      (r.ricevute ? ' · ' + (r.ricevute === 1 ? '1 copia arrivata' : r.ricevute + ' copie arrivate') + ' dal guardiano' : '') + ' ✓');
    await disegna();
    if (r.altre) aggiorna();
  }

  $('entra').onclick = function () {
    var codice = $('codice').value.trim().toUpperCase(), password = $('password').value;
    if (!codice || !password) { $('acc-msg').textContent = 'Scrivi codice e password.'; return; }
    CO.salvaCredenziali(codice, password);
    $('password').value = ''; $('acc-msg').textContent = '';
    aggiorna();
  };
  $('esci').onclick = function () { if (confirm('Togliere codice e password da questo telefono? Le copie salvate restano.')) { CO.esci(); mostra('accesso'); } };
  $('archivio').onclick = async function () { if (!(await CO.esportaPDF())) stato('Nessuna copia da esportare.', true); };

  var standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  var iOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (!standalone && iOS) { $('installa').hidden = false; $('inst-ios').hidden = false; }
  var richiesta = null;
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); richiesta = e; if (!standalone) { $('installa').hidden = false; $('inst-and').hidden = false; } });
  $('inst-and').onclick = function () { if (richiesta) { richiesta.prompt(); richiesta = null; $('installa').hidden = true; } };
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function () { /* niente */ });

  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && CO.credenziali()) aggiorna(); });
  disegna().then(aggiorna);
})();
