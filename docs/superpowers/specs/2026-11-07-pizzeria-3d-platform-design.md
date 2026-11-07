# PIZZERIA 3D: design tecnico della piattaforma ordini, POS adapter e Print Bridge

Data: 2026-11-07
Stato: bozza per revisione (nessun codice scritto)

## 1. Obiettivo e ambito

PIZZERIA 3D è un livello che raccoglie ordini, li verifica lato backend, li consegna al POS esistente e fa stampare le comande in cucina in modo affidabile e verificabile.

**Il POS esistente resta il sistema di riferimento** per: listino e prezzi, numerazione ordini, pagamenti e chiusura cassa, stampa comande. PIZZERIA 3D non è fonte di verità per nessuna di queste funzioni: ne tiene copie versionate o riferimenti.

### Vincoli (da requisito)

| ID | Vincolo | Dove è garantito |
|----|---------|------------------|
| V1 | Il POS resta il riferimento per le funzioni che già gestisce | §4, §5 |
| V2 | Più produttori di stampanti | §6 |
| V3 | Il Print Bridge funziona anche dopo il riavvio del PC | §7.4, fase 5 |
| V4 | Le comande non si duplicano | §7.3, §8 |
| V5 | Le stampe sono verificabili | §6.3 |
| V6 | Nessun ordine perso in caso di disconnessione temporanea | §3.2, §7.2, §8 |
| V7 | Tutti i prezzi verificati lato backend | §4.3 |
| V8 | Nessuna simulazione presentata come hardware o POS reale | §9 |

### Fuori ambito (dichiarato)

- Adattatore del POS reale: dipende da prodotto e API del POS, non ancora noti.
- Driver di una stampante reale e scelta del modello.
- Interfaccia cliente e 3D.
- Sconti, coupon, promozioni calcolate dal backend: se esistono, sono definiti dal POS e arrivano nel listino come articoli con prezzo.

### Assunzioni da validare con il POS reale

- A1: i prezzi del listino POS sono già comprensivi di IVA; il backend non calcola valori fiscali.
- A2: il POS espone un modo per leggere il listino e per inserire un ordine con una chiave di idempotenza, oppure permette di cercare un ordine inserito in precedenza tramite un tag del chiamante (necessario per riconciliare un timeout, §5.2).
- A3: il PC della pizzeria è Windows e dispone di un'uscita HTTPS verso il backend.

## 2. Architettura

```
Cliente --HTTPS--> [ Backend ] <--HTTPS (il bridge si collega)-- [ Print Bridge ] --> Stampanti
                       |                                              (servizio Windows,
                       | PosAdapter (interfaccia)                      coda su disco)
                       v
                  [ POS esistente ]
```

Monorepo TypeScript (Node 22, Postgres 16, SQLite per il bridge, vitest, zod):

| Pacchetto | Responsabilità | Dipende da |
|-----------|----------------|------------|
| `packages/domain` | Tipi, denaro in centesimi interi, macchine a stati. Nessuna I/O. | nulla |
| `packages/pos-contract` | Interfaccia `PosAdapter`, suite di contract test, `SimulatedPos` | domain |
| `packages/print-contract` | `PrinterDriver`, `TicketDocument`, livelli di prova, `SimulatedPrinter` | domain |
| `packages/protocol` | Schemi dei messaggi backend↔bridge, versione, firma | domain |
| `apps/backend` | API ordini, validazione prezzi, outbox, registro bridge | tutti i pacchetti |
| `apps/print-bridge` | Servizio locale, giornale su disco, driver | print-contract, protocol |

## 3. Principi trasversali

### 3.1 Regole

1. **Persistere prima di rispondere.** Un ordine è "accettato" solo quando è in Postgres insieme alla sua riga di outbox, nella stessa transazione.
2. **Nessuna consegna esterna dentro la transazione dell'ordine.** POS e stampa sono effetti dell'outbox, con retry.
3. **Idempotenza ovunque.** Ogni effetto esterno ha una chiave deterministica; ripeterlo non lo duplica.
4. **At-least-once più consumatore idempotente.** La consegna può ripetersi; l'effetto sulla carta no (§7.3).
5. **Un solo "stampatore di riferimento" per ordine** (§3.3).
6. **Denaro in centesimi interi.** Mai numeri in virgola mobile.

