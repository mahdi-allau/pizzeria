# PIZZERIA 3D Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the order-validation backend, abstract POS adapter contract, printer driver contract and Windows Print Bridge of PIZZERIA 3D, with simulators and tests, without choosing a real POS or printer.

**Architecture:** TypeScript monorepo. The backend persists orders and an outbox in one Postgres transaction and delivers to the POS and print queue through retried, idempotent outbox work. A Windows-service Print Bridge connects outward over signed HTTPS long-poll, keeps a durable SQLite journal, and never auto-reprints a job whose outcome is uncertain.

**Tech Stack:** Node 22, TypeScript, npm workspaces, vitest, zod, fastify, `pg`, `embedded-postgres` (pinned to a 16.x release, test DB), `better-sqlite3`, Ed25519 via `node:crypto`, WinSW.

**Spec:** `docs/superpowers/specs/2026-11-07-pizzeria-3d-platform-design.md`

## Global Constraints

- Language and runtime: TypeScript on Node 22. Backend DB Postgres 16. Bridge DB SQLite in WAL mode with `synchronous=FULL`.
- Money is integer centesimi (`Cents`); no fractional numbers in any public API.
- Orders are validated only against the backend catalog snapshot; client-sent prices are ignored; `expectedTotalCents` mismatch → `PRICE_MISMATCH`.
- Defaults: `catalog_ttl` 15 min; `pos_unreachable_alert` 10 min; lease 60 s; long-poll `wait=25`; POS retry backoff 2 s up to 5 min with jitter; `kitchen_print_owner=bridge`; `print_trigger=on_pos_confirmed`; protocol version 1; bridge requests signed with Ed25519.
- Plan-level decisions the spec leaves open: max line quantity 50; print job auto-retry limit 3 (`print_max_attempts`); signed-request clock skew tolerance ±60 s; admin endpoints guarded by an `ADMIN_TOKEN` bearer env var (minimal, flagged for review); an in-test fake object implementing `CatalogSource` is allowed in Phase 1 because it is not a POS simulation.
- Simulators (`SimulatedPos`, `SimulatedPrinter`) are test-only, self-labelled, and rejected by production config. Nothing may claim to prove behaviour of a real POS or printer.
- A phase may not start until its predecessor's gate (last section of each phase) is completed and recorded in `docs/CHECKLIST.md`.
- The repository is initialised with `git init` in Task 1; every task ends with a commit.

## Review Focus

- Two simultaneous requests with the same `client_order_id` must yield one order (Task 6).
- Empty order, quantity ≤ 0, quantity > 50, unknown item or option must be rejected with a specific code and write nothing (Task 3).
- Italian accents and characters outside the printer codepage (e.g. `è`, `à`, emoji in a note) must print as a substitute, never crash or drop the line (Task 11).
- A bridge PC clock off by more than 60 s must get a clear `CLOCK_SKEW` error, not a generic auth failure (Task 14).
- A long note or item name must wrap to the printer width, never be truncated, and the content hash must stay stable (Task 10).

## File Structure

```
package.json, tsconfig.base.json, vitest.config.ts, docs/CHECKLIST.md
packages/domain/src/        money.ts order-state.ts print-state.ts pricing.ts index.ts
packages/pos-contract/src/  adapter.ts errors.ts simulated-pos.ts contract-suite.ts index.ts
packages/print-contract/src/ ticket.ts evidence.ts driver.ts simulated-printer.ts driver-contract-suite.ts index.ts
packages/protocol/src/      messages.ts signing.ts index.ts
apps/backend/src/           config.ts server.ts
  db/        migrate.ts migrations/001_init.sql test-db.ts
  orders/    catalog.ts service.ts routes.ts
  outbox/    backoff.ts pos-delivery-worker.ts print-create-worker.ts
  print/     job-service.ts admin-routes.ts
  bridge/    auth.ts routes.ts
apps/print-bridge/src/      journal.ts backend-client.ts runner.ts config.ts main.ts drivers/registry.ts
apps/print-bridge/service/  print-bridge.xml install-service.ps1 uninstall-service.ps1
tests/chaos/  bridge-harness.ts chaos.test.ts      tests/e2e/ e2e.test.ts
docs/  architecture.md glossary.md runbook.md traceability.md
```

Tests are colocated as `*.test.ts` next to sources unless listed above.

---

# Phase 0: Foundations

### Task 1: Monorepo, Money, checklist

**Files:** Create `package.json`, `tsconfig.base.json`, `vitest.config.ts`, `docs/CHECKLIST.md`, `packages/domain/package.json`, `packages/domain/src/money.ts`, `packages/domain/src/index.ts`, `packages/domain/src/money.test.ts`

**Interfaces:**
- Produces: `type Cents`; `cents(n: number): Cents`; `addCents(a: Cents, b: Cents): Cents`; `mulCents(a: Cents, qty: number): Cents`; `class MoneyError extends Error`

- [ ] **Step 1:** `git init`; create npm workspaces root (`packages/*`, `apps/*`), strict base tsconfig, vitest config including `**/*.test.ts`. Write `docs/CHECKLIST.md` as the spec §10 checklists verbatim, one section per phase.
- [ ] **Step 2: Write failing test** `money.test.ts`: `cents(1250)` returns 1250; `cents(1.5)` throws `MoneyError`; `cents(-1)` throws; `cents(Number.MAX_SAFE_INTEGER + 1)` throws; `addCents(cents(100), cents(250)) === 350`; `mulCents(cents(850), 3) === 2550`; `mulCents(cents(850), 0.5)` throws.
- [ ] **Step 3:** Run `npx vitest run packages/domain/src/money.test.ts` → FAIL (module missing).
- [ ] **Step 4:** Implement the interfaces above in `money.ts` (integer + safe-integer + non-negative guards), re-export from `index.ts`.
- [ ] **Step 5:** Run the same command → PASS.
- [ ] **Step 6:** Commit `chore: monorepo scaffold and Money type`.

