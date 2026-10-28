# Conta Ore · Salva turni

La copia dei propri turni, sul proprio telefono.

Quando i turni stanno solo su un portale aziendale, con gli orari nascosti dietro un tasto, a chi lavora non resta niente in mano. **Salva turni** è un segnalibro: sulla pagina dei turni, dopo l'accesso, con un tocco

- scrive l'orario accanto a ogni turno, sulla pagina stessa;
- ne fa una foto con data e ora del salvataggio, e dentro la foto mette anche i dati;
- salva i dati della settimana insieme alla pagina originale e alla sua impronta (SHA-256);
- li fa mandare a sé stessi su WhatsApp o per email;
- li mette in un archivio sul telefono, versione per versione, così si vede quando un turno è cambiato.

C'è anche uno script per Google Apps Script che salva da solo su Drive le email coi turni, allegato ed email intera.

Il segnalibro non legge password e non manda niente a nessuno: i dati restano sul telefono finché non li invia chi li ha salvati. Nessun server, nessun account.

Istruzioni: https://conta-ore.github.io/

La foto della pagina usa [html-to-image](https://github.com/bubkoo/html-to-image) (licenza MIT, copia in `lib/`).

Non è un servizio legale: per una vertenza i file si portano al sindacato o a un avvocato del lavoro.
