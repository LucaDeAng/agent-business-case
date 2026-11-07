/**
 * Vendor-neutral business case model for AI customer-service agents.
 *
 * Pure functions only: no React, no DOM. Every number shown in the
 * calculator UI is derived here, so the model can be read, tested and
 * reused (e.g. in a case-study notebook) on its own.
 *
 * Core ideas the model encodes:
 * - Containment is not resolution: a share of "contained" contacts comes
 *   back as a repeat contact and lands on a human anyway.
 * - Containment ramps up over months; it is never day-one steady state.
 * - Per-minute pricing charges for every AI minute (including minutes spent
 *   before a handoff); per-resolution pricing charges only for contained
 *   contacts. Which one is cheaper depends on your containment rate.
 */

export type PricingModel = "perMinute" | "perResolution";

export interface Inputs {
  /** Inbound contacts per month (calls + chats in scope). */
  monthlyContacts: number;
  /** Average handle time of a human-handled contact, in minutes. */
  ahtMinutes: number;
  /** Fully loaded cost of one agent hour (salary, benefits, seat, supervision), €. */
  agentHourlyCost: number;
  /** Share of paid agent time spent actually handling contacts, 0-1. */
  occupancy: number;

  /** Containment at go-live, 0-1. */
  startContainment: number;
  /** Steady-state containment target, 0-1. */
  targetContainment: number;
  /** Months to go from start to target containment (linear ramp). */
  rampMonths: number;
  /** Share of contained contacts that recontact and reach a human, 0-1. */
  repeatRate: number;
  /** AHT reduction on escalated contacts thanks to context handoff, 0-1. */
  handoffAhtSaving: number;

  /** Average AI minutes on a contained contact. */
  aiMinutesContained: number;
  /** Average AI minutes before handing off an escalated contact. */
  aiMinutesEscalated: number;

  /** Vendor price per AI minute, €. */
  pricePerMinute: number;
  /** Vendor price per resolved (contained) contact, €. */
  pricePerResolution: number;
  /** Fixed platform/licence fee per month, €. */
  platformFeeMonthly: number;

  /** One-off implementation cost (integrations, design, testing), €. */
  implementationCost: number;
  /** Ongoing internal run cost per month (conversation designers, QA), €. */
  internalRunMonthly: number;

  /** Analysis horizon in months. */
  horizonMonths: number;
}

export interface MonthResult {
  month: number;
  containment: number;
  humanCost: number;
  aiUsageCost: number;
  fixedCost: number;
  totalCost: number;
  baselineCost: number;
  netBenefit: number;
  cumulativeNet: number;
}

export interface ModelResult {
  pricing: PricingModel;
  months: MonthResult[];
  /** First month where cumulative net benefit turns positive, or null. */
  paybackMonth: number | null;
  totalBaseline: number;
  totalCost: number;
  /** Net benefit over the horizon, after implementation cost. */
  totalNet: number;
  /** totalNet / (implementation + all AI-related spend). */
  roi: number;
  /** Monthly net benefit once ramp-up is complete. */
  steadyStateMonthlyNet: number;
}

export interface Summary {
  humanCostPerContact: number;
  /** AI cost (usage only) per truly resolved contact at steady state. */
  costPerResolution: Record<PricingModel, number>;
  /**
   * Containment rate at which the two pricing models cost the same.
   * Below it per-resolution is cheaper, above it per-minute is cheaper.
   * null if per-resolution is cheaper at every containment level.
   */
  pricingBreakEvenContainment: number | null;
  results: Record<PricingModel, ModelResult>;
}

export const DEFAULT_INPUTS: Inputs = {
  monthlyContacts: 100_000,
  ahtMinutes: 6,
  agentHourlyCost: 28,
  occupancy: 0.75,
  startContainment: 0.1,
  targetContainment: 0.35,
  rampMonths: 6,
  repeatRate: 0.1,
  handoffAhtSaving: 0.1,
  aiMinutesContained: 3.5,
  aiMinutesEscalated: 1.5,
  pricePerMinute: 0.12,
  pricePerResolution: 0.9,
  platformFeeMonthly: 5_000,
  implementationCost: 150_000,
  internalRunMonthly: 8_000,
  horizonMonths: 24,
};