### Task 2: Order state machine

**Files:** Create `packages/domain/src/order-state.ts`, `order-state.test.ts`; Modify `index.ts`

**Interfaces:**
- Produces: `type OrderStatus = 'RECEIVED'|'VALIDATED'|'REJECTED'|'ACCEPTED'|'SENT_TO_POS'|'PRINT_CONFIRMED'|'READY'|'COMPLETED'|'CANCELLED'|'NEEDS_ATTENTION'`; `interface OrderState { status: OrderStatus; posConfirmedAt?: Date; printConfirmedAt?: Date; previousStatus?: OrderStatus }`; `transition(state: OrderState, to: OrderStatus, at: Date): OrderState`; `class InvalidTransitionError extends Error`

- [ ] **Step 1: Write failing tests** covering spec §8.1: every allowed row succeeds (`RECEIVED→VALIDATED`, `RECEIVED→REJECTED`, `VALIDATED→ACCEPTED`, `ACCEPTED→SENT_TO_POS`, `SENT_TO_POS→PRINT_CONFIRMED`, `READY→COMPLETED`); `ACCEPTED→PRINT_CONFIRMED→SENT_TO_POS→READY` succeeds (print before POS); `ACCEPTED→SENT_TO_POS→READY` throws (print marker missing); entering `SENT_TO_POS` sets `posConfirmedAt`, entering `PRINT_CONFIRMED` sets `printConfirmedAt`; any non-final → `NEEDS_ATTENTION` stores `previousStatus`, and `transition(state,'<previousStatus>')` resolves it; any non-final → `CANCELLED`; from `COMPLETED`, `REJECTED`, `CANCELLED` every target throws; `RECEIVED→READY` and `VALIDATED→SENT_TO_POS` throw.
- [ ] **Step 2:** Run `npx vitest run packages/domain/src/order-state.test.ts` → FAIL.
- [ ] **Step 3:** Implement with an explicit allowed-transitions map plus the READY guard (both markers).
- [ ] **Step 4:** Run → PASS. **Step 5:** Commit `feat(domain): order state machine`.

### Phase 0 gate
- [ ] Run `npm test`; all green. Write `docs/architecture.md` (component diagram from spec §2, dependency rules) and `docs/glossary.md` (outbox, lease, snapshot, evidence level, revision, `UNCERTAIN`). Tick Phase 0 boxes in `docs/CHECKLIST.md` with date and test output summary. Commit `docs: phase 0 gate`.

---

# Phase 1: Orders and price verification

### Task 3: Pricing

**Files:** Create `packages/domain/src/pricing.ts`, `pricing.test.ts`; Modify `index.ts`

**Interfaces:**
- Produces: `interface CatalogItem { posItemId: string; name: string; priceCents: Cents; available: boolean; options: { optionId: string; name: string; priceCents: Cents; available: boolean }[] }`; `interface CatalogSnapshot { id: string; fetchedAt: Date; items: CatalogItem[] }`; `interface OrderInput { clientOrderId: string; lines: { posItemId: string; quantity: number; optionIds: string[]; note?: string }[]; expectedTotalCents?: number }`; `interface PricedLine { posItemId: string; quantity: number; unitPriceCents: Cents; options: { optionId: string; priceCents: Cents }[]; note?: string }`; `priceOrder(input: OrderInput, snapshot: CatalogSnapshot): { lines: PricedLine[]; totalCents: Cents }`; `const MAX_LINE_QUANTITY = 50`; errors `PriceMismatchError`, `ItemUnavailableError`, `InvalidOrderError` each with `code: 'PRICE_MISMATCH'|'ITEM_UNAVAILABLE'|'EMPTY_ORDER'|'INVALID_QUANTITY'|'UNKNOWN_ITEM'|'UNKNOWN_OPTION'`

- [ ] **Step 1: Write failing tests:** Margherita 700 + option "extra mozzarella" 150, quantity 2 → `unitPriceCents` 850, `totalCents` 1700; sum of two lines; `expectedTotalCents` 1600 → throws code `PRICE_MISMATCH`; matching expected total passes; unavailable item or option → `ITEM_UNAVAILABLE`; unknown item/option ids → `UNKNOWN_ITEM`/`UNKNOWN_OPTION`; **Review Focus:** `lines: []` → `EMPTY_ORDER`; quantity 0, -1, 1.5, 51 → `INVALID_QUANTITY`.
- [ ] **Step 2:** Run `npx vitest run packages/domain/src/pricing.test.ts` → FAIL. **Step 3:** Implement; the unit price is base plus options, using only snapshot prices. **Step 4:** Run → PASS. **Step 5:** Commit `feat(domain): backend price verification`.

### Task 4: Schema, migrations, test database

**Files:** Create `apps/backend/package.json`, `src/db/migrations/001_init.sql`, `src/db/migrate.ts`, `src/db/test-db.ts`, `src/db/schema.test.ts`

**Interfaces:**
- Produces: `migrate(pool: Pool): Promise<void>` (applies `*.sql` in filename order, tracked in `schema_migrations`); `startTestDb(): Promise<{ pool: Pool; stop(): Promise<void> }>` (embedded Postgres 16, fresh DB, migrations applied)

