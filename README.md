# Study Buddy

Study Buddy è un'app semplice per studiare con la tecnica Pomodoro e gestire i task.
Questa versione è client-side: non richiede backend. I dati vengono salvati nel tuo browser (localStorage).

Features:
- Timer Pomodoro (work/short break/long break), con pausa lunga automatica ogni 4 sessioni di lavoro completate
- Lista di task (add/complete/delete, pi&ugrave; modifica e riordino su/gi&ugrave;)
- Statistiche giornaliere: sessioni completate e minuti studiati
- Totali settimanali (ultimi 7 giorni) e serie di giorni consecutivi con almeno una sessione
- Cronologia delle ultime 50 sessioni di lavoro completate
- Esportazione CSV di tutte le statistiche giornaliere (exportStatsCsv da console)
- Segnale acustico (WebAudio) al termine di una sessione, con fallback a vibrazione/avviso
- Countdown nel titolo della scheda mentre il timer è attivo
- Scorciatoie da tastiera: Spazio = start/pausa, R = reset
- Funziona offline: basta aprire index.html

Quick start
-----------
1. Clona la repo:

   git clone https://github.com/federicotaar/study-buddy.git
   cd study-buddy

2. Apri il file `index.html` con il browser (doppio click) oppure esegui un semplice server:

   python -m http.server 5173
   # poi apri http://localhost:5173

3. Usa l'app: imposta i minuti, aggiungi task, premi Start.

Note per sviluppatori
---------------------
- Tutto il codice principale è in `app.js` e `styles.css`.
- Dati memorizzati in localStorage con chiavi:
  - `studyBuddy:tasks` → lista task
  - `studyBuddy:settings` → impostazioni dei minutes
  - `studyBuddy:stats:YYYY-MM-DD` → statistiche giornaliere
  - `studyBuddy:sessionLog` → cronologia delle ultime 50 sessioni completate
  - `studyBuddy:cycle` → sessioni di lavoro completate nel ciclo corrente (scatta la pausa lunga ogni 4)
- Test: `node tests/app.test.js` (stub di DOM e localStorage, nessuna dipendenza)

Licenza
-------
MIT — vedi LICENSE

Contribuire
-----------
Segnalazioni e proposte sono benvenute: apri una issue descrivendo cosa vorresti vedere (es. CI, deploy su GitHub Pages, autenticazione o un backend di sincronizzazione).


## Backup locali, task e obiettivi

La scheda "I tuoi dati" scarica un backup JSON o le statistiche giornaliere in
CSV. Il ripristino JSON chiede conferma, sostituisce solo i dati di Study Buddy
e ferma il timer. Prima di sostituire i dati, salva un backup aggiornato. Non
viene caricato nulla su un server. Se lo spazio del browser non basta, l'app
prova a ripristinare i dati precedenti e segnala l'esito. Conserva sempre il file
originale: localStorage non sostituisce un backup su disco.

Puoi cercare i task per testo ed eliminare quelli completati dopo una conferma.
L'obiettivo giornaliero usa i minuti delle sessioni completate di oggi. Imposta
un intero tra 1 e 1440 minuti; 0 lo disattiva. Cambiare l'obiettivo non modifica
le statistiche. L'obiettivo e incluso nei backup JSON; i vecchi backup senza
obiettivo restano validi e lo disattivano quando vengono ripristinati.
