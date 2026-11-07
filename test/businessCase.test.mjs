// Run with: npm test  (Node 22.18+ strips the TypeScript types)
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_INPUTS, aiUsageCost, containmentAt, pricingBreakEven, summarize } from "../src/businessCase.ts";

test("break-even matches LOG-04's rule when every contact uses the same AI minutes", () => {
  // Deployment in a box: 3 min at €0.15 all-in vs €0.90 per resolution -> 3 * 0.15 / 0.90 = 50%
  const i = { ...DEFAULT_INPUTS, aiMinutesContained: 3, aiMinutesEscalated: 3, pricePerMinute: 0.15, pricePerResolution: 0.9 };
  assert.ok(Math.abs(pricingBreakEven(i) - 0.5) < 1e-9);
});

test("ramp climbs in equal steps and reaches target in the last ramp month", () => {
  const i = { ...DEFAULT_INPUTS, startContainment: 0.1, targetContainment: 0.35, rampMonths: 6 };
  const months = [1, 2, 3, 4, 5, 6].map((m) => containmentAt(i, m));
  const steps = months.slice(1).map((c, k) => c - months[k]);
  assert.ok(Math.abs(months[0] - 0.1) < 1e-9);
  assert.ok(Math.abs(months[5] - 0.35) < 1e-9);
  for (const s of steps) assert.ok(Math.abs(s - steps[0]) < 1e-9, `uneven step ${s} vs ${steps[0]}`);
});

test("a one-month ramp starts at target", () => {
  assert.equal(containmentAt({ ...DEFAULT_INPUTS, rampMonths: 1, targetContainment: 0.4 }, 1), 0.4);
});

test("at the crossover both pricing models cost the same, with unequal AI minutes", () => {
  const c = pricingBreakEven(DEFAULT_INPUTS);
  const diff = aiUsageCost(DEFAULT_INPUTS, c, "perMinute") - aiUsageCost(DEFAULT_INPUTS, c, "perResolution");
  assert.ok(Math.abs(diff) < 1e-6, `cost gap ${diff}`);
});

test("the default scenario prints the numbers in the README", () => {
  const s = summarize(DEFAULT_INPUTS);
  assert.equal(s.results.perMinute.paybackMonth, 4);
  assert.equal(s.results.perResolution.paybackMonth, 3);
  assert.equal(Math.round(s.results.perMinute.totalNet), 2_103_200);
  assert.equal(Math.round(s.results.perResolution.totalNet), 2_030_300);
  assert.equal(s.costPerResolution.perResolution.toFixed(2), "1.00");
});