- [ ] **Step 1: Write failing tests** `schema.test.ts` using `startTestDb`: two `orders` with same `client_order_id` → unique violation; two `outbox` rows with same `idempotency_key` → violation; two `print_jobs` with same (`order_id`,`kind`,`revision`) → violation; same `dedupe_key` → violation; `UPDATE order_events` and `DELETE order_events` raise; `UPDATE`/`DELETE print_receipts` raise.
- [ ] **Step 2:** Run `npx vitest run apps/backend/src/db/schema.test.ts` → FAIL. If `embedded-postgres` cannot start on this machine, stop and report; do not substitute an in-memory fake.
- [ ] **Step 3:** Write `001_init.sql` for every table in spec §4.1 with the listed constraints; immutability via `BEFORE UPDATE OR DELETE` triggers raising an exception on `order_events` and `print_receipts`. Implement `migrate.ts` and `test-db.ts`.
- [ ] **Step 4:** Run → PASS. **Step 5:** Commit `feat(backend): postgres schema and migrations`.

### Task 5: Catalog snapshots

**Files:** Create `apps/backend/src/orders/catalog.ts`, `catalog.test.ts`

**Interfaces:**
- Consumes: `CatalogSnapshot` (Task 3), `startTestDb` (Task 4)
- Produces: `interface CatalogSource { getCatalog(): Promise<{ posVersion: string; items: CatalogItem[] }> }`; `class CatalogService { constructor(pool: Pool, source: CatalogSource, ttlMs: number, now: () => Date) ; current(): Promise<CatalogSnapshot> }`; `class CatalogStaleError extends Error { code: 'CATALOG_STALE' }`

- [ ] **Step 1: Write failing tests:** fresh snapshot within TTL is returned without calling the source; older than TTL triggers refresh and stores a new `catalog_snapshots` row with `content_hash`; identical content reuses the hash; source rejecting while snapshot is stale → throws `CATALOG_STALE`; source rejecting while snapshot is fresh → returns the fresh one. The source is an inline test object implementing `CatalogSource`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS. **Step 5:** Commit `feat(backend): catalog snapshots with TTL`.

### Task 6: Order creation (transactional, idempotent)

**Files:** Create `apps/backend/src/orders/service.ts`, `routes.ts`, `service.test.ts`, `routes.test.ts`

**Interfaces:**
- Consumes: `priceOrder`, `transition` (domain), `CatalogService` (Task 5)
- Produces: `class OrderService { constructor(pool: Pool, catalog: CatalogService, cfg: Pick<PlatformConfig,'printTrigger'|'kitchenPrintOwner'>, hooks?: { afterCommit?: () => void }); createOrder(input: OrderInput): Promise<{ orderId: string; status: 'ACCEPTED'; totalCents: number; replayed: boolean }> }`; `POST /v1/orders` (fastify plugin `registerOrderRoutes(app, service)`) returning 201/200 on replay, 422 `{ code }` for validation errors, 503 `CATALOG_STALE`

- [ ] **Step 1: Write failing tests:** valid order creates `orders` (status `ACCEPTED`, frozen `unit_price_cents`), `order_lines`, `order_events` (`RECEIVED→VALIDATED→ACCEPTED`) and one `outbox` row `kind=POS_SUBMIT`, `idempotency_key='pos:<orderId>'`, all in one transaction; tampered `expectedTotalCents` → 422 `PRICE_MISMATCH` and zero rows in every table; same `clientOrderId` twice → second returns same `orderId` with `replayed=true`, one order row; **Review Focus:** `Promise.all` of 10 identical `createOrder` calls → exactly one `orders` row and all return the same `orderId`; `hooks.afterCommit` throwing → order and outbox rows exist and a retry returns `replayed=true`; with `printTrigger='on_accepted'` and owner `bridge` an extra `PRINT_CREATE` outbox row (`idempotency_key='print:<orderId>:KITCHEN:1'`) is inserted in the same transaction.
- [ ] **Step 2:** Run `npx vitest run apps/backend/src/orders` → FAIL. **Step 3:** Implement with `INSERT ... ON CONFLICT (client_order_id) DO NOTHING`, then select the existing row when no row was inserted; run pricing before the transaction. **Step 4:** Run → PASS. **Step 5:** Commit `feat(backend): idempotent order creation`.

### Phase 1 gate
- [ ] `npm test` green. Confirm each Phase 1 box in `docs/CHECKLIST.md` maps to a named passing test (price tampering → Task 6; duplicate → Task 6; stale catalog → Task 5; crash after commit → Task 6; migrations/immutability → Task 4). Record in the checklist with date. Commit `docs: phase 1 gate`.

---

# Phase 2: POS contract and delivery

### Task 7: POS contract, simulator, contract suite

**Files:** Create `packages/pos-contract/src/{adapter.ts,errors.ts,simulated-pos.ts,contract-suite.ts,index.ts}`, `simulated-pos.test.ts`