export interface Preset {
  id: string;
  label: string;
  description: string;
  inputs: Partial<Inputs>;
}

export const PRESETS: Preset[] = [
  {
    id: "utility",
    label: "Utility · voice",
    description: "Billing, meter readings, outages. High volume, repetitive intents.",
    inputs: {
      monthlyContacts: 120_000,
      ahtMinutes: 6.5,
      targetContainment: 0.4,
      aiMinutesContained: 3.5,
    },
  },
  {
    id: "insurance",
    label: "Insurance · claims",
    description: "FNOL and claim status. Longer calls, more escalations, regulated.",
    inputs: {
      monthlyContacts: 40_000,
      ahtMinutes: 9,
      agentHourlyCost: 32,
      targetContainment: 0.25,
      repeatRate: 0.15,
      aiMinutesContained: 5,
      aiMinutesEscalated: 2.5,
      implementationCost: 220_000,
    },
  },
  {
    id: "retail",
    label: "E-commerce · chat",
    description: "Order tracking, returns. Short, highly automatable contacts.",
    inputs: {
      monthlyContacts: 80_000,
      ahtMinutes: 4,
      agentHourlyCost: 24,
      startContainment: 0.2,
      targetContainment: 0.55,
      rampMonths: 4,
      aiMinutesContained: 2,
      aiMinutesEscalated: 1,
      implementationCost: 90_000,
    },
  },
];

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

export function humanCostPerContact(i: Inputs): number {
  const occupancy = Math.max(0.05, i.occupancy);
  return (i.ahtMinutes / 60) * (i.agentHourlyCost / occupancy);
}

/** Containment in month m (1-based): equal steps from start (month 1) to target (month rampMonths). */
export function containmentAt(i: Inputs, month: number): number {
  const start = clamp01(i.startContainment);
  const target = clamp01(i.targetContainment);
  if (i.rampMonths <= 1 || month >= i.rampMonths) return target;
  const t = (month - 1) / (i.rampMonths - 1);
  return start + (target - start) * t;
}

/** AI usage cost for one month at containment c. */
export function aiUsageCost(i: Inputs, c: number, pricing: PricingModel): number {
  const v = i.monthlyContacts;
  if (pricing === "perResolution") {
    return v * c * i.pricePerResolution;
  }
  const minutes = v * (c * i.aiMinutesContained + (1 - c) * i.aiMinutesEscalated);
  return minutes * i.pricePerMinute;
}

/** Human cost for one month at containment c. */
export function humanCostAt(i: Inputs, c: number): number {
  const v = i.monthlyContacts;
  const unit = humanCostPerContact(i);
  const escalated = v * (1 - c) * unit * (1 - clamp01(i.handoffAhtSaving));
  const repeats = v * c * clamp01(i.repeatRate) * unit;
  return escalated + repeats;
}

export function runModel(i: Inputs, pricing: PricingModel): ModelResult {
  const horizon = Math.max(1, Math.round(i.horizonMonths));
  const baselineCost = i.monthlyContacts * humanCostPerContact(i);
  const fixedCost = i.platformFeeMonthly + i.internalRunMonthly;

  let cumulative = -i.implementationCost;
  let paybackMonth: number | null = null;
  let aiSpend = i.implementationCost;
  const months: MonthResult[] = [];

  for (let m = 1; m <= horizon; m++) {
    const c = containmentAt(i, m);
    const humanCost = humanCostAt(i, c);
    const usage = aiUsageCost(i, c, pricing);
    const totalCost = humanCost + usage + fixedCost;
    const netBenefit = baselineCost - totalCost;
    cumulative += netBenefit;
    aiSpend += usage + fixedCost;
    if (paybackMonth === null && cumulative >= 0) paybackMonth = m;
    months.push({
      month: m,
      containment: c,
      humanCost,
      aiUsageCost: usage,
      fixedCost,
      totalCost,
      baselineCost,
      netBenefit,
      cumulativeNet: cumulative,
    });
  }

  const totalBaseline = baselineCost * horizon;
  const totalCost = months.reduce((s, r) => s + r.totalCost, 0) + i.implementationCost;
  const totalNet = totalBaseline - totalCost;
  const target = clamp01(i.targetContainment);
  const steadyStateMonthlyNet =
    baselineCost - (humanCostAt(i, target) + aiUsageCost(i, target, pricing) + fixedCost);

  return {
    pricing,
    months,
    paybackMonth,
    totalBaseline,
    totalCost,
    totalNet,
    roi: aiSpend > 0 ? totalNet / aiSpend : 0,
    steadyStateMonthlyNet,
  };
}

