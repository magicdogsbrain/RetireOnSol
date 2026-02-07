/**
 * Inflation & Debasement Utilities
 *
 * Converts nominal future dollars to "today's dollars" purchasing power.
 *
 * Sources:
 * - BIS research: inflation cycles average 6-7 years
 * - US historical average: ~3.5% inflation
 * - M2 money supply growth: ~7% long-term average
 */

export type InflationType = 'linear' | 'cyclical';

export interface InflationParams {
  enabled: boolean;
  type: InflationType;
  rate: number;           // Base/average inflation rate (e.g., 0.035 = 3.5%)
  amplitude: number;      // For cyclical: swing amount (e.g., 0.02 = ±2%)
  cyclePeriod: number;    // For cyclical: years per cycle (e.g., 7)
  debasementRate: number; // M2 growth rate (e.g., 0.07 = 7%)
}

/**
 * Calculate inflation rate for a specific year using cyclical model
 *
 * Uses sine wave: rate(t) = baseRate + amplitude * sin(2π * t / period)
 */
function getCyclicalInflationRate(
  year: number,
  baseRate: number,
  amplitude: number,
  cyclePeriod: number
): number {
  const cyclePosition = (2 * Math.PI * year) / cyclePeriod;
  return baseRate + amplitude * Math.sin(cyclePosition);
}

/**
 * Calculate cumulative inflation factor over N years
 * Returns the multiplier to convert future dollars to today's dollars
 *
 * Example: if cumulative factor is 2.0, then $100 in the future = $50 today
 */
export function getCumulativeInflationFactor(
  years: number,
  params: InflationParams
): number {
  if (!params.enabled) {
    return 1; // No adjustment
  }

  let factor = 1;

  for (let year = 1; year <= years; year++) {
    let yearlyInflation: number;

    if (params.type === 'linear') {
      yearlyInflation = params.rate;
    } else {
      yearlyInflation = getCyclicalInflationRate(
        year,
        params.rate,
        params.amplitude,
        params.cyclePeriod
      );
    }

    // Ensure inflation doesn't go negative (deflation floor at 0%)
    yearlyInflation = Math.max(0, yearlyInflation);

    factor *= (1 + yearlyInflation);
  }

  return factor;
}

/**
 * Calculate cumulative debasement factor over N years
 * This represents loss of purchasing power vs hard assets (property, gold, etc.)
 */
export function getCumulativeDebasementFactor(
  years: number,
  debasementRate: number,
  enabled: boolean
): number {
  if (!enabled || debasementRate === 0) {
    return 1;
  }

  return Math.pow(1 + debasementRate, years);
}

/**
 * Convert nominal future value to today's purchasing power
 */
export function toTodaysDollars(
  nominalValue: number,
  years: number,
  params: InflationParams
): number {
  const inflationFactor = getCumulativeInflationFactor(years, params);
  return nominalValue / inflationFactor;
}

/**
 * Convert nominal future value to hard asset equivalent
 * (accounts for both inflation and debasement)
 */
export function toHardAssetValue(
  nominalValue: number,
  years: number,
  params: InflationParams
): number {
  const debasementFactor = getCumulativeDebasementFactor(years, params.debasementRate, params.enabled);
  // Use debasement factor for hard asset comparison
  return nominalValue / debasementFactor;
}

/**
 * Get year-by-year inflation rates for display/charting
 */
export function getYearlyInflationRates(
  years: number,
  params: InflationParams
): number[] {
  const rates: number[] = [];

  for (let year = 1; year <= years; year++) {
    if (params.type === 'linear') {
      rates.push(params.rate);
    } else {
      rates.push(getCyclicalInflationRate(
        year,
        params.rate,
        params.amplitude,
        params.cyclePeriod
      ));
    }
  }

  return rates;
}