**Interfaces:**
- Produces: `interface PosAdapter { readonly kind: 'real'|'simulated'; capabilities(): { canSuppressKitchenPrint: boolean; supportsIdempotencyKey: boolean; supportsLookupByTag: boolean }; health(): Promise<{ reachable: boolean; detail?: string }>; getCatalog(): Promise<{ posVersion: string; items: CatalogItem[] }>; submitOrder(order: PosOrderInput, idempotencyKey: string, opts: { suppressKitchenPrint: boolean }): Promise<PosOrderAck>; findOrderByTag(tag: string): Promise<PosOrderAck | null>; getOrderStatus(posRef: string): Promise<{ status: string; paymentStatus: 'UNPAID'|'PAID'|'UNKNOWN' }>; cancelOrder(posRef: string): Promise<void> }`; `PosOrderInput = { orderId: string; tag: string; lines: PricedLine[]; totalCents: Cents }`; `PosOrderAck = { posRef: string; posNumber: string; authoritativeTotalCents: Cents }`; errors `PosTransientError`, `PosPermanentError`, `PosDuplicateError` (carries `ack`); `class SimulatedPos implements PosAdapter` with `kind='simulated'`, refs prefixed `SIM-`, fault injection `failNext(kind: 'transient'|'permanent')`, `loseResponseNext()` (order stored, then transient error thrown), `setTotalOverride(cents)`, `setOffline(boolean)`, `submitCount`; `runPosAdapterContract(name: string, factory: () => PosAdapter & ContractFaults)` registering vitest tests

- [ ] **Step 1: Write failing test:** `simulated-pos.test.ts` calls `runPosAdapterContract('SimulatedPos', () => new SimulatedPos())`. The suite asserts: same idempotency key twice → one stored order, same `posRef`; `loseResponseNext` then `findOrderByTag(tag)` returns the stored ack; transient error is a `PosTransientError`; `getOrderStatus` returns a payment status; adapter lacking both idempotency and lookup-by-tag fails the suite's capability check.
- [ ] **Step 2:** Run `npx vitest run packages/pos-contract` → FAIL. **Step 3:** Implement the interfaces; `SimulatedPos` logs `[SIMULATED POS]` on every call. **Step 4:** Run → PASS. **Step 5:** Commit `feat(pos-contract): adapter interface, simulator, contract suite`.

### Task 8: Platform config and production guards

**Files:** Create `apps/backend/src/config.ts`, `config.test.ts`

**Interfaces:**
- Produces: `interface PlatformConfig { environment: 'production'|'development'|'test'; kitchenPrintOwner: 'bridge'|'pos'; printTrigger: 'on_pos_confirmed'|'on_accepted'; catalogTtlMs: number; posUnreachableAlertMs: number; leaseSeconds: number; printMaxAttempts: number; adminToken: string }`; `loadConfig(env: Record<string, string|undefined>): PlatformConfig`; `assertAdapterAllowed(cfg: PlatformConfig, adapter: PosAdapter): void`

- [ ] **Step 1: Write failing tests:** defaults equal Global Constraints (`bridge`, `on_pos_confirmed`, 900000, 600000, 60, 3); invalid enum value throws; `assertAdapterAllowed` with `environment='production'` and a `SimulatedPos` throws; with `kitchenPrintOwner='bridge'` and an adapter whose `canSuppressKitchenPrint=false` throws a configuration error; `kitchenPrintOwner='pos'` with such an adapter passes; `development` with `SimulatedPos` passes.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement with zod. **Step 4:** Run → PASS. **Step 5:** Commit `feat(backend): config and adapter guards`.

### Task 9: POS delivery worker

**Files:** Create `apps/backend/src/outbox/backoff.ts`, `pos-delivery-worker.ts`, `backoff.test.ts`, `pos-delivery-worker.test.ts`

**Interfaces:**
- Consumes: `PosAdapter` (Task 7), `PlatformConfig` (Task 8), `transition` (domain)
- Produces: `nextDelayMs(attempt: number, rand: () => number): number`; `class PosDeliveryWorker { constructor(pool: Pool, adapter: PosAdapter, cfg: PlatformConfig, now: () => Date, rand?: () => number); runOnce(): Promise<number>; syncPaymentStatus(): Promise<number>; cancelOrder(orderId: string, actor: string): Promise<void> }` (`runOnce` returns rows processed; `syncPaymentStatus` copies `getOrderStatus().paymentStatus` into `orders.pos_payment_status` for non-final orders with a `pos_ref`, display only; `cancelOrder` calls `adapter.cancelOrder` when `pos_ref` exists, then transitions to `CANCELLED`)

- [ ] **Step 1: Write failing tests:** `nextDelayMs(1)` ≤ 2000 and ≥ 1000, `nextDelayMs(30)` ≤ 300000; worker with `SimulatedPos`: success sets `pos_ref`/`pos_number`, order `SENT_TO_POS`, outbox `done_at`, and with `printTrigger='on_pos_confirmed'` + owner `bridge` inserts `PRINT_CREATE` outbox row; call passes `suppressKitchenPrint=true` when owner is `bridge`; offline POS for a 30 min clock → order stays `ACCEPTED`, `attempts` grows, `next_attempt_at` respects backoff, after 10 min order is `NEEDS_ATTENTION` yet retries continue and succeed when POS returns (no duplicate in `SimulatedPos.submitCount`); `loseResponseNext` → worker reconciles via `findOrderByTag` and `submitCount` stays 1; `setTotalOverride` ≠ order total → `NEEDS_ATTENTION`, nothing auto-corrected; `PosPermanentError` → `NEEDS_ATTENTION`, no retry; two workers running `runOnce` concurrently never process the same outbox row twice; `syncPaymentStatus` stores `PAID` from the simulator and never writes anything to the POS; `cancelOrder` on an order with a `pos_ref` calls `SimulatedPos.cancelOrder` once and ends `CANCELLED`, and without a `pos_ref` cancels locally only.
- [ ] **Step 2:** Run `npx vitest run apps/backend/src/outbox` → FAIL. **Step 3:** Implement claiming with `SELECT ... FOR UPDATE SKIP LOCKED` on due rows of kind `POS_SUBMIT`; on `PosTransientError` before any retry call `findOrderByTag(order.id)`. **Step 4:** Run → PASS. **Step 5:** Commit `feat(backend): POS delivery worker with reconciliation`.