### 3.2 Perdita di connettività

- Cliente→backend offline: fuori dal controllo del backend; il client riprova con lo stesso `client_order_id`.
- Backend→POS offline: l'ordine resta `ACCEPTED` in outbox, retry con backoff esponenziale con jitter (2 s fino a 5 min). Dopo `pos_unreachable_alert` (default 10 min) lo stato diventa `NEEDS_ATTENTION` per segnalarlo; i retry continuano.
- Backend↔bridge offline: i lavori restano `QUEUED`; alla riconnessione il bridge riprende dal cursore (§7.2).

### 3.3 Chi stampa la comanda

Il POS stampa già le comande. Per evitare un doppio ticket in cucina, per ogni ordine esiste un solo stampatore di riferimento, scelto dalla configurazione `kitchen_print_owner`:

- `bridge` (default): `submitOrder` chiede al POS di **non** stampare; stampa il Print Bridge.
- `pos`: il Print Bridge non genera lavori di stampa per quell'ordine; il POS stampa.

L'adattatore deve dichiarare se sa sopprimere la stampa del POS (`capabilities.canSuppressKitchenPrint`). Se `kitchen_print_owner=bridge` e l'adattatore non lo sa fare, l'avvio del backend fallisce con errore di configurazione. Non si stampa mai due volte per scelta implicita.

Trigger di creazione del lavoro di stampa, `print_trigger`:
- `on_pos_confirmed` (default): il lavoro nasce dopo `SENT_TO_POS`, così il biglietto riporta il numero ufficiale del POS.
- `on_accepted`: nasce subito; il biglietto riporta il numero interno e la dicitura "N. POS non ancora assegnato".

## 4. Database del backend (Postgres)

### 4.1 Tabelle

| Tabella | Contenuto essenziale |
|---------|----------------------|
| `catalog_snapshots` | `id`, `pos_version`, `content_hash`, `fetched_at` |
| `catalog_items` | `snapshot_id`, `pos_item_id`, `name`, `price_cents`, `available`, `option_groups` (jsonb con id e prezzi delle opzioni) |
| `orders` | `id` (uuid), `client_order_id` (unique), `status`, `snapshot_id`, `total_cents`, `pos_ref`, `pos_number`, `pos_payment_status`, `created_at`, `updated_at` |
| `order_lines` | `order_id`, `pos_item_id`, `quantity`, `unit_price_cents` (congelato), `note` |
| `order_line_options` | `order_line_id`, `option_id`, `price_cents` (congelato) |
| `order_events` | append-only: `order_id`, `from_status`, `to_status`, `reason`, `actor`, `at` |
| `outbox` | `id`, `kind` (`POS_SUBMIT`, `PRINT_CREATE`), `order_id`, `idempotency_key` (unique), `attempts`, `next_attempt_at`, `done_at`, `last_error` |
| `pos_deliveries` | `order_id`, `attempt`, `outcome`, `pos_ref`, `error_class`, `at` |
| `print_jobs` | `id`, `order_id`, `kind`, `revision`, `dedupe_key`, `state`, `content_hash`, `ticket` (jsonb), `bridge_id`, `lease_until`, `seq` (bigserial, cursore) |
| `print_receipts` | `job_id`, `bridge_id`, `printer_id`, `outcome`, `evidence_level`, `content_hash`, `printed_at`, `detail` |
| `bridges` | `id`, `public_key`, `revoked_at`, `last_seen_at`, `protocol_version` |
| `printers` | `id` (logico), `bridge_id`, `role` (es. `kitchen`), `profile` (nome del profilo di configurazione), `capabilities` (jsonb) |

Vincoli di integrità:
- `orders.client_order_id` unique: secondo invio dello stesso ordine restituisce il primo.
- `outbox.idempotency_key` unique.
- `print_jobs`: unique (`order_id`, `kind`, `revision`) e unique `dedupe_key`.
- `order_events` e `print_receipts` non ammettono UPDATE né DELETE (revoca privilegi applicativi).

### 4.2 Database locale del bridge (SQLite, WAL)

