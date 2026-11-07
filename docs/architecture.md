# Architettura

Sintesi di §2 e §3 della specifica (`docs/superpowers/specs/2026-11-07-pizzeria-3d-platform-design.md`). In caso di divergenza vale la specifica.

## Componenti

```
Cliente --HTTPS--> [ Backend ] <--HTTPS (il bridge si collega)-- [ Print Bridge ] --> Stampanti
                       |                                              (servizio Windows,
                       | PosAdapter (interfaccia)                      coda su disco)
                       v
                  [ POS esistente ]
```

Il POS esistente resta il riferimento per listino, prezzi, numerazione ordini, pagamenti e cassa. PIZZERIA 3D ne conserva copie versionate o riferimenti, mai la fonte di verità.

## Pacchetti

Monorepo TypeScript (Node 22, Postgres 16, SQLite per il bridge, vitest, zod).

| Pacchetto | Responsabilità | Dipende da |
|-----------|----------------|------------|
| `packages/domain` | Tipi, denaro in centesimi interi, macchine a stati. Nessuna I/O. | nulla |
| `packages/pos-contract` | Interfaccia `PosAdapter`, suite di contract test, `SimulatedPos` | domain |
| `packages/print-contract` | `PrinterDriver`, `TicketDocument`, livelli di prova, `SimulatedPrinter` | domain |
| `packages/protocol` | Schemi dei messaggi backend↔bridge, versione, firma | domain |
| `apps/backend` | API ordini, validazione prezzi, outbox, registro bridge | tutti i pacchetti |
| `apps/print-bridge` | Servizio locale, giornale su disco, driver | print-contract, protocol |

## Regola delle dipendenze

- `packages/*` non dipende mai da `apps/*`.
- `domain` non dipende da nulla (nessuna I/O, nessun altro pacchetto).
- Le dipendenze vanno solo verso il basso: `apps` → `packages` di contratto → `domain`.
- I pacchetti di contratto non si dipendono tra loro; condividono solo `domain`.

## Principi trasversali

1. **Persistere prima di rispondere.** Un ordine è "accettato" solo quando è in Postgres insieme alla sua riga di outbox, nella stessa transazione.
2. **Outbox, nessuna consegna esterna nella transazione dell'ordine.** POS e stampa sono effetti dell'outbox, con retry (backoff esponenziale con jitter).
3. **Idempotenza ovunque.** Ogni effetto esterno ha una chiave deterministica; ripeterlo non lo duplica (`client_order_id`, `idempotency_key`, `dedupe_key`).
4. **At-least-once più consumatore idempotente.** La consegna può ripetersi; l'effetto sulla carta no. Il giornale del bridge ignora i lavori già visti.
5. **Un solo stampatore di riferimento per ordine** (`kitchen_print_owner`: `bridge` di default, oppure `pos`). Non si stampa mai due volte per scelta implicita.
6. **Denaro in centesimi interi.** Mai numeri in virgola mobile.

Nel dubbio sulla stampa (stato `UNCERTAIN`) si sceglie di non stampare in automatico e di avvisare l'operatore.

## Stato di implementazione

| Fase | Contenuto | Stato |
|------|-----------|-------|
| 0 | Fondamenta: monorepo, `Money`, macchina a stati ordine, documentazione | completata |
| 1 | Ordini e verifica prezzi (migrazioni Postgres, `PRICE_MISMATCH`, idempotenza, `CATALOG_STALE`) | da fare |
| 2 | POS contract e consegna (`PosAdapter`, `SimulatedPos`, riconciliazione) | da fare |
| 3 | Contratto di stampa (`TicketDocument`, `PrinterDriver`, livelli di prova) | da fare |
| 4 | Protocollo e core del bridge (giornale SQLite, test di caos) | da fare |
| 5 | Servizio Windows (installazione, ripristino, riavvio reale) | da fare |
| 6 | Prova end-to-end e consegna (scenari completi, runbook, tracciabilità V1–V8) | da fare |

I cancelli di verifica di ogni fase sono in `docs/CHECKLIST.md`.
