/**
 * Monte Carlo Simulation for Portfolio Projections
 *
 * Adds randomness around the deterministic growth models to show
 * the range of possible outcomes given price volatility.
 *
 * Key concepts:
 * - Base model gives expected price path
 * - Log-normal noise added around expected price each year
 * - Multiple simulations run to get distribution of outcomes
 * - Percentiles extracted for visualization (10th, 50th, 90th)
 */

import {
  calculateFuturePrice,
  type GrowthModel,
  type GrowthModelParams,
} from './growthModels';

export type VolatilityDecayType = 'none' | 'auto';

export interface MonteCarloParams {
  enabled: boolean;
  volatility: number; // Annual volatility as decimal (0.8 = 80%)
  volatilityDecay: VolatilityDecayType; // How volatility decays over time
  simulations: number; // Number of simulation runs
}

export interface MonteCarloResult {
  // Year-by-year percentiles for portfolio value
  percentiles: {
    year: number;
    p10: number; // 10th percentile (pessimistic)
    p50: number; // 50th percentile (median)
    p90: number; // 90th percentile (optimistic)
    mean: number; // Average
  }[];
  // Final year summary
  finalP10: number;
  finalP50: number;
  finalP90: number;
  finalMean: number;
  // SOL balance percentiles at end
  finalSolP10: number;
  finalSolP50: number;
  finalSolP90: number;
}

/**
 * Box-Muller transform to generate normal random numbers
 * Returns a random number from standard normal distribution (mean=0, std=1)
 */
function randomNormal(): number {
  let u1 = 0, u2 = 0;
  // Avoid log(0)
  while (u1 === 0) u1 = Math.random();
  while (u2 === 0) u2 = Math.random();
  return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
}

/**
 * Volatility decay floor - minimum volatility for mature assets
 * 25% is typical for mature tech stocks / established crypto
 */
const VOLATILITY_FLOOR = 0.25;

/**
 * Volatility decay schedule (5-year blocks)
 *
 * Models how an asset matures over time:
 * - Early years: High volatility decay as asset stabilizes
 * - Middle years: Moderate decay as market matures
 * - Later years: Slow decay approaching mature asset levels
 *
 * Calibrated to produce reasonable long-term projections:
 * - Starting 80% volatility decays to ~60% by year 5
 * - By year 10: ~45% volatility
 * - By year 25: ~30% volatility (approaching mature asset floor of 25%)
 */
const VOLATILITY_DECAY_SCHEDULE = [
  { startYear: 1, decayRate: 0.05 },   // Years 1-5: 5%/yr decay (young asset stabilizing)
  { startYear: 6, decayRate: 0.04 },   // Years 6-10: 4%/yr decay (maturing)
  { startYear: 11, decayRate: 0.025 }, // Years 11-15: 2.5%/yr decay
  { startYear: 16, decayRate: 0.015 }, // Years 16-20: 1.5%/yr decay
  { startYear: 21, decayRate: 0.01 },  // Years 21-25: 1%/yr decay (established)
  { startYear: 26, decayRate: 0.005 }, // Years 26+: 0.5%/yr decay (mature)
];

/**
 * Get the volatility decay rate for a specific year based on the decay schedule
 */
function getVolatilityDecayRate(year: number): number {
  for (let i = VOLATILITY_DECAY_SCHEDULE.length - 1; i >= 0; i--) {
    if (year >= VOLATILITY_DECAY_SCHEDULE[i].startYear) {
      return VOLATILITY_DECAY_SCHEDULE[i].decayRate;
    }
  }
  return VOLATILITY_DECAY_SCHEDULE[0].decayRate;
}

/**
 * Calculate volatility for a specific year with optional decay
 */
function getVolatilityForYear(
  baseVolatility: number,
  year: number,
  decayType: VolatilityDecayType
): number {
  if (decayType === 'none') {
    return baseVolatility;
  }

  // Auto decay: apply year-specific decay rates
  let currentVolatility = baseVolatility;

  for (let y = 1; y <= year; y++) {
    const decayRate = getVolatilityDecayRate(y);
    currentVolatility = Math.max(VOLATILITY_FLOOR, currentVolatility * (1 - decayRate));
  }

  return currentVolatility;
}

/**
 * Generate a random price path with volatility around the expected model path
 *
 * Uses geometric Brownian motion concept:
 * - Expected price comes from growth model
 * - Actual price = expected × e^(σ × Z) where Z is standard normal
 *
 * This preserves the expected value while adding realistic volatility
 * Volatility can optionally decay over time as the asset matures
 */
function generatePricePath(
  currentPrice: number,
  years: number,
  model: GrowthModel,
  modelParams: GrowthModelParams,
  baseVolatility: number,
  volatilityDecay: VolatilityDecayType
): number[] {
  const prices: number[] = [];

  for (let year = 1; year <= years; year++) {
    // Get expected price from deterministic model
    const expectedPrice = calculateFuturePrice(currentPrice, year, model, modelParams);

    // Get volatility for this year (may decay over time)
    const volatility = getVolatilityForYear(baseVolatility, year, volatilityDecay);

    // Add log-normal noise
    // The adjustment -0.5*σ² ensures the expected value is preserved
    const z = randomNormal();
    const logNoise = volatility * z - 0.5 * volatility * volatility;
    const actualPrice = expectedPrice * Math.exp(logNoise);

    prices.push(Math.max(0.01, actualPrice)); // Floor at $0.01
  }

  return prices;
}

