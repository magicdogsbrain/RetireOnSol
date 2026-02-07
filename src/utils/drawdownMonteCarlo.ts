/**
 * Monte Carlo simulation for retirement drawdown phase.
 * Simulates portfolio depletion with monthly withdrawals and price volatility.
 */

export interface DrawdownInput {
  startingSOL: number;           // SOL balance at retirement
  startingPrice: number;         // Expected SOL price at retirement
  monthlyIncomeToday: number;    // Monthly income in today's dollars
  retirementYears: number;       // How long retirement should last
  volatility: number;            // Annual price volatility (e.g., 0.25 = 25%)
  realGrowthRate: number;        // Expected real return above inflation (e.g., 0.08 = 8%)
  simulations: number;           // Number of Monte Carlo simulations
  inflationRate: number;         // Annual inflation rate for income adjustment
}

export interface SimulationPath {
  id: number;
  months: number[];              // Month numbers
  portfolioValue: number[];      // USD value at each month
  solBalance: number[];          // SOL balance at each month
  solPrice: number[];            // SOL price at each month
  failed: boolean;               // Did the portfolio run out?
  failureMonth: number | null;   // Month when it failed (if applicable)
}

export interface DrawdownResult {
  successRate: number;           // Percentage of simulations that didn't run out
  medianEndingValue: number;     // Median final portfolio value (successful paths)
  percentiles: {
    month: number;
    p10: number;
    p50: number;
    p90: number;
  }[];
  failedPaths: SimulationPath[]; // Sample of failed simulation paths for visualization
  successfulPaths: SimulationPath[]; // Sample of successful paths
  allPaths: SimulationPath[];    // All simulation paths (for detailed analysis)
  medianFailureMonth: number | null; // Median month of failure (for failed paths)
}

/**
 * Run Monte Carlo simulation for drawdown phase.
 * Uses geometric Brownian motion for price simulation.
 */
export function runDrawdownSimulation(input: DrawdownInput): DrawdownResult {
  const {
    startingSOL,
    startingPrice,
    monthlyIncomeToday,
    retirementYears,
    volatility,
    realGrowthRate,
    simulations,
    inflationRate,
  } = input;

  const totalMonths = retirementYears * 12;
  const monthlyVol = volatility / Math.sqrt(12); // Convert annual to monthly volatility
  const monthlyInflation = Math.pow(1 + inflationRate, 1/12) - 1;
  const monthlyRealGrowth = Math.pow(1 + realGrowthRate, 1/12) - 1;

  // Drift = inflation + real growth
  // If realGrowthRate is 0, price only keeps pace with inflation (conservative)
  // If realGrowthRate is 8%, price grows 8% above inflation (expected stock-like returns)
  const monthlyDrift = monthlyInflation + monthlyRealGrowth;

  const allPaths: SimulationPath[] = [];
  let successCount = 0;
  const failureMonths: number[] = [];
  const endingValues: number[] = [];

  // Run simulations
  for (let sim = 0; sim < simulations; sim++) {
    const path: SimulationPath = {
      id: sim,
      months: [],
      portfolioValue: [],
      solBalance: [],
      solPrice: [],
      failed: false,
      failureMonth: null,
    };

    let currentSOL = startingSOL;
    let currentPrice = startingPrice;
    let currentMonthlyIncome = monthlyIncomeToday;

    for (let month = 0; month <= totalMonths; month++) {
      // Record state at start of month
      path.months.push(month);
      path.solBalance.push(currentSOL);
      path.solPrice.push(currentPrice);
      path.portfolioValue.push(currentSOL * currentPrice);

      // If portfolio is depleted, mark as failed
      if (currentSOL <= 0) {
        path.failed = true;
        path.failureMonth = month;
        // Fill remaining months with zeros
        for (let m = month + 1; m <= totalMonths; m++) {
          path.months.push(m);
          path.solBalance.push(0);
          path.solPrice.push(currentPrice);
          path.portfolioValue.push(0);
        }
        break;
      }

      // If we've reached the end, don't process withdrawal
      if (month === totalMonths) break;

      // Calculate withdrawal in SOL
      const withdrawalSOL = currentMonthlyIncome / currentPrice;

      // Withdraw (can't withdraw more than we have)
      if (withdrawalSOL >= currentSOL) {
        // Portfolio depleted
        currentSOL = 0;
      } else {
        currentSOL -= withdrawalSOL;
      }

      // Simulate price change for next month using GBM
      // dS = S * (mu*dt + sigma*dW)
      const randomShock = gaussianRandom();
      const priceMultiplier = Math.exp(
        (monthlyDrift - 0.5 * monthlyVol * monthlyVol) + monthlyVol * randomShock
      );
      currentPrice = currentPrice * priceMultiplier;

      // Increase income requirement by inflation
      currentMonthlyIncome *= (1 + monthlyInflation);
    }

    allPaths.push(path);

    if (path.failed) {
      failureMonths.push(path.failureMonth!);
    } else {
      successCount++;
      endingValues.push(path.portfolioValue[path.portfolioValue.length - 1]);
    }
  }

  // Calculate success rate
  const successRate = successCount / simulations;

  // Calculate percentiles at each month
  const percentiles: DrawdownResult['percentiles'] = [];
  for (let month = 0; month <= totalMonths; month++) {
    const valuesAtMonth = allPaths.map(p => p.portfolioValue[month]).sort((a, b) => a - b);
    percentiles.push({
      month,
      p10: valuesAtMonth[Math.floor(simulations * 0.1)],
      p50: valuesAtMonth[Math.floor(simulations * 0.5)],
      p90: valuesAtMonth[Math.floor(simulations * 0.9)],
    });
  }

  // Calculate median ending value (only for successful paths)
  const medianEndingValue = endingValues.length > 0
    ? endingValues.sort((a, b) => a - b)[Math.floor(endingValues.length / 2)]
    : 0;

  // Calculate median failure month
  const medianFailureMonth = failureMonths.length > 0
    ? failureMonths.sort((a, b) => a - b)[Math.floor(failureMonths.length / 2)]
    : null;

  // Sample paths for visualization (up to 10 failed, 10 successful)
  const failedPaths = allPaths.filter(p => p.failed).slice(0, 10);
  const successfulPaths = allPaths.filter(p => !p.failed).slice(0, 10);

  return {
    successRate,
    medianEndingValue,
    percentiles,
    failedPaths,
    successfulPaths,
    allPaths,
    medianFailureMonth,
  };
}

/**
 * Generate a random number from standard normal distribution
 * using Box-Muller transform.
 */
function gaussianRandom(): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

/**
 * Format month number as "Year X, Month Y" or "X years, Y months"
 */
export function formatMonth(month: number): string {
  const years = Math.floor(month / 12);
  const months = month % 12;

  if (years === 0) {
    return `${months} month${months !== 1 ? 's' : ''}`;
  } else if (months === 0) {
    return `${years} year${years !== 1 ? 's' : ''}`;
  } else {
    return `${years}y ${months}m`;
  }
}
