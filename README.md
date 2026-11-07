# agent-business-case

A vendor-neutral business case model for AI customer-service agents. It is the model behind the
calculator at [genai4business.com/tools/business-case](https://genai4business.com/tools/business-case),
published so every number on that page can be read, tested and reused.

One TypeScript file, pure functions, no dependencies. Node 22.18+ runs it directly (type stripping).
To reuse it, copy `src/businessCase.ts` or import it through a bundler: Node does not strip types
inside `node_modules`, so it is not meant to be installed as a package.

```bash
npm test          # 5 tests
npm run example   # the default scenario under both pricing models
```

## What it models

Four things that spreadsheet business cases for AI agents usually leave out:

1. **Containment is not resolution.** A share of contained contacts come back and reach a human
   anyway (`repeatRate`).
2. **Containment ramps.** It climbs in equal monthly steps from `startContainment` to
   `targetContainment` over `rampMonths`; month 1 is not steady state.
3. **Escalated contacts still cost AI minutes.** Per-minute pricing bills the minutes spent before a
   handoff (`aiMinutesEscalated`).
4. **The cheaper pricing model depends on your containment.** The model computes where per-minute
   and per-resolution cost the same.

## Formulas

Per month, with `V` contacts and containment `c`:

| Quantity | Formula |
|---|---|
| Human cost per contact | `AHT/60 × hourlyCost / occupancy` |
| Human cost | `V(1−c) × unit × (1 − handoffAhtSaving)` + `V·c × repeatRate × unit` |
| AI cost, per minute | `V × (c·dC + (1−c)·dE) × pMin` |
| AI cost, per resolution | `V × c × pRes` |
| Net benefit | baseline (`V × unit`) − human − AI − platform fee − internal run cost |
| Payback | first month where cumulative net, starting at −implementation cost, is ≥ 0 |
| ROI | net benefit over the horizon ÷ (implementation + AI usage + platform fees + internal run cost) |
| Truly resolved contacts | `V × c × (1 − repeatRate)` |

`dC` and `dE` are AI minutes on a contained and on an escalated contact; `pMin` is the all-in price per
AI minute (voice platform, model, telephony); `pRes` the price per billed resolution (outcome-based
pricing).

**Repeat contacts are still billed.** Under per-resolution pricing every contained contact is billed,
including the ones that come back and reach a human. So the AI cost per *truly* resolved contact is
above the list price: €1.00 against €0.90 in the default scenario. This is usually the first number a
finance team asks about.

**Pricing crossover.** Setting the two AI costs equal gives

```
c* = pMin·dE / (pRes + pMin·dE − pMin·dC)
```

Below `c*` per-resolution is cheaper, above it per-minute is. The model bills every contained contact
as a resolution, as a contract counting both confirmed and assumed resolutions would, so here `c*` is
both a containment rate and a billed-resolution rate.

If only a share `k` of contained contacts is billed (for example, confirmed resolutions only), replace
`pRes` with `k·pRes`:

```
c* = pMin·dE / (k·pRes + pMin·dE − pMin·dC)
```

which is still a containment rate. The code implements the `k = 1` case.

When `dC = dE = d`, `c* = d·pMin / pRes`: with 3 minutes at €0.15 and €0.90 per resolution, 50%. A test
checks this matches the rule used in [deployment-in-a-box](https://github.com/LucaDeAng/deployment-in-a-box).

**Per-conversation pricing** is the same formula with `dC = dE = 1` and `pMin` set to the price per
conversation `pConv`: per-resolution is cheaper while containment is below `pConv / pRes`.

## Default scenario

All defaults are illustrative assumptions, stated in `DEFAULT_INPUTS`:

- 100,000 contacts a month, 6-minute AHT, €28 loaded agent hour at 75% occupancy;
- containment 10% → 35% over 6 months, 10% repeat contacts, handoff saves 10% of human AHT;
- 3.5 AI minutes on a contained contact, 1.5 before a handoff;
- €0.12 per AI minute, €0.90 per resolution, €5,000 a month platform fee;
- €150,000 implementation, €8,000 a month internal run cost, 24 months.

deployment-in-a-box assumes €0.15 per minute all-in. Both values are illustrative; replace them with
your quotes.

`npm run example` prints:

```
human cost per contact: €3.73
pricing crossover (billed-resolution rate): 27.3%
perMinute     payback month 4, 24-month net €2,103,200, ...
perResolution payback month 3, 24-month net €2,030,300, ...
```

These describe the defaults, not any deployment. Replace them with your own volumes and quotes.

## API

- `summarize(inputs)`: both pricing models, cost per resolved contact, crossover.
- `runModel(inputs, "perMinute" | "perResolution")`: month-by-month results, payback, ROI.
- `containmentAt`, `humanCostAt`, `aiUsageCost`, `pricingBreakEven`: the pieces above.
- `sensitivity(inputs, pricing, key, delta)`: steady-state monthly net with one input shifted.
- `inputsToQuery` / `inputsFromQuery`: share a scenario as a URL.
- `PRESETS`: three illustrative starting points (utility voice, insurance claims, e-commerce chat).

## Not modelled

CSAT and revenue effects, attrition and hiring, peak staffing (Erlang), compliance cost, taxes,
discounting, seasonality, wage growth and model price changes. Repeat contacts are the only quality
penalty, and the handoff can only make human handling faster, although escalated contacts are often
the hardest ones.

## License

MIT
