// Conta Ore · ponte
// Passa al portale dei turni le richieste dell'app e le restituisce. Non salva né credenziali né turni degli utenti dell'app.
// Variabili: PORTALE (indirizzo del portale, es. https://turni.esempio.it), ORIGINI (siti ammessi, separati da virgola).
// Guardiano a orario (facoltativo): con il binding KV COPIE e i segreti CODICE e PASSWORD entra nel portale da solo,
// salva nella cassetta una copia quando i turni cambiano o una volta al giorno, e la consegna all'app alla prima apertura.
const PORTALE_PREDEFINITO = '';
const UA = { 'user-agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Mobile Safari/537.36' };
const portale = env => String(env.PORTALE || PORTALE_PREDEFINITO).replace(/\/+$/, '');

const ammessi = env => String(env.ORIGINI || 'https://conta-ore.github.io,https://ruolino-paga.github.io').split(',').map(s => s.trim()).filter(Boolean);
function cors(req, env) {
  const ammessi_ = ammessi(env), o = req.headers.get('origin') || '';
  return {
    'access-control-allow-origin': ammessi_.includes(o) ? o : ammessi_[0],
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '86400',
    vary: 'origin'
  };
}
const json = (dati, req, env, stato) => new Response(JSON.stringify(dati), {
  status: stato || 200, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...cors(req, env) }
});
const leggiCookie = r => (r.headers.getSetCookie ? r.headers.getSetCookie() : []).map(c => c.split(';')[0]).filter(Boolean);
const unisci = (vecchia, nuovi) => {
  const m = new Map();
  String(vecchia || '').split(';').map(s => s.trim()).filter(Boolean).forEach(c => m.set(c.split('=')[0], c));
  nuovi.forEach(c => m.set(c.split('=')[0], c));
  return [...m.values()].join('; ');
};
async function sha256(testo) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(testo));
  return [...new Uint8Array(h)].map(b => (b < 16 ? '0' : '') + b.toString(16)).join('');
}
// nella pagina del portale: a chi appartiene e il testo dell'elenco dei turni (stesso flusso di dati che legge l'app)
function testoPagina(html) {
  let s = '';
  for (const m of html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)) { try { s += JSON.parse(m[1]); } catch (e) { /* pezzo non testuale */ } }
  return s;
}
function aliasPagina(html) { const m = testoPagina(html).match(/"alias":"([^"]+)"/); return m ? m[1].trim().toUpperCase() : null; }
function testoTurni(html) {
  const s = testoPagina(html); let i = s.indexOf('"turni":['); if (i < 0) return null;
  i = s.indexOf('[', i); let d = 0, inStr = false, sc = false;
  for (let j = i; j < s.length; j++) {
    const c = s[j];
    if (inStr) { if (sc) sc = false; else if (c === '\\') sc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true; else if (c === '[') d++; else if (c === ']') { d--; if (d === 0) return s.slice(i, j + 1); }
  }
  return null;
}

// Tentativi falliti, per codice e per indirizzo: tenuti nella memoria del ponte, che Cloudflare può azzerare quando vuole.
const QUARTO = 15 * 60 * 1000, TENTATIVI = new Map();
function troppi(chiave, limite) {
  const ora = Date.now(), t = (TENTATIVI.get(chiave) || []).filter(x => ora - x < QUARTO);
  TENTATIVI.set(chiave, t);
  if (TENTATIVI.size > 5000) for (const [k, v] of TENTATIVI) if (!v.some(x => ora - x < QUARTO)) TENTATIVI.delete(k);
  return t.length >= limite;
}
const conta = chiave => { const t = TENTATIVI.get(chiave) || []; t.push(Date.now()); TENTATIVI.set(chiave, t); };
const sconta = chiave => { const t = TENTATIVI.get(chiave); if (t && t.length) t.pop(); };

async function accedi(P, codice, password) {
  const g = await fetch(P + '/login', { headers: UA });
  const html = await g.text();
  const val = (t, a) => { const m = t.match(new RegExp(a + '="([^"]*)"')); return m ? m[1].replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&') : null; };
  const fd = new FormData();
  for (const m of html.matchAll(/<input[^>]*>/g)) {
    const n = val(m[0], 'name'); if (!n) continue;
    if (n === 'alias') fd.append(n, codice);
    else if (n === 'password') fd.append(n, password);
    else fd.append(n, val(m[0], 'value') ?? '');
  }
  if (!fd.has('alias') || !fd.has('password')) return { ok: false, motivo: 'modulo di accesso cambiato' };
  const r = await fetch(P + '/login?from=%2F', {
    method: 'POST', body: fd, redirect: 'manual',
    headers: { ...UA, origin: P, referer: P + '/login?from=%2F', cookie: leggiCookie(g).join('; ') }
  });
  const cookie = leggiCookie(r);
  if (cookie.length) return { ok: true, sessione: unisci(leggiCookie(g).join('; '), cookie) };
  const t = await r.text();
  if (/credenziali non valide/i.test(t)) return { ok: false, motivo: 'credenziali' };
  return { ok: false, motivo: 'risposta inattesa del portale (' + r.status + ')' };
}

async function turni(P, sessione) {
  const r = await fetch(P + '/turni', { redirect: 'manual', headers: { ...UA, cookie: sessione } });
  if (r.status >= 300 && r.status < 400) return { ok: false, scaduta: true };
  const html = await r.text();
  return { ok: r.ok, html, stato: r.status, data_portale: r.headers.get('date'), sessione: unisci(sessione, leggiCookie(r)) };
}

// Le copie della cassetta per un codice, dopo una certa data: solo per chi ha appena dimostrato di essere quel codice.
async function copieGuardiano(env, codice, html, dopo) {
  if (!env.COPIE || !codice || aliasPagina(html) !== codice) return null;
  const prefisso = 'copia:' + codice + ':';
  const elenco = await env.COPIE.list({ prefix: prefisso });
  const nomi = elenco.keys.map(k => k.name).filter(n => n.slice(prefisso.length) > String(dopo || '')).sort();
  const scelte = nomi.slice(0, 12);
  const copie = (await Promise.all(scelte.map(n => env.COPIE.get(n, 'json')))).filter(Boolean);
  return { copie, altre: nomi.length - scelte.length };
}

// Il guardiano: entra con il codice configurato, confronta i turni con l'ultima copia e salva se cambiano o se è passato un giorno.
async function guardiano(env) {
  const P = portale(env), codice = String(env.CODICE || '').trim().toUpperCase(), password = String(env.PASSWORD || '');
  if (!P || !env.COPIE || !codice || !password) return { ok: false, motivo: 'guardiano non configurato' };
  const kSess = 'sessione:' + codice, kUlt = 'ultima:' + codice;
  let sessione = (await env.COPIE.get(kSess)) || '';
  let t = sessione ? await turni(P, sessione) : { ok: false, scaduta: true };
  if (!t.ok && t.scaduta) {
    const a = await accedi(P, codice, password);
    if (!a.ok) return { ok: false, motivo: a.motivo };
    sessione = a.sessione; t = await turni(P, sessione);
  }
  if (!t.ok) return { ok: false, motivo: 'portale non disponibile (' + t.stato + ')' };
  await env.COPIE.put(kSess, t.sessione, { expirationTtl: 7 * 86400 });
  const impronta = await sha256(t.html), turniTxt = testoTurni(t.html);
  const improntaTurni = turniTxt === null ? null : await sha256(turniTxt);
  const ult = await env.COPIE.get(kUlt, 'json');
  const adesso = new Date().toISOString();
  const passatoUnGiorno = !ult || !(Date.now() - Date.parse(ult.salvata_il) < 24 * 3600 * 1000);
  const uguale = !!ult && (improntaTurni !== null ? ult.turni === improntaTurni : ult.sha256 === impronta);
  if (uguale && !passatoUnGiorno) return { ok: true, salvata: false };
  // una copia non si sovrascrive mai: se la chiave esiste già, l'ora avanza di un millisecondo
  let quando = adesso, ms = Date.parse(adesso);
  while ((await env.COPIE.get('copia:' + codice + ':' + quando)) !== null) { ms += 1; quando = new Date(ms).toISOString(); }
  const copia = { salvata_il: quando, data_portale: t.data_portale || null, indirizzo: P + '/turni', sha256: impronta, html: t.html, guardiano: true, leggibile: turniTxt !== null };
  await env.COPIE.put('copia:' + codice + ':' + quando, JSON.stringify(copia));
  await env.COPIE.put(kUlt, JSON.stringify({ sha256: impronta, turni: improntaTurni, salvata_il: quando }));
  return { ok: true, salvata: true, cambiata: !uguale, leggibile: turniTxt !== null };
}

export default {
  async scheduled(evento, env, ctx) {
    ctx.waitUntil(guardiano(env).then(e => console.log('guardiano', JSON.stringify(e)), e => console.log('guardiano errore', String(e))));
  },
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req, env) });
    const url = new URL(req.url);
    if (req.method !== 'POST' || url.pathname !== '/turni') return json({ ok: false, motivo: 'solo POST /turni' }, req, env, 404);
    if (!ammessi(env).includes(req.headers.get('origin') || '')) return json({ ok: false, motivo: 'sito non ammesso' }, req, env, 403);
    const P = portale(env);
    if (!P) return json({ ok: false, motivo: 'ponte non configurato' }, req, env, 500);
    let d;
    try { d = await req.json(); } catch (e) { return json({ ok: false, motivo: 'richiesta non valida' }, req, env, 400); }
    // il codice è normalizzato una volta sola: lo stesso valore va al portale e al conto dei tentativi
    const codice = String(d.codice || '').trim().toUpperCase().slice(0, 40), password = String(d.password || '').slice(0, 200);
    if (codice && !/^[A-Z0-9][A-Z0-9._-]*$/.test(codice)) return json({ ok: false, motivo: 'credenziali' }, req, env);
    let sessione = String(d.sessione || '').slice(0, 4000), nuovoAccesso = false;
    try {
      let t = sessione ? await turni(P, sessione) : { ok: false, scaduta: true };
      if (!t.ok && t.scaduta) {
        if (!codice || !password) return json({ ok: false, motivo: 'accesso' }, req, env);
        const ip = 'ip:' + (req.headers.get('cf-connecting-ip') || '?'), cod = 'codice:' + codice;
        if (troppi(cod, 5) || troppi(ip, 20)) return json({ ok: false, motivo: 'troppi tentativi' }, req, env, 429);
        conta(ip); conta(cod);                     // si conta prima: richieste in parallelo non scavalcano il limite
        const a = await accedi(P, codice, password);
        if (!a.ok) { if (a.motivo !== 'credenziali') sconta(cod); return json({ ok: false, motivo: a.motivo }, req, env); }
        sconta(cod);                               // riuscito: si toglie solo questo tentativo
        sessione = a.sessione; nuovoAccesso = true;
        t = await turni(P, sessione);
        if (!t.ok) return json({ ok: false, motivo: t.scaduta ? 'accesso non riuscito' : 'portale non disponibile (' + t.stato + ')' }, req, env);
      }
      if (!t.ok) return json({ ok: false, motivo: 'portale non disponibile (' + t.stato + ')' }, req, env);
      let cassetta = null;
      try { cassetta = await copieGuardiano(env, codice, t.html, String(d.dopo || '').slice(0, 40)); } catch (e) { cassetta = null; }
      return json({ ok: true, html: t.html, data_portale: t.data_portale, ricevuto_dal_ponte: new Date().toISOString(),
        indirizzo: P + '/turni', sessione: t.sessione, nuovo_accesso: nuovoAccesso,
        copie_guardiano: cassetta ? cassetta.copie : [], altre_copie: cassetta ? cassetta.altre : 0 }, req, env);
    } catch (e) {
      return json({ ok: false, motivo: 'portale non raggiungibile' }, req, env, 502);
    }
  }
};