/**
 * Per-minute cost:     pMin * (c*dC + (1-c)*dE)
 * Per-resolution cost: pRes * c
 * Equal when c* = pMin*dE / (pRes + pMin*dE - pMin*dC).
 */
export function pricingBreakEven(i: Inputs): number | null {
  const pMin = i.pricePerMinute;
  const dC = i.aiMinutesContained;
  const dE = i.aiMinutesEscalated;
  const denom = i.pricePerResolution + pMin * dE - pMin * dC;
  if (denom <= 0) return null;
  const c = (pMin * dE) / denom;
  return c > 0 && c < 1 ? c : null;
}

export function summarize(i: Inputs): Summary {
  const target = clamp01(i.targetContainment);
  const resolved = i.monthlyContacts * target * (1 - clamp01(i.repeatRate));
  const perRes = (p: PricingModel) =>
    resolved > 0 ? aiUsageCost(i, target, p) / resolved : 0;

  return {
    humanCostPerContact: humanCostPerContact(i),
    costPerResolution: {
      perMinute: perRes("perMinute"),
      perResolution: perRes("perResolution"),
    },
    pricingBreakEvenContainment: pricingBreakEven(i),
    results: {
      perMinute: runModel(i, "perMinute"),
      perResolution: runModel(i, "perResolution"),
    },
  };
}

/** Steady-state net monthly benefit when one input is shifted, for sensitivity. */
export function sensitivity(
  i: Inputs,
  pricing: PricingModel,
  key: keyof Inputs,
  delta: number
): { low: number; high: number } {
  const shifted = (d: number) => {
    const next = { ...i, [key]: Math.max(0, (i[key] as number) + d) };
    return runModel(next, pricing).steadyStateMonthlyNet;
  };
  return { low: shifted(-delta), high: shifted(delta) };
}

// --- URL (de)serialisation, so a scenario can be shared as a link ---

const URL_KEYS: Record<keyof Inputs, string> = {
  monthlyContacts: "v",
  ahtMinutes: "aht",
  agentHourlyCost: "hc",
  occupancy: "occ",
  startContainment: "c0",
  targetContainment: "c1",
  rampMonths: "ramp",
  repeatRate: "rep",
  handoffAhtSaving: "hs",
  aiMinutesContained: "dc",
  aiMinutesEscalated: "de",
  pricePerMinute: "ppm",
  pricePerResolution: "ppr",
  platformFeeMonthly: "fee",
  implementationCost: "impl",
  internalRunMonthly: "run",
  horizonMonths: "h",
};

export function inputsToQuery(i: Inputs): string {
  const params = new URLSearchParams();
  (Object.keys(URL_KEYS) as (keyof Inputs)[]).forEach((k) => {
    if (i[k] !== DEFAULT_INPUTS[k]) params.set(URL_KEYS[k], String(i[k]));
  });
  return params.toString();
}

export function inputsFromQuery(search: string): Inputs {
  const params = new URLSearchParams(search);
  const out: Inputs = { ...DEFAULT_INPUTS };
  (Object.keys(URL_KEYS) as (keyof Inputs)[]).forEach((k) => {
    const raw = params.get(URL_KEYS[k]);
    if (raw === null) return;
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) out[k] = n;
  });
  return out;
}
