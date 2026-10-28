# Conta Ore

Un'app web, senza installazione, che salva sul telefono una copia dei turni pubblicati sul portale dell'istituto: ogni versione con data, ora e impronta della pagina originale. Le copie restano sul telefono e si possono mandare su WhatsApp o per email.

- `index.html`, `app.js`: l'app.
- `nucleo.js`: lettura del portale, archivio delle copie (solo aggiunte, mai sovrascritte), immagine di prova, invio.
- `ponte/worker.js`: il ponte (Cloudflare Worker) che passa al portale le richieste dell'app e non salva niente. L'indirizzo del portale sta in una variabile, non nel codice pubblico.
- `ruolino/`: il Ruolino Paga collegato ai turni del portale, generato da `strumenti/costruisci-ruolino.py` dalla sorgente del Ruolino pubblico; `ruolino/portale.js` segna i turni nel registro e confronta le ore del portale, del registro e della busta.
- `st.js`: il vecchio segnalibro, lasciato per chi lo ha già.

Tutto gira nel browser del telefono. Codice operatore e password restano sul telefono e servono solo per entrare nel portale attraverso il ponte.
