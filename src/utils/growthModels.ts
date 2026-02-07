/**
 * Growth Models for SOL Price Projection
 *
 * Different models for projecting future SOL prices:
 * 1. CAGR - Simple compound annual growth rate
 * 2. Power Law - Based on Bitcoin's power law (log-log linear relationship with time)
 * 3. S-Curve - Technology adoption curve (logistic function)
 * 4. Rainbow - Logarithmic regression with bands (cycle-aware)
 */

export type GrowthModel = 'cagr' | 'powerlaw' | 'scurve';

export type CAGRDecayType = 'none' | 'auto';

export interface GrowthModelParams {
  // CAGR
  cagr?: number; // Annual growth rate as decimal (0.25 = 25%)
  cagrDecay?: CAGRDecayType; // How CAGR decays over time (none = constant, auto = realistic decay)

  // Power Law (SOL-specific absolute model)
  // Formula: log10(price) = -2.7 + slope * log10(days_since_genesis)
  powerLawSlope?: number; // Slope of log-log relationship (default 1.6 for SOL)

  // S-Curve
  sCurveYearsToHalfRemaining?: number; // Years until we capture 50% of remaining upside
  sCurveMaxPrice?: number; // Theoretical maximum price at full adoption (the ceiling)

}

// SOL genesis was March 16, 2020
const SOL_GENESIS_DATE = new Date('2020-03-16');

/**
 * SOL Power Law Coefficients (derived from historical regression)
 *
 * Formula: log₁₀(price) = intercept + slope × log₁₀(days_since_genesis)
 *
 * Based on key data points:
 * - May 2020 (day ~60): $0.50 (ATL)
 * - Dec 2020 (day ~290): $1.50
 * - Nov 2021 (day ~600): $250 (cycle peak)
 * - Dec 2022 (day ~1000): $9.50 (cycle bottom)
 * - Jan 2025 (day ~1750): $295 (new ATH)
 *
 * Default slope of 1.6 balances the volatile history.
 * Intercept of -2.7 calibrates to observed price levels.
 */
const SOL_POWER_LAW_INTERCEPT = -2.7;
const SOL_POWER_LAW_SLOPE_DEFAULT = 1.6;

/**
 * Get days since SOL genesis
 */
function daysSinceGenesis(date: Date = new Date()): number {
  return Math.floor((date.getTime() - SOL_GENESIS_DATE.getTime()) / (1000 * 60 * 60 * 24));
}

// CAGR floor - minimum growth rate (hardcoded, future settings page)
const CAGR_FLOOR = 0.03; // 3%

/**
 * Auto-decay rate schedule (5-year blocks)
 *
 * The decay rate itself decays over time, modeling how assets mature:
 * - Early years: Higher decay as asset is volatile
 * - Middle years: Maturing, decay rate slows
 * - Later years: Established asset, minimal decay
 *
 * Calibrated to produce reasonable long-term projections:
 * - Starting 25% CAGR decays to ~18% by year 5
 * - By year 10: ~14% CAGR
 * - By year 25: ~9% CAGR (still above 3% floor)
 *
 * This produces final values comparable to power law projections.
 */
const AUTO_DECAY_SCHEDULE = [
  { startYear: 1, decayRate: 0.06 },   // Years 1-5: 6%/yr decay (young asset)
  { startYear: 6, decayRate: 0.05 },   // Years 6-10: 5%/yr decay (maturing)
  { startYear: 11, decayRate: 0.03 },  // Years 11-15: 3%/yr decay
  { startYear: 16, decayRate: 0.02 },  // Years 16-20: 2%/yr decay
  { startYear: 21, decayRate: 0.015 }, // Years 21-25: 1.5%/yr decay (established)
  { startYear: 26, decayRate: 0.01 },  // Years 26+: 1%/yr decay (mature)
];

/**
 * Get the decay rate for a specific year based on the auto-decay schedule
 */
function getAutoDecayRate(year: number): number {
  for (let i = AUTO_DECAY_SCHEDULE.length - 1; i >= 0; i--) {
    if (year >= AUTO_DECAY_SCHEDULE[i].startYear) {
      return AUTO_DECAY_SCHEDULE[i].decayRate;
    }
  }
  return AUTO_DECAY_SCHEDULE[0].decayRate;
}

/**
 * CAGR Model - Compound growth with optional auto-decay
 *
 * Decay types:
 * - none: Constant CAGR forever (unrealistic but simple)
 * - auto: Realistic decay that adapts to time horizon
 *         Uses 5-year blocks with progressively slower decay
 *         Models asset maturation over full investment lifecycle
 *
 * All decay respects CAGR_FLOOR (3%)
 */
function cagrPrice(
  currentPrice: number,
  yearsFromNow: number,
  cagr: number,
  decayType: CAGRDecayType = 'none'
): number {
  if (decayType === 'none') {
    return currentPrice * Math.pow(1 + cagr, yearsFromNow);
  }

  // Auto decay: apply year-specific decay rates
  let price = currentPrice;
  let currentCAGR = cagr;

  for (let year = 1; year <= yearsFromNow; year++) {
    // Apply this year's growth
    price *= (1 + currentCAGR);

    // Get decay rate for this year's block
    const decayRate = getAutoDecayRate(year);

    // Exponential decay within the block
    currentCAGR = Math.max(CAGR_FLOOR, currentCAGR * (1 - decayRate));
  }

  return price;
}

/**
 * Power Law Model (SOL-specific, normalized to current price)
 *
 * Derives growth rates from the power law formula, then applies them
 * to the current market price. This preserves the decelerating growth
 * characteristic of power law while starting from your actual portfolio value.
 *
 * Key insight: power law growth decelerates over time (unlike constant CAGR).
 * The slope determines how fast prices grow on a log-log scale.
 *
 * @param currentPrice - Current SOL price (used as starting point)
 * @param yearsFromNow - Years to project forward
 * @param slope - Power law slope (default 1.6 for SOL)
 */
