"""Costruisce il Ruolino istituzionale (cartella ruolino/) dalla sorgente del Ruolino pubblico.

Una sola sorgente: il calcolo, il registro e le buste sono quelli di ../ruolino-paga, senza copie a mano.
L'edizione cambia solo ciò che la sorgente già prevede (data-edizione="istituzionale": niente parti
goliardiche, testi sobri) e aggiunge il collegamento ai turni del portale (config.js, nucleo.js, portale.js).

Uso:  python strumenti/costruisci-ruolino.py
"""
import json
import pathlib
import re
import shutil
import sys

QUI = pathlib.Path(__file__).resolve().parent.parent
SORGENTE = QUI.parent / 'ruolino-paga'
DEST = QUI / 'ruolino'


def sostituisci(testo, vecchio, nuovo, volte=1):
    n = testo.count(vecchio)
    if n != volte:
        sys.exit(f'la sorgente è cambiata: «{vecchio[:60]}» trovato {n} volte invece di {volte}')
    return testo.replace(vecchio, nuovo)


def pagina():
    s = (SORGENTE / 'index.html').read_text(encoding='utf-8')
    versione = re.search(r"const VERSIONE='([^']+)'", s).group(1)
    s = sostituisci(s, '<!doctype html>\n<html lang="it" data-edizione="istituzionale">',
                    '<!doctype html>\n<!-- generato da strumenti/costruisci-ruolino.py dalla sorgente del Ruolino: non modificare a mano -->\n'
                    '<html lang="it" data-edizione="istituzionale">')
    s = sostituisci(s, '<meta name="description" content="Registro di servizio e stima della retribuzione per guardie particolari giurate. Tutto resta sul telefono.">',
                    '<meta name="description" content="Turni dal portale, registro delle ore e stima della retribuzione. Tutto resta sul telefono.">')
    s = sostituisci(s, '</body>', '<script src="../config.js"></script>\n<script src="../nucleo.js"></script>\n<script src="portale.js"></script>\n</body>')
    for parola in ('data-goliardia', 'data-serio=', "const SERIO="):
        if parola not in s:
            sys.exit(f'nella sorgente manca {parola}: l\'edizione istituzionale non saprebbe cosa nascondere')
    return s, versione


def manifesto():
    m = json.loads((SORGENTE / 'manifest.webmanifest').read_text(encoding='utf-8'))
    m['name'] = 'Ruolino Paga · con i turni del portale'
    m['short_name'] = 'Ruolino'
    m['description'] = 'Turni dal portale, registro delle ore e stima della retribuzione. Tutto resta sul telefono.'
    for sc in m.get('shortcuts', []):
        if sc.get('url', '').endswith('azione=caserma'):
            sc['name'] = sc['short_name'] = 'Pratiche'
        if sc.get('short_name') == 'Registro':
            sc['name'] = 'Registro delle ore'
    return json.dumps(m, ensure_ascii=False, indent=2) + '\n'


def lavoratore(versione):
    s = (SORGENTE / 'sw.js').read_text(encoding='utf-8')
    s = sostituisci(s, "const CACHE = 'ruolino-v1';", f"const CACHE = 'ruolino-ist-{versione}';")
    s = sostituisci(s, "'./icons/apple-touch-icon.png'];", "'./icons/apple-touch-icon.png', './portale.js', '../config.js', '../nucleo.js'];")
    # sullo stesso sito c'è anche Conta Ore: ognuno cancella solo le cache sue
    s = sostituisci(s, "ks.filter(k => k !== CACHE)", "ks.filter(k => k.indexOf('ruolino-ist-') === 0 && k !== CACHE)")
    return s.replace('Ruolino Paga — service worker', 'Ruolino istituzionale — service worker')


def icona_con_orologio(da, a):
    """L'icona del Ruolino con un piccolo orologio: sul telefono si distingue da quella pubblica.
    Il tondo sta dentro la zona sicura delle icone «maskable» (cerchio di raggio 0,4 al centro)."""
    from PIL import Image, ImageDraw
    im = Image.open(da).convert('RGBA')
    w = im.width
    cx = cy = 0.68 * w
    r = 0.12 * w
    d = ImageDraw.Draw(im)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(17, 24, 33, 255), outline=(201, 162, 39, 255), width=max(2, round(w * 0.016)))
    lw = max(2, round(w * 0.018))
    d.line([cx, cy, cx, cy - r * 0.62], fill=(201, 162, 39, 255), width=lw)
    d.line([cx, cy, cx + r * 0.45, cy + r * 0.12], fill=(201, 162, 39, 255), width=lw)
    d.ellipse([cx - lw * 0.7, cy - lw * 0.7, cx + lw * 0.7, cy + lw * 0.7], fill=(201, 162, 39, 255))
    im.save(a, optimize=True)


def main():
    if not (SORGENTE / 'index.html').exists():
        sys.exit(f'non trovo la sorgente in {SORGENTE}')
    DEST.mkdir(exist_ok=True)
    html, versione = pagina()
    (DEST / 'index.html').write_text(html, encoding='utf-8', newline='\n')
    (DEST / 'manifest.webmanifest').write_text(manifesto(), encoding='utf-8', newline='\n')
    (DEST / 'sw.js').write_text(lavoratore(versione), encoding='utf-8', newline='\n')
    icone = DEST / 'icons'
    icone.mkdir(exist_ok=True)
    for f in (SORGENTE / 'icons').glob('*.png'):
        icona_con_orologio(f, icone / f.name)
    if not (DEST / 'portale.js').exists():
        sys.exit('manca ruolino/portale.js')
    print(f'Ruolino istituzionale costruito dalla versione {versione} in {DEST}')


if __name__ == '__main__':
    main()
