# Changelog

Tutte le modifiche rilevanti a Study Buddy sono elencate qui, dalle più recenti.

## 2026-11-15

- Fix: la barra spaziatrice su un pulsante attivo (Start/Pausa/Reset) non avvia-e-ferma piu' il timer due volte: le scorciatoie da tastiera ora ignorano anche button, select e textarea, non solo i campi di testo. Coperto da test.

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
