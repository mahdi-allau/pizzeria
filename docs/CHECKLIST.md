# Checklist di verifica

Specchio di §10 della specifica (`docs/superpowers/specs/2026-11-07-pizzeria-3d-platform-design.md`). Ogni fase ha un cancello: la successiva non inizia finché tutti i punti della precedente non sono dimostrati da un test o da una verifica registrata.

## Fase 0: fondamenta
- [x] Monorepo, tooling e CI locale configurati; `npm test` funziona a vuoto.
- [x] `domain`: tipo `Money` in centesimi, nessun `number` frazionario in API pubbliche.
- [x] Macchina a stati ordine: test su ogni transizione ammessa e su un campione di vietate.
- [x] Documentazione di architettura e glossario presenti in `docs/`.

Verifica: 2026-11-07, `npm test` 52/52 passing (money 11, order-state 41), `npm run typecheck` exit 0

## Fase 1: ordini e verifica prezzi
- [ ] Migrazioni Postgres per le tabelle di §4.1, con i vincoli unique e il blocco UPDATE/DELETE.
- [ ] Prezzo manomesso dal client → `PRICE_MISMATCH`, nessuna riga scritta (test).
- [ ] Stesso `client_order_id` inviato due volte → un solo ordine (test).
- [ ] Snapshot oltre TTL con POS non raggiungibile → `CATALOG_STALE` (test).
- [ ] Crash dopo la transazione, prima della risposta → l'ordine esiste e l'outbox è presente (test).

## Fase 2: POS contract e consegna
- [ ] `PosAdapter` e contract test completi.
- [ ] `SimulatedPos` supera il contract test; la configurazione di produzione lo rifiuta (test).
- [ ] POS offline per N minuti → nessun ordine perso, tutti consegnati al ritorno, nessun duplicato (test).
- [ ] Timeout ambiguo → riconciliazione con `findOrderByTag`, un solo ordine nel POS (test).
- [ ] Totale autorevole discordante → `NEEDS_ATTENTION` (test).
- [ ] `kitchen_print_owner` impossibile da soddisfare → avvio fallito (test).

## Fase 3: contratto di stampa
- [ ] `TicketDocument` con `content_hash` canonico (stesso contenuto, stesso hash).
- [ ] `PrinterDriver` e contract test; due `SimulatedPrinter` con capacità diverse lo superano.
- [ ] Livelli di prova prodotti correttamente per ciascuna capacità di stato (test).
- [ ] Ristampa produce nuova revisione con `COPIA` (test).

## Fase 4: protocollo e core del bridge
- [ ] Schemi del protocollo con test di compatibilità di versione.
- [ ] Giornale SQLite con `PRINTING` scritto prima dei byte (test sull'ordine delle scritture).
- [ ] Kill del processo durante la stampa → al riavvio `UNCERTAIN`, nessuna ristampa automatica (test di caos).
- [ ] Disconnessione e ripresa dal cursore → nessun lavoro perso, nessun duplicato (test di caos).
- [ ] Lavoro riconsegnato → ignorato dal giornale (test).
- [ ] Richiesta con firma errata o chiave revocata → rifiutata (test).

## Fase 5: servizio Windows
- [ ] Pacchetto di installazione e disinstallazione del servizio.
- [ ] Avvio automatico e ripristino dopo crash, verificati.
- [ ] **Riavvio reale di Windows**: il servizio riparte, la coda è intatta, nessun duplicato. Registrare data, macchina, esito.

## Fase 6: prova end-to-end e consegna
- [ ] Scenario completo con simulatori: ordine → POS → stampa → ricevuta → `READY`.
- [ ] Scenario di caos combinato (POS offline + rete caduta + bridge killato).
- [ ] Runbook operatore: `NEEDS_ATTENTION`, ristampa `COPIA`, conferma manuale, revoca chiave bridge.
- [ ] Tabella di tracciabilità V1–V8 → test che li dimostrano, tutti verdi.
