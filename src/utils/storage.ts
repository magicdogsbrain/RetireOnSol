/**
 * localStorage utilities for persisting app settings
 */

const STORAGE_KEY = 'retireonsol_settings';

export interface StoredSettings {
  // Grow tab
  currentSOL: number;
  currentJitoSOL: number;
  years: number;
  dcaAmountUSD: number;
  dcaMaxLimit: number;
  dcaFrequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
  growthModel: 'cagr' | 'powerlaw' | 'scurve';
  modelParams: {
    cagr?: number;
    cagrDecay?: 'none' | 'auto';
    powerLawSlope?: number;
    sCurveYearsToHalfRemaining?: number;
  };
  // Inflation
  inflationEnabled: boolean;
  inflationType: 'linear' | 'cyclical';
  inflationRate: number;
  inflationAmplitude: number;
  inflationCyclePeriod: number;
  debasementRate: number;
  // JitoSOL
  jitoSOLEnabled: boolean;
  jitoSOLAPR: number;
  // Monte Carlo
  mcEnabled: boolean;
  mcVolatility: number;
  mcVolatilityDecay: 'none' | 'auto';
  mcSimulations: number;
  // Spend tab
  spendMonthlyIncome: number;
  spendMonthlyIncomeMax: number;
  spendRetirementYears: number;
  spendVolatility: number;
  spendRealGrowthRate: number;
  spendInflationRate: number;
  spendSimulations: number;
}

export const DEFAULT_SETTINGS: StoredSettings = {
  currentSOL: 0,
  currentJitoSOL: 0,
  years: 30,
  dcaAmountUSD: 200,
  dcaMaxLimit: 1000,
  dcaFrequency: 'weekly',
  growthModel: 'cagr',
  modelParams: {
    cagr: 0.25,
    cagrDecay: 'auto',
    powerLawSlope: 1.6,
    sCurveYearsToHalfRemaining: 12,
  },
  jitoSOLEnabled: false,
  jitoSOLAPR: 0.075,
  inflationEnabled: true,
  inflationType: 'linear',
  inflationRate: 0.035,
  inflationAmplitude: 0.02,
  inflationCyclePeriod: 7,
  debasementRate: 0,
  mcEnabled: true,
  mcVolatility: 0.8,
  mcVolatilityDecay: 'auto',
  mcSimulations: 500,
  spendMonthlyIncome: 5000,
  spendMonthlyIncomeMax: 20000,
  spendRetirementYears: 35,
  spendVolatility: 0.25,       // 25% - typical mature asset volatility
  spendRealGrowthRate: 0.08,  // 8% - stock-like real returns
  spendInflationRate: 0.035,
  spendSimulations: 500,
};

/**
 * Load settings from localStorage
 */
export function loadSettings(): Partial<StoredSettings> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (err) {
    console.warn('Failed to load settings from localStorage:', err);
  }
  return {};
}

/**
 * Save settings to localStorage
 */
export function saveSettings(settings: Partial<StoredSettings>): void {
  try {
    const existing = loadSettings();
    const merged = { ...existing, ...settings };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  } catch (err) {
    console.warn('Failed to save settings to localStorage:', err);
  }
}

/**
 * Clear all saved settings
 */
export function clearSettings(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.warn('Failed to clear settings from localStorage:', err);
  }
}

/**
 * Active Plan - snapshot of settings when user clicks "Execute Plan"
 */
const ACTIVE_PLAN_KEY = 'retireonsol_active_plan';

export interface ActivePlan {
  activatedAt: string; // ISO date
  settings: StoredSettings; // snapshot of all settings at time of execution
  startPhase?: 'accum' | 'decum'; // which phase the plan started in
}

/**
 * Save the active plan to localStorage
 */
export function saveActivePlan(plan: ActivePlan): void {
  try {
    localStorage.setItem(ACTIVE_PLAN_KEY, JSON.stringify(plan));
  } catch (err) {
    console.warn('Failed to save active plan to localStorage:', err);
  }
}

/**
 * Load the active plan from localStorage
 */
export function loadActivePlan(): ActivePlan | null {
  try {
    const stored = localStorage.getItem(ACTIVE_PLAN_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (err) {
    console.warn('Failed to load active plan from localStorage:', err);
  }
  return null;
}

/**
 * Clear the active plan from localStorage
 */
export function clearActivePlan(): void {
  try {
    localStorage.removeItem(ACTIVE_PLAN_KEY);
  } catch (err) {
    console.warn('Failed to clear active plan from localStorage:', err);
  }
}
