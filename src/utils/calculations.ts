/**
 * RetireOnSol - Core Calculation Engine
 *
 * Model: You DCA dollars into SOL over time. SOL price grows based on selected model.
 *
 * - You invest $X per period (weekly/monthly)
 * - SOL price grows based on selected growth model
 * - Your bag (in SOL) grows from purchases
 * - Your bag value (in USD) grows from both purchases AND price appreciation
 */

import {
  calculateFuturePrice,
  type GrowthModel,
  type GrowthModelParams,
} from './growthModels';

export interface ProjectionInput {
  currentSOL: number;
  currentPrice: number;
  years: number;
  dcaAmountUSD: number;
  dcaFrequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
  growthModel: GrowthModel;
  modelParams: GrowthModelParams;
  jitoSOLEnabled?: boolean;
  jitoSOLAPR?: number; // e.g. 0.075 for 7.5%
}

export interface YearlyProjection {
  year: number;
  solBalance: number;
  solPrice: number;
  portfolioValueUSD: number;
  totalInvestedUSD: number;
  gainUSD: number;
}

export interface ProjectionResult {
  projections: YearlyProjection[];
  finalSOL: number;
  finalPrice: number;
  finalValueUSD: number;
  totalInvestedUSD: number;
  totalGainUSD: number;
  initialValueUSD: number;
}

/**
 * Get number of DCA contributions per year based on frequency
 */
function getContributionsPerYear(frequency: 'daily' | 'weekly' | 'monthly' | 'yearly'): number {
  switch (frequency) {
    case 'daily': return 365;
    case 'weekly': return 52;
    case 'monthly': return 12;
    case 'yearly': return 1;
  }
}

/**
 * Calculate projected portfolio over time using selected growth model
 */
export function calculateProjection(input: ProjectionInput): ProjectionResult {
  const {
    currentSOL,
    currentPrice,
    years,
    dcaAmountUSD,
    dcaFrequency,
    growthModel,
    modelParams,
    jitoSOLEnabled = false,
    jitoSOLAPR = 0.075,
  } = input;

  const contributionsPerYear = getContributionsPerYear(dcaFrequency);
  const annualInvestmentUSD = dcaAmountUSD * contributionsPerYear;

  const projections: YearlyProjection[] = [];

  let solBalance = currentSOL;
  let totalInvestedUSD = currentSOL * currentPrice;
  const initialValueUSD = totalInvestedUSD;

  for (let year = 1; year <= years; year++) {
    // Get prices from the growth model
    const startPrice = year === 1
      ? currentPrice
      : calculateFuturePrice(currentPrice, year - 1, growthModel, modelParams);
    const endPrice = calculateFuturePrice(currentPrice, year, growthModel, modelParams);

    // Average price during the year (for DCA purchases)
    const avgPrice = (startPrice + endPrice) / 2;

    // SOL purchased this year via DCA
    const solPurchased = avgPrice > 0 ? annualInvestmentUSD / avgPrice : 0;

    // Update balances
    solBalance += solPurchased;

    // JitoSOL staking yield: compound SOL balance with APR
    if (jitoSOLEnabled && jitoSOLAPR > 0) {
      solBalance *= (1 + jitoSOLAPR);
    }

    totalInvestedUSD += annualInvestmentUSD;

    const portfolioValueUSD = solBalance * endPrice;
    const gainUSD = portfolioValueUSD - totalInvestedUSD;

    projections.push({
      year,
      solBalance: Math.round(solBalance * 100) / 100,
      solPrice: Math.round(endPrice * 100) / 100,
      portfolioValueUSD: Math.round(portfolioValueUSD),
      totalInvestedUSD: Math.round(totalInvestedUSD),
      gainUSD: Math.round(gainUSD),
    });
  }

  // Handle edge case where projections is empty (years < 1)
  if (projections.length === 0) {
    const portfolioValueUSD = solBalance * currentPrice;
    return {
      projections: [{
        year: 0,
        solBalance: Math.round(solBalance * 100) / 100,
        solPrice: Math.round(currentPrice * 100) / 100,
        portfolioValueUSD: Math.round(portfolioValueUSD),
        totalInvestedUSD: Math.round(totalInvestedUSD),
        gainUSD: 0,
      }],
      finalSOL: solBalance,
      finalPrice: currentPrice,
      finalValueUSD: portfolioValueUSD,
      totalInvestedUSD,
      totalGainUSD: 0,
      initialValueUSD,
    };
  }

  const final = projections[projections.length - 1];

  return {
    projections,
    finalSOL: final.solBalance,
    finalPrice: final.solPrice,
    finalValueUSD: final.portfolioValueUSD,
    totalInvestedUSD: final.totalInvestedUSD,
    totalGainUSD: final.gainUSD,
    initialValueUSD,
  };
}

/**
 * Format USD for display
 */
export function formatUSD(amount: number): string {
  if (amount >= 1000000) {
    return `$${(amount / 1000000).toFixed(2)}M`;
  }
  if (amount >= 1000) {
    return `$${(amount / 1000).toFixed(1)}K`;
  }
  return `$${amount.toFixed(0)}`;
}

/**
 * Format SOL for display
 */
export function formatSOL(amount: number): string {
  if (amount >= 1000000) {
    return `${(amount / 1000000).toFixed(2)}M`;
  }
  if (amount >= 1000) {
    return `${(amount / 1000).toFixed(2)}K`;
  }
  return amount.toFixed(2);
}

// Re-export growth model types for convenience
export type { GrowthModel, GrowthModelParams } from './growthModels';
