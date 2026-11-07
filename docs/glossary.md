# Glossario

Termini usati nella specifica (`docs/superpowers/specs/2026-11-07-pizzeria-3d-platform-design.md`).

**Outbox**: tabella `outbox` scritta nella stessa transazione dell'ordine. Contiene gli effetti esterni da compiere (`POS_SUBMIT`, `PRINT_CREATE`), ciascuno con `idempotency_key` unica e retry con backoff. Garantisce che un ordine accettato non si perda.

**Lease**: concessione temporanea (60 s) di un lavoro di stampa a un bridge. Se scade senza ricevuta, il lavoro resta `LEASED` e non torna `QUEUED`: il backend non sa se la stampa è iniziata. Si risolve con il `hello` successivo o con l'operatore.

**Snapshot (catalogo)**: copia versionata del listino del POS (`catalog_snapshots`, `catalog_items`) con `pos_version` e `content_hash`. I prezzi si verificano contro lo snapshot; se è più vecchio di `catalog_ttl` (15 min) viene riletto, altrimenti l'ordine è rifiutato con `CATALOG_STALE`.

**Livello di prova (evidence level)**: quanto è forte la prova che la comanda sia stata stampata: `DEVICE_ACKED`, `TRANSPORT_ACCEPTED`, `UNCONFIRMED`, `OPERATOR_CONFIRMED`. Si registra il livello reale, senza fingere conferme che la stampante non può dare.

**Revision**: numero di versione di un lavoro di stampa per ordine e tipo. Una ristampa crea sempre una nuova revisione con la dicitura `COPIA`, mai la stessa revisione.

**UNCERTAIN**: esito di un lavoro quando `PRINTING` era stato scritto ma l'esito no (per esempio crash del bridge). Non si ristampa in automatico; l'ordine va in `NEEDS_ATTENTION` e decide l'operatore.

**NEEDS_ATTENTION**: stato dell'ordine che richiede l'intervento umano: POS irraggiungibile oltre soglia, totale autorevole discordante, stampa `UNCERTAIN` o `FAILED` oltre i retry. La risoluzione manuale torna allo stato precedente ed è registrata in `order_events`.

**dedupe_key**: chiave unica di un lavoro di stampa, `<order_id>:<kind>:<revision>`. Il giornale del bridge non stampa due volte lo stesso `job_id` o `dedupe_key`, anche se il backend lo riconsegna.

**Idempotency key**: chiave deterministica che rende ripetibile un effetto esterno senza duplicarlo. Per la consegna al POS è `order.id` (che è anche il tag per `findOrderByTag`); per la creazione dell'ordine il corrispondente è `client_order_id`.

**Print owner**: lo "stampatore di riferimento" della comanda, scelto da `kitchen_print_owner`: `bridge` (default, il POS è istruito a non stampare) oppure `pos` (il bridge non genera lavori). Ne esiste uno solo per ordine.

**Cursor (seq)**: `seq` è il numero progressivo (bigserial) dei lavori in `print_jobs`; il bridge conserva su disco `last_seq` e chiede i lavori con `seq > cursor`, così riprende senza perdite né duplicati dopo una disconnessione.

**Bridge**: il Print Bridge, servizio Windows locale che si collega al backend via HTTPS (sempre come chiamante), riceve i lavori, li stampa con i driver, tiene un giornale SQLite su disco e riporta le ricevute. Non decide nulla sull'ordine.

**posRef / posNumber**: `posRef` è il riferimento interno con cui il POS identifica l'ordine (con `SimulatedPos` ha prefisso `SIM-`); `posNumber` è il numero ufficiale dell'ordine assegnato dal POS e riportato sul biglietto. Entrambi arrivano in `PosOrderAck`.