### Phase 2 gate
- [ ] `npm test` green. Verify each Phase 2 box maps to a passing test (simulator passes contract → Task 7; production rejects simulator → Task 8; POS offline → Task 9; ambiguous timeout → Task 9; discordant total → Task 9; unsatisfiable owner → Task 8). Record in `docs/CHECKLIST.md`. Commit `docs: phase 2 gate`.

---

# Phase 3: Print contract

### Task 10: Ticket document and hash

**Files:** Create `packages/print-contract/package.json`, `src/ticket.ts`, `src/ticket.test.ts`, `src/index.ts`

**Interfaces:**
- Produces: `interface TicketDocument { header: { orderNumber: string; time: string; copy: boolean }; lines: { quantity: number; name: string; options: string[]; note?: string }[]; footer?: string }`; `buildTicket(order: { orderNumber: string; time: Date; lines: TicketDocument['lines'] }, opts: { copy: boolean }): TicketDocument`; `canonicalize(doc: TicketDocument): string`; `contentHash(doc: TicketDocument): string` (hex sha256 of `canonicalize`); `wrapText(text: string, width: number): string[]`

- [ ] **Step 1: Write failing tests:** same content with object keys in different order → identical hash; changing a quantity changes the hash; `copy: true` changes the hash; **Review Focus:** `wrapText` of a 100-character note at width 32 returns lines each ≤ 32 whose joined content, ignoring whitespace, equals the input (nothing truncated); a single word longer than width is split, not dropped.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement; `canonicalize` is JSON with sorted keys and no insignificant whitespace. **Step 4:** Run → PASS. **Step 5:** Commit `feat(print-contract): ticket document, wrapping, hash`.

### Task 11: Printer driver contract, evidence, simulator

**Files:** Create `packages/print-contract/src/{evidence.ts,driver.ts,simulated-printer.ts,driver-contract-suite.ts}`, `simulated-printer.test.ts`

**Interfaces:**
- Consumes: `TicketDocument`, `wrapText` (Task 10)
- Produces: `type EvidenceLevel = 'DEVICE_ACKED'|'TRANSPORT_ACCEPTED'|'UNCONFIRMED'|'OPERATOR_CONFIRMED'`; `interface PrinterCapabilities { widthChars: number; codepages: string[]; cutter: boolean; status: 'none'|'basic'|'bidirectional' }`; `interface PrintOutcome { result: 'PRINTED'|'FAILED'|'UNCERTAIN'; evidence: EvidenceLevel; detail?: string }`; `interface PrinterDriver { readonly kind: 'real'|'simulated'; capabilities(): PrinterCapabilities; print(doc: TicketDocument, ctx: { jobId: string }): Promise<PrintOutcome>; queryStatus(): Promise<{ online: boolean; paperOut: boolean } | null> }`; `evidenceFor(status: PrinterCapabilities['status'], deviceAcked: boolean): EvidenceLevel`; `class SimulatedPrinter implements PrinterDriver` with constructor `(caps: PrinterCapabilities, opts?: { onBytes?: (b: Buffer) => void })`, `failNext()`, `hangNext()`, `partialNext()`, `printedJobs: string[]`; `runPrinterDriverContract(name: string, factory: () => PrinterDriver & PrinterFaults)`

- [ ] **Step 1: Write failing tests:** `evidenceFor('bidirectional', true)` = `DEVICE_ACKED`; `('basic', true)` = `TRANSPORT_ACCEPTED`; `('none', false)` = `UNCONFIRMED`; contract suite run against two simulators (width 32 `none`, width 48 `bidirectional`) asserts a ticket prints once with the evidence level matching its capabilities, a refused print returns `FAILED` with no job recorded, a partial write returns `UNCERTAIN`; **Review Focus:** a note `"senza è, à, ù 🍕"` on a codepage-limited driver prints with unsupported characters replaced by `?`, all lines present, no throw.
- [ ] **Step 2:** Run `npx vitest run packages/print-contract` → FAIL. **Step 3:** Implement; the simulator renders text to a buffer, tags output `[SIMULATED PRINTER]`, and replaces characters outside its codepage. **Step 4:** Run → PASS. **Step 5:** Commit `feat(print-contract): driver contract, evidence levels, simulator`.

### Task 12: Print job service

**Files:** Create `packages/domain/src/print-state.ts`, `print-state.test.ts`, `apps/backend/src/outbox/print-create-worker.ts`, `apps/backend/src/print/job-service.ts`, `job-service.test.ts`, `print-create-worker.test.ts`

**Interfaces:**
- Consumes: `buildTicket`, `contentHash` (Task 10), `transition` (domain)
- Produces: domain `type PrintJobState = 'QUEUED'|'LEASED'|'PRINTED'|'FAILED'|'UNCERTAIN'|'CANCELLED'`, `transitionPrintJob(from: PrintJobState, to: PrintJobState): PrintJobState`; `class PrintJobService { constructor(pool: Pool, cfg: PlatformConfig, now: () => Date); createJob(orderId: string, revision: number): Promise<{ jobId: string }>; lease(bridgeId: string, afterSeq: number, limit: number): Promise<LeasedJob[]>; recordReceipt(r: { jobId: string; bridgeId: string; outcome: 'PRINTED'|'FAILED'|'UNCERTAIN'; evidence: EvidenceLevel; contentHash: string; printedAt: Date }): Promise<'recorded'|'duplicate'> }`; `class PrintCreateWorker { constructor(pool: Pool, jobs: PrintJobService); runOnce(): Promise<number> }`; `type LeasedJob = { jobId: string; seq: number; dedupeKey: string; contentHash: string; ticket: TicketDocument; printerRole: string; leaseUntil: Date }`

