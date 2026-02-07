/**
 * Core retirement calculations for Basic Mode
 * Fixed realistic parameters with auto CAGR decay
 */

export interface RetirementInput {
  currentSOL: number;
  dcaMonthly: number; // USD per month
  years: number;
  withdrawalMonthly: number; // USD per month in retirement
  solPrice?: number; // Live SOL price (falls back to default if not provided)
}

export interface RetirementProjection {
  startValue: number; // USD
  endValue: number; // USD (median/P50 nominal)
  totalInvested: number; // USD
  monthlyIncome: number; // USD (in today's money)
  yearsOfIncome: number;
  p10: number; // Pessimistic case (nominal)
  p50: number; // Median case (nominal)
  p90: number; // Optimistic case (nominal)
  todaysP10: number; // Pessimistic in today's dollars
  todaysP50: number; // Median in today's dollars
  todaysP90: number; // Optimistic in today's dollars
  finalSOL: number;
  solPrice: number; // SOL price used for calculation
}

// FIXED PARAMETERS (hardcoded, no UI controls)
const DEFAULT_SOL_PRICE = 180; // Fallback if live price unavailable
const STARTING_SOL_GROWTH_RATE = 0.25; // 25% starting CAGR with auto decay
const INFLATION_RATE = 0.035; // 3.5% annual inflation (always on)
const VOLATILITY = 0.60; // 60% annualized vol for mature SOL

// CAGR floor - minimum growth rate
const CAGR_FLOOR = 0.03; // 3%

/**
 * Auto-decay rate schedule (5-year blocks)
 * 
 * Calibrated to produce reasonable long-term projections:
 * - Starting 25% CAGR decays to ~18% by year 5
 * - By year 10: ~14% CAGR
 * - By year 25: ~9% CAGR (still above 3% floor)
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
 * Calculate price with auto CAGR decay
 */
function calculatePriceWithDecay(startPrice: number, years: number): number {
  let price = startPrice;
  let currentCAGR = STARTING_SOL_GROWTH_RATE;

  for (let year = 1; year <= years; year++) {
    // Apply this year's growth
    price *= (1 + currentCAGR);

    // Get decay rate for this year's block
    const decayRate = getAutoDecayRate(year);

    // Exponential decay within the block
    currentCAGR = Math.max(CAGR_FLOOR, currentCAGR * (1 - decayRate));
  }

  return price;
}

export function calculateRetirement(input: RetirementInput): RetirementProjection {
  const { currentSOL, dcaMonthly, years, withdrawalMonthly, solPrice } = input;
  const currentSolPrice = solPrice || DEFAULT_SOL_PRICE;

  // Start value
  const startValue = currentSOL * currentSolPrice;
  
  // Total DCA contributions
  const totalDCA = dcaMonthly * 12 * years;
  const totalInvested = startValue + totalDCA;
  
  // Project SOL accumulation with DCA using auto decay
  let sol = currentSOL;
  let totalUSDInvested = startValue;
  
  for (let year = 0; year < years; year++) {
    // Get prices with decay
    const startYearPrice = year === 0 
      ? currentSolPrice 
      : calculatePriceWithDecay(currentSolPrice, year);
    const endYearPrice = calculatePriceWithDecay(currentSolPrice, year + 1);
    
    // Average price during the year for DCA
    const avgPrice = (startYearPrice + endYearPrice) / 2;
    
    // DCA additions (convert USD to SOL at average price throughout year)
    const yearlyDCA = dcaMonthly * 12;
    sol += yearlyDCA / avgPrice;
    totalUSDInvested += yearlyDCA;
  }
  
  const finalSOL = sol;
  const finalPrice = calculatePriceWithDecay(currentSolPrice, years);
  const endValue = finalSOL * finalPrice;
  
  // Apply inflation to withdrawal needs
  const inflationAdjustedWithdrawal = withdrawalMonthly * Math.pow(1 + INFLATION_RATE, years);
  const annualWithdrawal = inflationAdjustedWithdrawal * 12;
  const yearsOfIncome = endValue / annualWithdrawal;
  
  // Monte Carlo confidence intervals (lognormal distribution)
  const timeVolatility = VOLATILITY * Math.sqrt(years);

  const p10 = endValue * Math.exp(-1.28 * timeVolatility); // Pessimistic (10th percentile)
  const p50 = endValue; // Median (50th percentile)
  const p90 = endValue * Math.exp(1.28 * timeVolatility); // Optimistic (90th percentile)

  // Inflation-adjusted values (today's purchasing power)
  const inflationFactor = Math.pow(1 + INFLATION_RATE, years);
  const todaysP10 = p10 / inflationFactor;
  const todaysP50 = p50 / inflationFactor;
  const todaysP90 = p90 / inflationFactor;

  return {
    startValue,
    endValue: p50,
    totalInvested,
    monthlyIncome: withdrawalMonthly, // Always in today's money
    yearsOfIncome,
    p10,
    p50,
    p90,
    todaysP10,
    todaysP50,
    todaysP90,
    finalSOL,
    solPrice: currentSolPrice,
  };
}

export function formatUSD(value: number): string {
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(2)}M`;
  }
  if (value >= 1_000) {
    return `$${(value / 1_000).toFixed(1)}K`;
  }
  return `$${value.toFixed(0)}`;
}

export function formatSOL(value: number): string {
  return value.toFixed(2);
}