`journal(job_id pk, dedupe_key unique, seq, content_hash, ticket, printer_id, state, evidence_level, updated_at)` e `cursor(last_seq)`. Gli stati sono in §7.3.

### 4.3 Verifica dei prezzi

1. Il client invia solo `pos_item_id`, opzioni, quantità, note. I prezzi inviati dal client sono ignorati.
2. Il backend risolve ogni articolo e opzione nello snapshot corrente, verifica `available`, calcola `unit_price_cents` e il totale: `Σ (base + Σ opzioni) × quantità`.
3. Se il client invia un totale atteso e non coincide con quello calcolato, l'ordine è rifiutato con `PRICE_MISMATCH` (nessuna riga scritta).
4. Se lo snapshot è più vecchio di `catalog_ttl` (default 15 min), il backend lo rilegge dal POS prima di validare. Se il POS non risponde, l'ordine è rifiutato con `CATALOG_STALE`; non si accettano ordini su prezzi non verificabili.
5. Alla consegna, il totale autorevole restituito dal POS deve coincidere con `total_cents`; in caso contrario l'ordine va in `NEEDS_ATTENTION` e non viene modificato automaticamente.

## 5. POS adapter

### 5.1 Interfaccia (in `pos-contract`)

```ts
interface PosAdapter {
  capabilities(): { canSuppressKitchenPrint: boolean; supportsIdempotencyKey: boolean; supportsLookupByTag: boolean };
  health(): Promise<{ reachable: boolean; detail?: string }>;
  getCatalog(): Promise<CatalogSnapshotInput>;
  submitOrder(order: PosOrderInput, idempotencyKey: string, opts: { suppressKitchenPrint: boolean }): Promise<PosOrderAck>;
  findOrderByTag(tag: string): Promise<PosOrderAck | null>;
  getOrderStatus(posRef: string): Promise<PosOrderStatus>; // include stato pagamento
  cancelOrder(posRef: string): Promise<void>;
}
// PosOrderAck = { posRef, posNumber, authoritativeTotalCents }
```

