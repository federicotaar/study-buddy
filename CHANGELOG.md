# Changelog

Tutte le modifiche rilevanti a Study Buddy sono elencate qui, dalle più recenti.

## 2026-11-25

- `formatMinutes()`: formatta i minuti come "1 h 5 min" dopo i 60 minuti.
- Riepilogo task calcolato da `taskCounts()` (totale, completati, aperti).
- Funzioni per esportare i task come checklist (`exportTasksText`), importarli da testo incollato (`importTasksFromText`) e portare i completati in fondo (`sortDoneLast`).
- `goalDaysThisWeek()`: quanti degli ultimi 7 giorni hanno raggiunto l'obiettivo giornaliero.

## 2026-11-24

- I task piu' lunghi di 2000 caratteri non vengono piu' accettati (prima potevano rendere impossibile il ripristino di un backup).
- Niente task duplicati (confronto senza maiuscole) e massimo 1000 task.
- Serie migliore e durata media delle sessioni nella card statistiche.
- Elenco delle ultime cinque sessioni completate.
- Pulsante per completare o riaprire tutti i task.
- formatTime non mostra piu' valori negativi o NaN.

## 2026-11-19

- Totali settimanali (ultimi 7 giorni) nella card statistiche.
- Serie attuale: giorni consecutivi con almeno una sessione completata.
- Cronologia delle ultime 50 sessioni di lavoro (localStorage, chiave studyBuddy:sessionLog).
- Esportazione CSV delle statistiche giornaliere (exportStatsCsv).
- Segnale acustico WebAudio a fine sessione con fallback a vibrazione/avviso.
- I task si possono ora modificare e riordinare (su/giu').

## 2026-11-15

- Docs: il README elenca ora anche la chiave localStorage `studyBuddy:cycle` e la pausa lunga automatica ogni 4 sessioni di lavoro (entrambe gia' implementate in app.js).

- Pausa e ripresa non riducono piu' i minuti accreditati: i minuti della sessione sono fissati all'impostazione del timer, non riletti a ogni Start.
- Test di regressione per il caso pausa/ripresa.
- Accessibilita': etichetta per il campo dei task e contorni di focus visibili da tastiera.

## 2026-11-14

- Corretto l'URL di clone nel README dopo la rinomina dell'account GitHub in `federicotaar`.
- README: sezione "Contribuire" riscritta in forma standard.
- Il timer accredita i minuti della sessione avviata anche se le impostazioni cambiano a metà sessione.
- Le statistiche tollerano valori corrotti o parziali in localStorage.
- Il titolo della scheda mostra il countdown mentre il timer è attivo.
- Scorciatoie da tastiera: Spazio = start/pausa, R = reset.
- Timer annunciato agli screen reader (aria-live).
- Test smoke node per app.js (`tests/app.test.js`).

## 2026-04-13

- Prima versione pubblica: timer Pomodoro (work/short/long break), lista di task e statistiche giornaliere, tutto client-side su `localStorage`.