- [ ] **Step 1: Write failing tests:** state machine allows `QUEUED→LEASED`, `LEASED→PRINTED|FAILED|UNCERTAIN`, `FAILED→QUEUED` only below `printMaxAttempts`, rejects `PRINTED→QUEUED`; `createJob` twice with the same revision → one `print_jobs` row with `dedupe_key='<orderId>:KITCHEN:<revision>'`; `lease` returns jobs with `seq > afterSeq` in order, sets `lease_until = now + 60 s`, and does not return a job already leased and unexpired; an expired lease stays `LEASED` (not requeued) per spec §7.2; `recordReceipt` `PRINTED` sets `print_confirmed_at` via order transition, `UNCERTAIN` or `FAILED` after max attempts moves the order to `NEEDS_ATTENTION`; a repeated identical receipt returns `duplicate` and changes nothing; a receipt with different `contentHash` throws and writes no receipt row; worker turns a `PRINT_CREATE` outbox row into a job once even when run twice concurrently.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS. **Step 5:** Commit `feat(backend): print jobs, leasing, receipts`.

### Task 13: Reprint, operator confirmation, admin routes

**Files:** Create `apps/backend/src/print/admin-routes.ts`, `admin-routes.test.ts`; Modify `job-service.ts`

**Interfaces:**
- Consumes: `PrintJobService` (Task 12)
- Produces: `PrintJobService.requestReprint(orderId: string, actor: string): Promise<{ jobId: string; revision: number }>` (new revision with `copy=true`); `PrintJobService.operatorConfirm(jobId: string, actor: string): Promise<void>` (receipt with `OPERATOR_CONFIRMED`); `PrintJobService.declareJournalLost(bridgeId: string): Promise<number>` (`LEASED` jobs of that bridge → `UNCERTAIN`); routes under `/admin/v1` requiring `Authorization: Bearer <adminToken>`: `POST /orders/:id/reprint`, `POST /print-jobs/:id/confirm`, `POST /orders/:id/resolve`, `POST /orders/:id/ready`, `POST /orders/:id/complete`, `POST /orders/:id/cancel`, `POST /bridges/:id/revoke`, `POST /bridges/:id/journal-lost`

- [ ] **Step 1: Write failing tests:** reprint of a printed order creates revision 2 whose ticket has `header.copy=true` and a different `contentHash`, revision 1 untouched; reprint after `UNCERTAIN` clears the order back to its previous status once revision 2 prints; `operatorConfirm` writes a receipt with evidence `OPERATOR_CONFIRMED`, actor recorded in `order_events`; missing or wrong bearer → 401; revoke sets `bridges.revoked_at`; `journal-lost` returns the number of jobs moved to `UNCERTAIN`; `ready` fails with 409 until both markers are set and succeeds after; `complete` follows `READY`; `cancel` delegates to `PosDeliveryWorker.cancelOrder`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS. **Step 5:** Commit `feat(backend): reprint, operator confirmation, admin routes`.

### Phase 3 gate
- [ ] `npm test` green. Map each Phase 3 box: canonical hash → Task 10; two simulated drivers pass contract → Task 11; evidence levels → Task 11; COPIA revision → Task 13. Record in `docs/CHECKLIST.md`. Commit `docs: phase 3 gate`.

---

# Phase 4: Protocol and Print Bridge core

### Task 14: Protocol schemas and request signing

**Files:** Create `packages/protocol/package.json`, `src/messages.ts`, `src/signing.ts`, `src/index.ts`, `src/protocol.test.ts`

**Interfaces:**
- Produces: `const PROTOCOL_VERSION = 1`; zod schemas and inferred types `HelloRequest { bridgeId: string; protocolVersion: number; printers: { role: string; capabilities: PrinterCapabilities }[]; lastSeq: number; inFlight: { jobId: string; state: 'RECEIVED'|'PRINTING'|'UNCERTAIN' }[] }`, `JobsResponse { jobs: LeasedJob[]; cursor: number }`, `ReceiptRequest`, `HeartbeatRequest`; `signRequest(privateKey: KeyObject, req: { method: string; path: string; body: string; timestamp: number }): string`; `verifyRequest(publicKey: KeyObject, req: {...}, signature: string, nowSec: number): { ok: true } | { ok: false; code: 'BAD_SIGNATURE'|'CLOCK_SKEW' }`

- [ ] **Step 1: Write failing tests:** a signed request verifies; altered body → `BAD_SIGNATURE`; wrong key → `BAD_SIGNATURE`; **Review Focus:** timestamp 61 s away from `nowSec` → `CLOCK_SKEW`, 59 s away → ok; a `HelloRequest` with `protocolVersion` 2 parses but is flagged so the server can answer 426; invalid shapes rejected by schemas.
- [ ] **Step 2:** Run `npx vitest run packages/protocol` → FAIL. **Step 3:** Implement; signed string is `METHOD\nPATH\nTIMESTAMP\nSHA256(body)`. **Step 4:** Run → PASS. **Step 5:** Commit `feat(protocol): v1 schemas and Ed25519 signing`.

### Task 15: Backend bridge endpoints

**Files:** Create `apps/backend/src/bridge/auth.ts`, `routes.ts`, `routes.test.ts`; Modify `server.ts` (create) to register all routes