Errori tipizzati: `PosTransientError` (si ritenta), `PosPermanentError` (si ferma, `NEEDS_ATTENTION`), `PosDuplicateError` (porta con sé l'`PosOrderAck` esistente, trattato come successo).

### 5.2 Timeout con esito sconosciuto

Se `submitOrder` va in timeout, l'esito è sconosciuto. Prima di ritentare, il servizio chiama `findOrderByTag(order.id)`. Se l'ordine esiste, lo usa; altrimenti ritenta. Un adattatore senza `supportsIdempotencyKey` né `supportsLookupByTag` non è ammesso per uso reale: il contract test lo rifiuta.

### 5.3 Contract test

Suite eseguibile contro qualsiasi `PosAdapter`: idempotenza (stessa chiave, un solo ordine), timeout ambiguo riconciliato, errore transitorio ritentato, totale autorevole discordante segnalato, stato pagamento letto. Ogni futuro adattatore deve superarla prima di essere abilitato.

### 5.4 `SimulatedPos`

Solo per test. Il nome della classe, il prefisso dei suoi `posRef` (`SIM-`) e ogni log riportano che è simulato. Nessun codice di produzione lo istanzia: la configurazione di produzione rifiuta un adattatore marcato `simulated`.

## 6. Stampanti e produttori

### 6.1 `TicketDocument`

Struttura neutra: intestazione (numero ordine, orario, tipo), righe (quantità, nome, opzioni, note), piè di pagina, marcatura `COPIA` per le ristampe. Contiene `content_hash` calcolato sulla forma canonica.

### 6.2 `PrinterDriver`

```ts
interface PrinterDriver {
  capabilities(): { widthChars: number; codepages: string[]; cutter: boolean; status: 'none'|'basic'|'bidirectional' };
  print(doc: TicketDocument, ctx: { jobId: string }): Promise<PrintOutcome>;
  queryStatus(): Promise<DeviceStatus | null>; // null se non supportato
}
```

Le differenze tra modelli e produttori stanno in profili di configurazione (larghezza, codepage, comandi opzionali), non in condizioni nel codice del bridge. Aggiungere un produttore significa aggiungere un driver che supera il contract test dei driver.

### 6.3 Verificabilità

Ogni stampa produce una ricevuta con un livello di prova esplicito:

| Livello | Significato |
|---------|-------------|
| `DEVICE_ACKED` | la stampante ha confermato (stato bidirezionale) |
| `TRANSPORT_ACCEPTED` | socket/spooler ha accettato tutti i byte; la carta non è garantita |
| `UNCONFIRMED` | nessuna conferma disponibile |
| `OPERATOR_CONFIRMED` | la cucina ha confermato a mano; registrato chi e quando |

Molte stampanti termiche non possono confermare la carta uscita. Il sistema non finge il contrario: registra il livello reale, e per le stampanti `none`/`basic` rende disponibile la conferma dell'operatore. Catena di audit: `order_events` → `print_jobs` → `print_receipts`, tutte collegate da `content_hash`.

## 7. Print Bridge

### 7.1 Ruolo

Servizio locale che riceve lavori dal backend, li stampa tramite i driver e riporta le ricevute. Non prende decisioni sull'ordine.

### 7.2 Protocollo bridge ↔ backend (`packages/protocol`, versione 1)

Trasporto: HTTPS, il bridge è sempre il chiamante. Long-poll.

| Messaggio | Direzione | Contenuto |
|-----------|-----------|-----------|
| `POST /bridge/v1/hello` | bridge→backend | `bridge_id`, `protocol_version`, stampanti e capacità, `last_seq` |
| `GET /bridge/v1/jobs?cursor=<seq>&wait=25` | bridge→backend | restituisce lavori con `seq > cursor`, ciascuno con lease di 60 s: `job_id`, `seq`, `dedupe_key`, `content_hash`, `ticket`, `printer_role`, `lease_until` |
| `POST /bridge/v1/jobs/{id}/receipt` | bridge→backend | `outcome` (`PRINTED`/`FAILED`/`UNCERTAIN`), `evidence_level`, `printed_at`, `content_hash` |
| `POST /bridge/v1/heartbeat` | bridge→backend | stato stampanti (carta, offline), coda locale |

Regole:
- Ogni richiesta è firmata con la chiave del bridge (Ed25519, chiave pubblica registrata in `bridges`); le chiavi si revocano con `revoked_at`.
- `receipt` è idempotente: la stessa ricevuta ripetuta non cambia nulla; una ricevuta con `content_hash` diverso è rifiutata e segnalata.
- Un lavoro è legato a un solo bridge (`bridge_id`) per ruolo di stampante: non esistono due bridge che servono lo stesso ruolo.
- `hello` include `in_flight`: l'elenco dei lavori presenti nel giornale locale non conclusi, con il loro stato locale. Alla riconnessione il backend li riconcilia: `PRINTING` locale → `UNCERTAIN`; `RECEIVED` locale → resta in carico al bridge; assente dal giornale → può tornare `QUEUED`.
- Lease scaduto senza ricevuta e bridge non ancora riconnesso: il lavoro resta `LEASED` (non torna `QUEUED`), perché il backend non può sapere se la stampa è iniziata. Si risolve solo con il `hello` successivo o con l'intervento dell'operatore. Se il bridge ha perso il giornale (disco sostituito), l'operatore lo dichiara e il lavoro diventa `UNCERTAIN`.
- Il bridge incompatibile con `protocol_version` riceve `426` e non stampa.

### 7.3 Stati e regola anti-duplicato

Stati di `print_jobs` (backend): `QUEUED → LEASED → PRINTED | FAILED | UNCERTAIN`, più `CANCELLED`.

Stati del giornale locale: `RECEIVED → PRINTING → PRINTED | FAILED | UNCERTAIN`.

Regola chiave: **`PRINTING` è scritto su disco (fsync) prima di inviare i byte alla stampante.** Se il processo muore dopo e prima di registrare l'esito, al riavvio il lavoro è `UNCERTAIN` e **non viene ristampato automaticamente**. Il backend porta l'ordine in `NEEDS_ATTENTION`; l'operatore sceglie. Una ristampa crea una nuova `revision` con la dicitura `COPIA`, mai la stessa revisione.

Un lavoro già presente nel giornale (stesso `job_id` o `dedupe_key`) non viene stampato di nuovo, anche se il backend lo riconsegna.

Compromesso accettato, esplicito: tra "rischio di non stampare" e "rischio di stampare due volte", in caso di stato incerto si sceglie di non stampare in automatico e di avvisare l'operatore, perché una comanda mancante è visibile e correggibile in pochi secondi, mentre un doppio ticket genera doppia produzione.

### 7.4 Riavvio del computer

Il bridge è un servizio Windows con avvio automatico e azioni di ripristino in caso di errore (riavvio dopo 5 s). La sua coda e il suo cursore stanno su disco. Strumento di servizio: WinSW. La scelta si conferma o si cambia solo nella fase 5, in base al risultato del test di riavvio reale.

## 8. Gestione degli ordini

### 8.1 Stati e transizioni consentite

| Da | A | Condizione |
|----|---|------------|
| `RECEIVED` | `VALIDATED` | prezzi e disponibilità verificati (§4.3) |
| `RECEIVED` | `REJECTED` | validazione fallita (`PRICE_MISMATCH`, `CATALOG_STALE`, articolo non disponibile) |
| `VALIDATED` | `ACCEPTED` | ordine e outbox persistiti |
| `ACCEPTED` | `SENT_TO_POS` | POS conferma con `posRef` e totale coincidente |
| `SENT_TO_POS` | `PRINT_CONFIRMED` | ricevuta con esito `PRINTED` |
| `PRINT_CONFIRMED` | `READY` → `COMPLETED` | azioni operatore / stato POS |
| qualsiasi non finale | `NEEDS_ATTENTION` | POS irraggiungibile oltre soglia, totale discordante, stampa `UNCERTAIN` o `FAILED` oltre i retry |
| `NEEDS_ATTENTION` | stato precedente | risoluzione manuale registrata in `order_events` |
| qualsiasi non finale | `CANCELLED` | annullamento (propagato al POS) |

Transizioni non in tabella sono impossibili: la macchina a stati in `domain` le rifiuta.

`SENT_TO_POS` e `PRINT_CONFIRMED` sono due tracce indipendenti, registrate come due marcatori sull'ordine (`pos_confirmed_at`, `print_confirmed_at`). `orders.status` è l'aggregato: con `print_trigger=on_pos_confirmed` la stampa segue sempre il POS; con `on_accepted` la stampa può essere confermata prima del POS. In entrambi i casi `READY` richiede **entrambi** i marcatori valorizzati, e la macchina a stati rifiuta `READY` se ne manca uno.

### 8.2 Idempotenza

- Creazione ordine: `client_order_id`.
- Consegna al POS: `idempotency_key = order.id`, tag POS = `order.id`.
- Lavoro di stampa: `dedupe_key = <order_id>:<kind>:<revision>`.
- Ricevuta: `job_id` + `content_hash`.

### 8.3 Stato pagamento

Letto dal POS (`getOrderStatus`) e copiato in `pos_payment_status` solo per visualizzazione. Il backend non scrive mai pagamenti.

## 9. Strategia di test e onestà sulle simulazioni

- Unit test sul dominio (macchine a stati, calcolo prezzi, denaro).
- Contract test per `PosAdapter` e `PrinterDriver`, eseguibili su qualunque implementazione.
- `SimulatedPos` e `SimulatedPrinter` per test e sviluppo. Sono classi marcate come simulate, con iniezione di guasti (timeout, risposta persa dopo la scrittura, byte parziali, rifiuto). Non verificano nulla sull'hardware o sul POS reali, e la documentazione lo ripete in ogni punto in cui compaiono.
- Test di caos sul bridge: kill del processo in ogni punto del ciclo, disconnessione di rete, consegna duplicata, riavvio.
- Fase 5: il riavvio del PC si verifica su un vero riavvio di Windows; finché non è fatto, V3 non è dichiarato soddisfatto.
- Le uniche prove di compatibilità reali con un POS o una stampante sono i contract test eseguiti contro l'adattatore o il driver reale, quando esisteranno.

## 10. Fasi e cancelli di verifica

Ogni fase è indipendente e ha un cancello: la successiva non inizia finché tutti i punti della checklist della precedente non sono dimostrati da un test o da una verifica registrata.

### Fase 0: fondamenta
- [ ] Monorepo, tooling e CI locale configurati; `npm test` funziona a vuoto.
- [ ] `domain`: tipo `Money` in centesimi, nessun `number` frazionario in API pubbliche.
- [ ] Macchina a stati ordine: test su ogni transizione ammessa e su un campione di vietate.
- [ ] Documentazione di architettura e glossario presenti in `docs/`.

### Fase 1: ordini e verifica prezzi
- [ ] Migrazioni Postgres per le tabelle di §4.1, con i vincoli unique e il blocco UPDATE/DELETE.
- [ ] Prezzo manomesso dal client → `PRICE_MISMATCH`, nessuna riga scritta (test).
- [ ] Stesso `client_order_id` inviato due volte → un solo ordine (test).
- [ ] Snapshot oltre TTL con POS non raggiungibile → `CATALOG_STALE` (test).
- [ ] Crash dopo la transazione, prima della risposta → l'ordine esiste e l'outbox è presente (test).

### Fase 2: POS contract e consegna
- [ ] `PosAdapter` e contract test completi.
- [ ] `SimulatedPos` supera il contract test; la configurazione di produzione lo rifiuta (test).
- [ ] POS offline per N minuti → nessun ordine perso, tutti consegnati al ritorno, nessun duplicato (test).
- [ ] Timeout ambiguo → riconciliazione con `findOrderByTag`, un solo ordine nel POS (test).
- [ ] Totale autorevole discordante → `NEEDS_ATTENTION` (test).
- [ ] `kitchen_print_owner` impossibile da soddisfare → avvio fallito (test).

### Fase 3: contratto di stampa
- [ ] `TicketDocument` con `content_hash` canonico (stesso contenuto, stesso hash).
- [ ] `PrinterDriver` e contract test; due `SimulatedPrinter` con capacità diverse lo superano.
- [ ] Livelli di prova prodotti correttamente per ciascuna capacità di stato (test).
- [ ] Ristampa produce nuova revisione con `COPIA` (test).

### Fase 4: protocollo e core del bridge
- [ ] Schemi del protocollo con test di compatibilità di versione.
- [ ] Giornale SQLite con `PRINTING` scritto prima dei byte (test sull'ordine delle scritture).
- [ ] Kill del processo durante la stampa → al riavvio `UNCERTAIN`, nessuna ristampa automatica (test di caos).
- [ ] Disconnessione e ripresa dal cursore → nessun lavoro perso, nessun duplicato (test di caos).
- [ ] Lavoro riconsegnato → ignorato dal giornale (test).
- [ ] Richiesta con firma errata o chiave revocata → rifiutata (test).

### Fase 5: servizio Windows
- [ ] Pacchetto di installazione e disinstallazione del servizio.
- [ ] Avvio automatico e ripristino dopo crash, verificati.
- [ ] **Riavvio reale di Windows**: il servizio riparte, la coda è intatta, nessun duplicato. Registrare data, macchina, esito.

### Fase 6: prova end-to-end e consegna
- [ ] Scenario completo con simulatori: ordine → POS → stampa → ricevuta → `READY`.
- [ ] Scenario di caos combinato (POS offline + rete caduta + bridge killato).
- [ ] Runbook operatore: `NEEDS_ATTENTION`, ristampa `COPIA`, conferma manuale, revoca chiave bridge.
- [ ] Tabella di tracciabilità V1–V8 → test che li dimostrano, tutti verdi.

### Lavoro successivo (non in questo ciclo)
- Adattatore del POS reale: servono prodotto e versione, documentazione API, ambiente di prova, esito dei contract test.
- Driver di stampante reale: servono modello, interfaccia (rete/USB/seriale), linguaggio di comando, esito del contract test dei driver.

## 11. Decisioni aperte, con default scelto

| Decisione | Default | Quando confermarla |
|-----------|---------|--------------------|
| `kitchen_print_owner` | `bridge` | prima della fase 2 |
| `print_trigger` | `on_pos_confirmed` | prima della fase 2 |
| `catalog_ttl` | 15 min | fase 1 |
| `pos_unreachable_alert` | 10 min | fase 2 |
| Durata lease | 60 s | fase 4 |
| WinSW come gestore del servizio | sì | fase 5 |
