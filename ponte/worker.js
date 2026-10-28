// Conta Ore · ponte
// Passa al portale dei turni le richieste dell'app e le restituisce. Non salva niente: né credenziali, né turni.
// Variabili: PORTALE (indirizzo del portale, es. https://turni.esempio.it), ORIGINI (siti ammessi, separati da virgola).
const UA = { 'user-agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Mobile Safari/537.36' };

function cors(req, env) {
  const ammessi = String(env.ORIGINI || 'https://conta-ore.github.io').split(',').map(s => s.trim());
  const o = req.headers.get('origin') || '';
  return {
    'access-control-allow-origin': ammessi.includes(o) ? o : ammessi[0],
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

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req, env) });
    const url = new URL(req.url);
    if (req.method !== 'POST' || url.pathname !== '/turni') return json({ ok: false, motivo: 'solo POST /turni' }, req, env, 404);
    if (!env.PORTALE) return json({ ok: false, motivo: 'ponte non configurato' }, req, env, 500);
    const P = String(env.PORTALE).replace(/\/+$/, '');
    let d;
    try { d = await req.json(); } catch (e) { return json({ ok: false, motivo: 'richiesta non valida' }, req, env, 400); }
    const codice = String(d.codice || '').slice(0, 40), password = String(d.password || '').slice(0, 200);
    let sessione = String(d.sessione || '').slice(0, 4000), nuovoAccesso = false;
    try {
      let t = sessione ? await turni(P, sessione) : { ok: false, scaduta: true };
      if (!t.ok && t.scaduta) {
        if (!codice || !password) return json({ ok: false, motivo: 'accesso' }, req, env);
        const a = await accedi(P, codice, password);
        if (!a.ok) return json({ ok: false, motivo: a.motivo }, req, env);
        sessione = a.sessione; nuovoAccesso = true;
        t = await turni(P, sessione);
        if (!t.ok) return json({ ok: false, motivo: t.scaduta ? 'accesso non riuscito' : 'portale non disponibile (' + t.stato + ')' }, req, env);
      }
      if (!t.ok) return json({ ok: false, motivo: 'portale non disponibile (' + t.stato + ')' }, req, env);
      return json({ ok: true, html: t.html, data_portale: t.data_portale, ricevuto_dal_ponte: new Date().toISOString(),
        indirizzo: P + '/turni', sessione: t.sessione, nuovo_accesso: nuovoAccesso }, req, env);
    } catch (e) {
      return json({ ok: false, motivo: 'portale non raggiungibile' }, req, env, 502);
    }
  }
};
