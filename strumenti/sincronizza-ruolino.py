"""Porta nel Ruolino pubblico (../ruolino-paga) i file del collegamento al portale: config.js, nucleo.js, portale.js.

La sorgente di questi tre file è qui, in Conta Ore; il Ruolino li riceve copiati, mai modificati a mano.
Controlla anche che la pagina del Ruolino li carichi e che sia nell'edizione istituzionale.

Uso:  python strumenti/sincronizza-ruolino.py
"""
import hashlib
import pathlib
import shutil
import sys

QUI = pathlib.Path(__file__).resolve().parent.parent
RUOLINO = QUI.parent / 'ruolino-paga'
FILE = [QUI / 'config.js', QUI / 'nucleo.js', QUI / 'portale.js']


def impronta(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()[:12]


def main():
    pagina = RUOLINO / 'index.html'
    if not pagina.exists():
        sys.exit(f'non trovo il Ruolino in {RUOLINO}')
    html = pagina.read_text(encoding='utf-8')
    if 'data-edizione="istituzionale"' not in html:
        sys.exit('il Ruolino pubblico non è nell\'edizione istituzionale')
    for f in FILE:
        if f'<script src="{f.name}"></script>' not in html:
            sys.exit(f'la pagina del Ruolino non carica {f.name}')
        dest = RUOLINO / f.name
        prima = impronta(dest) if dest.exists() else '-'
        shutil.copyfile(f, dest)
        print(f'{f.name:12} {prima} → {impronta(dest)}' + ('' if prima != impronta(dest) else '  (uguale)'))
    print('fatto')


if __name__ == '__main__':
    main()
