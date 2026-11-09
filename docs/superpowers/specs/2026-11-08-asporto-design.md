# Asporto — takeaway ordering site: design and plan

Date: 2026-11-08 · Status: working spec. Built straight through, as requested ("ask only if blocked").

## 1. Intent

**Outcome.** A mobile-first takeaway ("asporto") site for an Italian pizzeria whose centrepiece is a visual
pizza builder, plus a password-protected admin that receives orders live and prints kitchen tickets.
Production quality, not a demo. Pickup only, no delivery.

**Success looks like** (from the brief): customer can build or pick a pizza, pay in Stripe test mode, get a
confirmation + email + live status; the pizzeria sees the paid order instantly with sound, prints a ticket, and
moves it Nuovo → In preparazione → Pronto → Ritirato; owner can edit menu, prices, hours, capacity and close the
shop; prices are always computed server-side in cents; allergens show everywhere; Lighthouse ≥ 90; tests green.

**My assumptions (not stated by you, easy to change):**

- Business name, address, P.IVA, hours, prices, menu and allergen data are realistic **placeholders** (see §9).
- Mozzarella is an ordinary ingredient (Formaggi), not baked into the base: Marinara has none.
- A classic pizza has a fixed price per size; "Personalizza" charges only for *added* portions, never refunds removals.
- The site issues a **non-fiscal** receipt; the fiscal receipt (scontrino) stays a pizzeria process (documented TODO).
- Pizza art is hand-built SVG (replaceable, tiny, recolourable, animatable), not AI-generated photos.

## 2. Repository state (found, not touched)

The git history holds an earlier, different project, "PIZZERIA 3D" (POS adapter + Windows print bridge, POS as
source of truth). It conflicts with this brief (own menu DB, Stripe, admin), and its 20 files were already deleted
from the working tree. Nothing was restored or discarded: it stays intact in `feat/platform-foundation`
(commit `c733bc1`). This work is on branch `feat/takeaway-site`.

## 3. Stack

Next.js 16.4 (App Router, **Cache Components**, Turbopack) · React 19.3 · TypeScript · Tailwind 4 · Framer Motion 14 ·
Drizzle ORM + Postgres · Zod 4 · Stripe (Payment Element) · Resend · Luxon (server-only) · jose · Vitest · Playwright.

- **Database.** `DATABASE_URL` → `postgres-js` (Neon/Supabase, `prepare:false` for poolers). Unset in dev/test →
  embedded **PGlite** (real Postgres 18 in WASM) with auto-migrate + seed, so `npm run dev` needs zero setup.
  Production without `DATABASE_URL` is a fatal config error.
- **Next 16 rules followed.** All DB reads are request-time behind `<Suspense>`/`loading.tsx`, so `next build`
  never needs a database. `proxy.ts` (not middleware) does the optimistic admin gate; real checks live in a DAL.
  `after()` runs email work post-response. Seeded PRNG only, never `Math.random()` in render.

## 4. Key decisions

| Topic | Decision | Why |
|---|---|---|
| Money | integer cents everywhere; branded `Cents` type; IVA inclusa | no float drift |
| Pricing | one pure `priceCart(catalog, input)`; client uses it for the live price, server recomputes from DB at checkout | never trust client prices |
| Stripe flow | deferred-intent Payment Element: shown immediately, order + PaymentIntent created on "Paga" | no orphan pending orders, Apple/Google Pay automatic |
| Paid = webhook only | `payment_intent.succeeded`, signature-verified, `stripe_events` PK dedupes, state change in one transaction; return URL never marks paid | idempotent + verifiable |
| Test-mode only | `sk_live_` keys are refused unless an explicit override env is set | brief: TEST MODE ONLY |
| Dev payments | `PAYMENTS_PROVIDER=mock` (auto when no Stripe key, hard-disabled in production) signs a webhook with a local secret and posts it to the **real** webhook route | lets the whole flow run and be tested offline; labelled DEV in UI |
| Slots | 15-min grid inside opening hours; earliest = ceil(now + prep); capacity counted in pizzas per slot; pending orders hold a slot 15 min; capacity checked under `pg_advisory_xact_lock` | no overbooking |
| Realtime | SSE backed by a `realtime_events` table + `Last-Event-ID` resume, polling fallback | stateless, works on Vercel and locally |
| Rate limit | Postgres fixed-window counters (`INSERT … ON CONFLICT`) | works across serverless instances, no Redis |
| Admin auth | scrypt password hash, signed HttpOnly cookie (jose), login rate-limit + lockout, Origin check on mutations | no extra service |
| i18n | typed Italian dictionary + `t()`; all UI strings extracted | adding `en` = one file + resolver |
| Rebrand | `src/config/business.ts` (name, address, phone, P.IVA, hours seed, colours, fonts) → CSS variables at runtime | one-file rebrand |