**Interfaces:**
- Consumes: `PrintJobService` (Task 12), protocol (Task 14)
- Produces: `registerBridgeRoutes(app: FastifyInstance, jobs: PrintJobService, pool: Pool, cfg: PlatformConfig): void` with `POST /bridge/v1/hello`, `GET /bridge/v1/jobs?cursor&wait`, `POST /bridge/v1/jobs/:id/receipt`, `POST /bridge/v1/heartbeat`; headers `X-Bridge-Id`, `X-Timestamp`, `X-Signature`; errors `401 {code:'BAD_SIGNATURE'|'CLOCK_SKEW'|'REVOKED'}`, `426 {code:'PROTOCOL_VERSION'}`

- [ ] **Step 1: Write failing tests** with `app.inject`: unsigned or revoked bridge → 401; skewed clock → 401 `CLOCK_SKEW`; `protocolVersion` ≠ 1 → 426; `hello` registers printers and reconciles `inFlight` (`PRINTING`→job `UNCERTAIN`, `RECEIVED`→stays `LEASED`, unknown→`QUEUED`); `jobs` with `wait=1` returns immediately when a job is queued and an empty list after the wait otherwise; after a lease the same job is not returned to a second poll; `receipt` repeats idempotently; receipt with different hash → 409; `heartbeat` stores printer status and `last_seen_at` on `bridges`.
- [ ] **Step 2:** Run `npx vitest run apps/backend/src/bridge` → FAIL. **Step 3:** Implement the long-poll as a loop polling the DB every 500 ms up to `wait` seconds (max 25). **Step 4:** Run → PASS. **Step 5:** Commit `feat(backend): bridge protocol endpoints`.

### Task 16: Bridge journal

**Files:** Create `apps/print-bridge/package.json`, `src/journal.ts`, `journal.test.ts`

**Interfaces:**
- Produces: `class Journal { constructor(path: string); accept(job: LeasedJob): 'accepted'|'duplicate'; markPrinting(jobId: string): void; complete(jobId: string, outcome: 'PRINTED'|'FAILED'|'UNCERTAIN', evidence: EvidenceLevel): void; recoverOnStartup(): string[]; inFlight(): { jobId: string; state: 'RECEIVED'|'PRINTING'|'UNCERTAIN' }[]; pendingReceipts(): ...; cursor(): number; setCursor(n: number): void; close(): void }`

- [ ] **Step 1: Write failing tests:** `accept` same `jobId` or same `dedupeKey` twice → second `duplicate`; `markPrinting` is durable: reopening the file after it (without `complete`) and calling `recoverOnStartup()` returns that jobId and sets state `UNCERTAIN`; `RECEIVED` jobs survive reopen unchanged; `complete` sets final state and leaves a receipt pending until acknowledged by the backend; cursor persists across reopen; file opened in WAL mode with `synchronous=FULL` (assert via pragma).
- [ ] **Step 2:** Run `npx vitest run apps/print-bridge/src/journal.test.ts` → FAIL. **Step 3:** Implement with `better-sqlite3`; each mutation in its own committed transaction. **Step 4:** Run → PASS. **Step 5:** Commit `feat(print-bridge): durable journal`.

### Task 17: Bridge runner

**Files:** Create `apps/print-bridge/src/backend-client.ts`, `runner.ts`, `config.ts`, `drivers/registry.ts`, `runner.test.ts`

**Interfaces:**
- Consumes: `Journal` (Task 16), `PrinterDriver` (Task 11), protocol (Task 14)
- Produces: `interface BackendClient { hello(r: HelloRequest): Promise<void>; pollJobs(cursor: number, waitSec: number): Promise<JobsResponse>; sendReceipt(r: ReceiptRequest): Promise<void> }`; `class HttpBackendClient implements BackendClient` (signs requests); `class BridgeRunner { constructor(client: BackendClient, journal: Journal, drivers: Map<string, PrinterDriver>, opts: { bridgeId: string; sleep: (ms: number) => Promise<void> }); tick(): Promise<void>; run(signal: AbortSignal): Promise<void> }`; `driverRegistry: Map<string, () => PrinterDriver>` (empty until a real driver exists; `config.ts` refuses `kind='simulated'` unless `ALLOW_SIMULATED=1`)

- [ ] **Step 1: Write failing tests** with a fake `BackendClient` (in-test object): `tick` sends `hello` with `inFlight` from the journal first; a polled job is journaled, marked `PRINTING` **before** `driver.print` is called (assert call order), printed once, receipt sent, cursor advanced; same job delivered twice → printed once; backend `sendReceipt` failing → receipt stays pending and is re-sent on the next tick without reprinting; `pollJobs` throwing → runner sleeps with backoff and continues; driver returning `UNCERTAIN` → receipt `UNCERTAIN`, no retry; startup with a journal containing a `PRINTING` job reports it as `UNCERTAIN` and never prints it.
- [ ] **Step 2:** Run `npx vitest run apps/print-bridge/src/runner.test.ts` → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS. **Step 5:** Commit `feat(print-bridge): runner and backend client`.

### Task 18: Chaos tests

**Files:** Create `tests/chaos/bridge-harness.ts`, `tests/chaos/chaos.test.ts`

**Interfaces:**
- Consumes: Tasks 12, 15, 16, 17; `SimulatedPrinter` (Task 11)
- Produces: `bridge-harness.ts` runnable with `node` as a child process: wires `BridgeRunner` to `HttpBackendClient` and a `SimulatedPrinter` that appends each printed `jobId` to a file and, when `HANG_AT=<jobId>` is set, hangs after journaling `PRINTING`. Labelled simulated.

