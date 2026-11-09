# Design direction

The brief fixes the palette (deep charcoal, tomato red, basil green, cream) and a serif + sans pairing. The choices
below are what we do *inside* that, so the result does not read as a template.

## Idea

Dark is the **stage** (hero, pizza builder: the pizza is the only thing that glows). Cream is **paper**: what you read
or print (menu, receipt, kitchen ticket). The live "Sulla tua pizza" list is styled as the kitchen *comanda*, so the
customer is literally writing the ticket the pizzeria will read.

## Tokens

| Role | Value |
|---|---|
| Field | charcoal 900 `#151211`, raised surfaces charcoal 800 `#1e1917`, borders charcoal 600 `#3a302c` |
| Text on dark | cream 100 `#f7efe0`, muted cream 400 `#b9a27c` |
| Paper | cream 100 `#f7efe0` with fine paper grain; ink charcoal 900 |
| Action | tomato 600 `#c2351f` (cream text, AA); tomato 400 `#f26e52` for text/icons on dark |
| Fresh / success | basil 600 `#3a7344` fill, basil 400 `#7db474` text on dark |
| Warmth (rare) | gold 400 `#e2bc6a`: focus ring, oven glow |
| Display type | **Bodoni Moda** (variable, optical size). Used large; never below ~24px |
| Body type | **Instrument Sans**. Prices use tabular lining numerals |
| Shapes | arches (oven mouth), circles (the pizza, ingredient "plates"), perforated ticket edges. Radii are chosen per object, not one value everywhere |

## Principles

1. Spend boldness in one place: the pizza stage. Everything else is quiet charcoal and paper.
2. Structure encodes information: dotted leaders in the paper menu, perforation on the ticket, arch = the oven.
3. Controls feel physical: buttons press like enamel, toppings fall with weight, price counts up.
4. No tracked-out uppercase eyebrows, no "→" on buttons, no dot-joined meta strings, no numbered markers
   except the genuine 3-step sequence, no scroll-triggered fade-ups, no hover-lift on every card.
5. Words are plain Italian, sentence case, verbs first ("Aggiungi al carrello", never "Invia").
6. Accessibility floor: AA contrast, visible focus (gold), full keyboard use, `prefers-reduced-motion` respected.

## Pizza art style guide (ingredient pieces)

- Top-down, light from the top-left; the contact shadow falls to the bottom-right.
- Every piece is drawn in a **100×100 local box centred on (0,0)** (x,y ∈ [-50,50]). Its real size in cm is declared
  separately (`sizeCm`); the engine scales it to the pizza.
- Layering inside a piece, bottom to top: soft contact shadow (offset ≈ (2.5,3.5), radial gradient, **no blur filter**) →
  body fill (linear/radial gradient) → texture (flecks, fat, veins, seeds) → edge darkening → specular highlight.
- **No SVG filters inside pieces.** Depth comes from gradients and opacity only (≈150 pieces render at once on a phone).
- Keep each piece ≤ 40 SVG elements. Provide ≥ 3 variants per ingredient (different silhouette/pattern), so a pizza
  never looks stamped.
- Colours: baked toppings are slightly browned and glossy at the edges; `afterBake` items (basil, rocket, crudo,
  burrata, parmesan, pistachio, truffle, oil) look fresh, bright and un-browned.
- Gradient ids must be namespaced with the `uid` prop (several pizzas share one page).
- Keep art replaceable: an ingredient may later be swapped for a WebP at `public/ingredients/<slug>.webp`.