## 5. Pizza engine (the heart)

- **Layout.** Per-ingredient *prefix-stable best-candidate* sequence inside the disc (a progressive Poisson-disc),
  seeded by `hash(pizzaSeed, slug)`. Taking the first *n* points means adding a portion never moves existing pieces,
  and adding/removing another ingredient never moves this one. Pure function → same on server and client; saved
  cart pizzas redraw identically.
- **Layers.** Static SVG (board, crust, sauce, melted mozzarella) is rasterised once; a second SVG holds toppings
  only (no filters) so animation stays cheap. Z-order by category: melt < cheese < veg < salumi < fish < extras < finish.
- **Melted mozzarella** is a metaball contour (marching squares → smoothed path), not a runtime filter.
- **Art** = registry `slug → { variants, size, layer, scatter style, density }`; each ingredient is an SVG `<g>`
  def instanced with `<use>`. Dropping `public/ingredients/<slug>.webp` plus a registry flag replaces any piece.
- **Motion.** Pieces spring in from a common drop point (scale ↓, slight spin, staggered), shadow tightens on
  landing; count-up price; everything respects `prefers-reduced-motion`.

## 6. Order lifecycle

`awaiting_payment` → (webhook) `new` → `preparing` → `ready` → `completed` (Ritirato); also `cancelled`, `expired`.
Payment status is a separate column. Illegal transitions are rejected by a pure state machine. Order, items
(frozen names/prices/ingredients/allergens) and the first event are written in one transaction.

## 7. Security and compliance

Zod on every input; server-side pricing; secrets only in env; webhook raw-body signature check; rate-limited public
endpoints; security headers; admin never indexed (`robots`, `noindex`). Allergens (EU 14, Reg. UE 1169/2011) per
ingredient, per pizza, in cart, in confirmation and on the kitchen ticket. Privacy/Cookie/Terms pages are clearly
marked TODO; footer carries a P.IVA placeholder.

## 8. Milestones and gates

| # | Milestone | Gate |
|---|---|---|
| M1 | Config, theme, i18n, DB schema + migrations + seed, pure domain (money, allergens, pricing, slots, status) | unit tests green |
| M2 | Pizza engine + ingredient art + dev lab page | determinism tests; screenshots 390/1440 reviewed |
| M3 | Home, menu, builder (mobile sheet / desktop split), cart | browser walkthrough + screenshots |
| M4 | Slots, checkout, payments (Stripe + dev mock), webhook, emails, confirmation + live status | webhook tests; end-to-end with mock provider |
| M5 | Admin: auth, live board (SSE + sound), ticket/print, menu/ingredient/settings editors | order → admin → status flow verified |
| M6 | Legal placeholders, allergen page, SEO/JSON-LD, a11y, Lighthouse ≥ 90, README, `.env.example`, handoff list | Lighthouse + full test run |

## 9. Placeholders and what only you can provide

Finalised in the README at the end. Known now: Stripe test keys + webhook secret (live Stripe verification needs
them; webhook logic is already tested with real signature maths), Resend key + verified sender domain, production
`DATABASE_URL`, real menu/prices/allergen data, logo, photos, legal texts, P.IVA, address, Apple Pay domain
registration, and the fiscal-receipt process.