- [ ] **Step 1: Write failing tests** with embedded Postgres, the real fastify app, and the harness as a child process: (a) kill the child while hanging mid-print, restart → the printed-file contains the job at most once, the job ends `UNCERTAIN`, the order `NEEDS_ATTENTION`, and no automatic reprint happens; (b) stop the backend for N seconds while 3 orders are created, restart it → all 3 printed exactly once; (c) deliver the same lease twice (expire lease then re-poll) → printed once; (d) revoked key → bridge prints nothing; (e) restart the harness after normal completion → nothing reprinted.
- [ ] **Step 2:** Run `npx vitest run tests/chaos` → FAIL. **Step 3:** Fix defects the tests expose in earlier tasks; do not weaken a test to make it pass. **Step 4:** Run → PASS. **Step 5:** Commit `test: bridge chaos scenarios`.

### Phase 4 gate
- [ ] `npm test` green, including chaos. Map each Phase 4 box: protocol versions → Task 14/15; `PRINTING` before bytes → Task 17; kill mid-print → Task 18a; disconnect/resume → Task 18b; redelivery → Task 17/18c; bad signature/revoked → Task 15/18d. Record in `docs/CHECKLIST.md`. Commit `docs: phase 4 gate`.

---

# Phase 5: Windows service

### Task 19: Service packaging

**Files:** Create `apps/print-bridge/service/print-bridge.xml`, `install-service.ps1`, `uninstall-service.ps1`, `apps/print-bridge/src/main.ts`, `apps/print-bridge/src/main.test.ts`, `docs/service-install.md`

**Interfaces:**
- Produces: `main.ts` loads `config.json` (path in `PRINT_BRIDGE_CONFIG`; bridge id, backend URL, private key path, journal path, printer role→driver map), refuses to start with a `simulated` driver unless `ALLOW_SIMULATED=1`, handles SIGTERM by finishing the current tick; WinSW config with `<startmode>Automatic</startmode>`, `<onfailure action="restart" delay="5 sec"/>`, `<log>` rotation

- [ ] **Step 1: Write failing test** `main.test.ts`: starting with a simulated driver and no `ALLOW_SIMULATED` exits non-zero with a clear message; invalid config exits non-zero; SIGTERM mid-tick lets the tick finish and closes the journal.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement `main.ts` and the scripts. **Ask the user before downloading WinSW**; state the exact release, source URL and size, pin its SHA-256 in `install-service.ps1` and verify it before use. Do not install anything on the machine without the user's go-ahead.
- [ ] **Step 4:** Run `npx vitest run apps/print-bridge/src/main.test.ts` → PASS. **Step 5:** Commit `feat(print-bridge): Windows service packaging`.

### Phase 5 gate (manual, by the user)
- [ ] With the user's approval, install the service on the target Windows machine using the simulated printer harness (`ALLOW_SIMULATED=1`) and queue a job. **Ask the user to perform a real Windows restart.** After login, verify without manual action: service `Running`, journal intact, pending job printed once, no duplicate. Kill the service process from Task Manager and confirm it restarts within about 5 s.
- [ ] Record date, machine, Windows version and observed result in `docs/CHECKLIST.md`. Until this is recorded, constraint V3 stays marked **not demonstrated**. Commit `docs: phase 5 gate`.

---

# Phase 6: End-to-end and handover

### Task 20: End-to-end and combined chaos

**Files:** Create `tests/e2e/e2e.test.ts`

**Interfaces:**
- Consumes: everything above; `SimulatedPos`, `SimulatedPrinter`

- [ ] **Step 1: Write failing tests:** full flow with embedded Postgres, fastify, workers, bridge harness: create order → `SENT_TO_POS` → `PRINT_CONFIRMED` → `READY`, with one POS order, one printed ticket carrying the POS number; combined chaos: POS offline + backend restarted + bridge killed mid-print → no lost order, at most one physical print per order, each ambiguity surfaced as `NEEDS_ATTENTION`; `print_trigger='on_accepted'` run reaches `READY` with print before POS; `kitchen_print_owner='pos'` creates no print jobs.
- [ ] **Step 2:** Run `npx vitest run tests/e2e` → FAIL. **Step 3:** Fix exposed defects in their owning modules (never weaken the test). **Step 4:** Run → PASS. **Step 5:** Commit `test: end-to-end and combined chaos`.

### Task 21: Runbook and traceability

**Files:** Create `docs/runbook.md`, `docs/traceability.md`; Modify `docs/CHECKLIST.md`

- [ ] **Step 1:** Write `docs/runbook.md`: handling `NEEDS_ATTENTION` per cause, `COPIA` reprint, operator confirmation, revoking a bridge key, declaring a lost journal, reading the audit chain (`order_events` → `print_jobs` → `print_receipts`).
- [ ] **Step 2:** Write `docs/traceability.md`: table V1–V8 → exact test file and test name; V3 cites the Phase 5 manual record; V8 cites the simulator guards (Tasks 8, 17, 19). Every row must resolve to an existing test; verify by running `npx vitest run -t "<name>"` for each and noting the result.
- [ ] **Step 3:** Run `npm test` → all green. Tick the Phase 6 boxes. State in `docs/traceability.md` the open items: real POS adapter and real printer driver (inputs needed per spec §10 "Lavoro successivo"), assumptions A1–A3 not yet validated against a real POS, admin auth is a static token.
- [ ] **Step 4:** Commit `docs: runbook, traceability, final checklist`.