/**
 * Run a single Monte Carlo simulation of the accumulation phase
 * Returns final portfolio value and SOL balance
 */
function runSingleSimulation(
  currentSOL: number,
  currentPrice: number,
  years: number,
  dcaAmountUSD: number,
  dcaFrequency: 'daily' | 'weekly' | 'monthly' | 'yearly',
  model: GrowthModel,
  modelParams: GrowthModelParams,
  volatility: number,
  volatilityDecay: VolatilityDecayType,
  jitoSOLEnabled: boolean = false,
  jitoSOLAPR: number = 0.075
): { yearlyValues: number[]; yearlySol: number[]; finalValue: number; finalSol: number } {
  // Generate random price path
  const pricePath = generatePricePath(currentPrice, years, model, modelParams, volatility, volatilityDecay);

  // Calculate contributions per year
  const contributionsPerYear = {
    daily: 365,
    weekly: 52,
    monthly: 12,
    yearly: 1,
  }[dcaFrequency];
  const annualInvestmentUSD = dcaAmountUSD * contributionsPerYear;

  // Track SOL balance and portfolio value year by year
  let solBalance = currentSOL;
  const yearlyValues: number[] = [];
  const yearlySol: number[] = [];

  for (let year = 0; year < years; year++) {
    const startPrice = year === 0 ? currentPrice : pricePath[year - 1];
    const endPrice = pricePath[year];

    // Average price during the year for DCA purchases
    const avgPrice = (startPrice + endPrice) / 2;

    // SOL purchased this year
    const solPurchased = avgPrice > 0 ? annualInvestmentUSD / avgPrice : 0;
    solBalance += solPurchased;

    // JitoSOL staking yield
    if (jitoSOLEnabled && jitoSOLAPR > 0) {
      solBalance *= (1 + jitoSOLAPR);
    }

    // Portfolio value at end of year
    const portfolioValue = solBalance * endPrice;
    yearlyValues.push(portfolioValue);
    yearlySol.push(solBalance);
  }

  return {
    yearlyValues,
    yearlySol,
    finalValue: yearlyValues[yearlyValues.length - 1],
    finalSol: yearlySol[yearlySol.length - 1],
  };
}

/**
 * Calculate percentile from sorted array
 */
function percentile(sortedArr: number[], p: number): number {
  const index = (p / 100) * (sortedArr.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sortedArr[lower];
  return sortedArr[lower] + (sortedArr[upper] - sortedArr[lower]) * (index - lower);
}

/**
 * Run Monte Carlo simulation for accumulation phase
 */
export function runMonteCarloSimulation(
  currentSOL: number,
  currentPrice: number,
  years: number,
  dcaAmountUSD: number,
  dcaFrequency: 'daily' | 'weekly' | 'monthly' | 'yearly',
  model: GrowthModel,
  modelParams: GrowthModelParams,
  mcParams: MonteCarloParams,
  jitoSOLEnabled: boolean = false,
  jitoSOLAPR: number = 0.075
): MonteCarloResult {
  const { volatility, volatilityDecay, simulations } = mcParams;

  // Run all simulations
  const allYearlyValues: number[][] = [];
  const allYearlySol: number[][] = [];
  const finalValues: number[] = [];
  const finalSols: number[] = [];

  for (let sim = 0; sim < simulations; sim++) {
    const result = runSingleSimulation(
      currentSOL,
      currentPrice,
      years,
      dcaAmountUSD,
      dcaFrequency,
      model,
      modelParams,
      volatility,
      volatilityDecay,
      jitoSOLEnabled,
      jitoSOLAPR
    );
    allYearlyValues.push(result.yearlyValues);
    allYearlySol.push(result.yearlySol);
    finalValues.push(result.finalValue);
    finalSols.push(result.finalSol);
  }

  // Calculate percentiles for each year
  const percentiles: MonteCarloResult['percentiles'] = [];

  for (let year = 0; year < years; year++) {
    const valuesAtYear = allYearlyValues.map(sim => sim[year]).sort((a, b) => a - b);
    const mean = valuesAtYear.reduce((a, b) => a + b, 0) / valuesAtYear.length;

    percentiles.push({
      year: year + 1,
      p10: percentile(valuesAtYear, 10),
      p50: percentile(valuesAtYear, 50),
      p90: percentile(valuesAtYear, 90),
      mean,
    });
  }

  // Sort final values for percentile calculation
  const sortedFinalValues = [...finalValues].sort((a, b) => a - b);
  const sortedFinalSols = [...finalSols].sort((a, b) => a - b);

  return {
    percentiles,
    finalP10: percentile(sortedFinalValues, 10),
    finalP50: percentile(sortedFinalValues, 50),
    finalP90: percentile(sortedFinalValues, 90),
    finalMean: finalValues.reduce((a, b) => a + b, 0) / finalValues.length,
    finalSolP10: percentile(sortedFinalSols, 10),
    finalSolP50: percentile(sortedFinalSols, 50),
    finalSolP90: percentile(sortedFinalSols, 90),
  };
}

/**
 * Default Monte Carlo parameters
 */
export const DEFAULT_MONTE_CARLO_PARAMS: MonteCarloParams = {
  enabled: false,
  volatility: 0.8, // 80% annual volatility (typical for SOL)
  volatilityDecay: 'auto', // Realistic decay as asset matures
  simulations: 500, // Balance between accuracy and performance
};
