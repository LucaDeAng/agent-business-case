// npm run example: the default scenario under both pricing models.
import { DEFAULT_INPUTS, humanCostPerContact, summarize } from "./src/businessCase.ts";

const s = summarize(DEFAULT_INPUTS);
const eur = (x) => `€${Math.round(x).toLocaleString("en-US")}`;
console.log(`human cost per contact: €${humanCostPerContact(DEFAULT_INPUTS).toFixed(2)}`);
console.log(`pricing crossover (billed-resolution rate): ${(100 * s.pricingBreakEvenContainment).toFixed(1)}%`);
for (const p of ["perMinute", "perResolution"]) {
  const r = s.results[p];
  console.log(`${p.padEnd(13)} payback month ${r.paybackMonth}, 24-month net ${eur(r.totalNet)}, ` +
    `steady-state monthly net ${eur(r.steadyStateMonthlyNet)}, AI cost per resolved contact €${s.costPerResolution[p].toFixed(2)}`);
}