function powerLawPrice(currentPrice: number, yearsFromNow: number, slope: number = SOL_POWER_LAW_SLOPE_DEFAULT): number {
  const todayDays = daysSinceGenesis();
  const futureDays = todayDays + (yearsFromNow * 365);

  // Calculate power law fair values for today and future
  const todayFairValue = Math.pow(10, SOL_POWER_LAW_INTERCEPT + slope * Math.log10(todayDays));
  const futureFairValue = Math.pow(10, SOL_POWER_LAW_INTERCEPT + slope * Math.log10(futureDays));

  // Derive the growth multiplier from the power law
  const growthMultiplier = futureFairValue / todayFairValue;

  // Apply to current price (normalized approach)
  return currentPrice * growthMultiplier;
}

/**
 * Get power law fair value for a specific day count
 */
export function getPowerLawFairValue(daysFromGenesis: number, slope: number = SOL_POWER_LAW_SLOPE_DEFAULT): number {
  const logPrice = SOL_POWER_LAW_INTERCEPT + slope * Math.log10(daysFromGenesis);
  return Math.pow(10, logPrice);
}

/**
 * Get current power law fair value (today)
 */
export function getCurrentPowerLawFairValue(slope: number = SOL_POWER_LAW_SLOPE_DEFAULT): number {
  return getPowerLawFairValue(daysSinceGenesis(), slope);
}

/**
 * Get power law fair value at a future year
 * Useful for deriving asymptotic ceiling based on time horizon
 */
export function getFuturePowerLawFairValue(yearsFromNow: number, slope: number = SOL_POWER_LAW_SLOPE_DEFAULT): number {
  const futureDays = daysSinceGenesis() + (yearsFromNow * 365);
  return getPowerLawFairValue(futureDays, slope);
}

/**
 * S-Curve Model
 * Models technology adoption as exponential decay of remaining growth potential.
 *
 * - At year 0, price = currentPrice
 * - At year = yearsToHalfRemaining, price has captured 50% of remaining upside
 * - Curve approaches maxPrice asymptotically
 *
 * This formulation works correctly regardless of where currentPrice sits
 * relative to maxPrice (unlike the classic logistic which breaks when
 * currentPrice > maxPrice/2).
 *
 * @param currentPrice - Current SOL price
 * @param yearsFromNow - Years to project
 * @param yearsToHalfRemaining - Years until we capture 50% of remaining upside
 * @param maxPrice - Theoretical maximum price at full adoption (the ceiling)
 */
function sCurvePrice(
  currentPrice: number,
  yearsFromNow: number,
  yearsToHalfRemaining: number = 10,
  maxPrice: number = 50000
): number {
  // If current price is already at or above max, just return max
  if (currentPrice >= maxPrice) {
    return maxPrice;
  }

  const remainingGrowth = maxPrice - currentPrice;

  // Exponential decay of remaining growth potential
  // At t=0: price = currentPrice
  // At t=yearsToHalfRemaining: price = currentPrice + 0.5 * remainingGrowth
  // As t→∞: price → maxPrice
  //
  // remaining(t) = remainingGrowth * e^(-k*t)
  // At t=yearsToHalfRemaining: remaining = 0.5 * remainingGrowth
  // So: 0.5 = e^(-k * yearsToHalfRemaining)
  // k = ln(2) / yearsToHalfRemaining
  const k = Math.LN2 / yearsToHalfRemaining;
  const remainingAtT = remainingGrowth * Math.exp(-k * yearsFromNow);

  return maxPrice - remainingAtT;
}

/**
 * Main function to calculate price based on selected model
 */
export function calculateFuturePrice(
  currentPrice: number,
  yearsFromNow: number,
  model: GrowthModel,
  params: GrowthModelParams
): number {
  switch (model) {
    case 'cagr': {
      return cagrPrice(
        currentPrice,
        yearsFromNow,
        params.cagr || 0.25,
        params.cagrDecay || 'none'
      );
    }

    case 'powerlaw':
      return powerLawPrice(currentPrice, yearsFromNow, params.powerLawSlope || 1.6);

    case 'scurve':
      return sCurvePrice(
        currentPrice,
        yearsFromNow,
        params.sCurveYearsToHalfRemaining || 10,
        params.sCurveMaxPrice || 50000
      );

    default:
      return cagrPrice(currentPrice, yearsFromNow, 0.25);
  }
}

/**
 * Get year-by-year prices for a model
 */
export function getYearlyPrices(
  currentPrice: number,
  years: number,
  model: GrowthModel,
  params: GrowthModelParams
): number[] {
  const prices: number[] = [];

  for (let year = 1; year <= years; year++) {
    prices.push(calculateFuturePrice(currentPrice, year, model, params));
  }

  return prices;
}

/**
 * Get model description for UI
 */
export function getModelDescription(model: GrowthModel): string {
  switch (model) {
    case 'cagr':
      return 'Constant annual growth rate - simple but unrealistic for crypto';
    case 'powerlaw':
      return 'Log-linear growth over time - based on Bitcoin\'s historical pattern';
    case 'scurve':
      return 'Approaches max price asymptotically - fast early gains that slow over time';
    default:
      return '';
  }
}

/**
 * Get model display name
 */
export function getModelDisplayName(model: GrowthModel): string {
  switch (model) {
    case 'cagr':
      return 'CAGR';
    case 'powerlaw':
      return 'Power Law';
    case 'scurve':
      return 'Asymptotic';
    default:
      return model;
  }
}
