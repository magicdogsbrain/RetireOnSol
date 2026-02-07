import { useState, useEffect, useMemo } from 'react';
import { formatUSD, formatSOL } from '../utils/calculations';
import { runDrawdownSimulation, formatMonth, type DrawdownResult } from '../utils/drawdownMonteCarlo';
import { DrawdownChart } from './DrawdownChart';
import { shareDrawdown } from '../utils/shareDrawdown';
import { loadSettings, saveSettings, DEFAULT_SETTINGS } from '../utils/storage';

interface SpendTabProps {
  // Data from Grow tab
  startingSOL: number;        // Final SOL balance from accumulation
  startingPrice: number;      // Expected SOL price at retirement
  startingValueUSD: number;   // Portfolio value at retirement
  // Inherit settings from Grow tab
  defaultInflationRate: number;
  defaultVolatility: number;
  defaultSimulations: number;
  // Reset trigger - when this changes, reset to defaults
  resetKey?: number;
}

// Load initial spend settings
const initialSpendSettings = loadSettings();

export function SpendTab({
  startingSOL,
  startingPrice,
  startingValueUSD,
  defaultInflationRate,
  // defaultVolatility - now using storage defaults
  // defaultSimulations - now using storage defaults
  resetKey,
}: SpendTabProps) {
  // Spend settings (with localStorage defaults)
  const [monthlyIncome, setMonthlyIncome] = useState(initialSpendSettings.spendMonthlyIncome ?? DEFAULT_SETTINGS.spendMonthlyIncome);
  const [monthlyIncomeMax, setMonthlyIncomeMax] = useState(initialSpendSettings.spendMonthlyIncomeMax ?? DEFAULT_SETTINGS.spendMonthlyIncomeMax);
  const [retirementYears, setRetirementYears] = useState(initialSpendSettings.spendRetirementYears ?? DEFAULT_SETTINGS.spendRetirementYears);
  const [volatility, setVolatility] = useState(initialSpendSettings.spendVolatility ?? DEFAULT_SETTINGS.spendVolatility);
  const [realGrowthRate, setRealGrowthRate] = useState(initialSpendSettings.spendRealGrowthRate ?? DEFAULT_SETTINGS.spendRealGrowthRate);
  const [inflationRate, setInflationRate] = useState(initialSpendSettings.spendInflationRate ?? defaultInflationRate);
  const [simulations, setSimulations] = useState(initialSpendSettings.spendSimulations ?? DEFAULT_SETTINGS.spendSimulations);
  const [settingsExpanded, setSettingsExpanded] = useState(false);

  // Reset to defaults when resetKey changes (triggered by Reset All Settings button)
  useEffect(() => {
    if (resetKey !== undefined && resetKey > 0) {
      setMonthlyIncome(DEFAULT_SETTINGS.spendMonthlyIncome);
      setMonthlyIncomeMax(DEFAULT_SETTINGS.spendMonthlyIncomeMax);
      setRetirementYears(DEFAULT_SETTINGS.spendRetirementYears);
      setVolatility(DEFAULT_SETTINGS.spendVolatility);
      setRealGrowthRate(DEFAULT_SETTINGS.spendRealGrowthRate);
      setInflationRate(DEFAULT_SETTINGS.spendInflationRate);
      setSimulations(DEFAULT_SETTINGS.spendSimulations);
    }
  }, [resetKey]);

  // Save spend settings when they change
  useEffect(() => {
    saveSettings({
      spendMonthlyIncome: monthlyIncome,
      spendMonthlyIncomeMax: monthlyIncomeMax,
      spendRetirementYears: retirementYears,
      spendVolatility: volatility,
      spendRealGrowthRate: realGrowthRate,
      spendInflationRate: inflationRate,
      spendSimulations: simulations,
    });
  }, [monthlyIncome, monthlyIncomeMax, retirementYears, volatility, realGrowthRate, inflationRate, simulations]);

  // Simulation state
  const [isCalculating, setIsCalculating] = useState(false);
  const [drawdownResult, setDrawdownResult] = useState<DrawdownResult | null>(null);

  // Run simulation when inputs change
  useEffect(() => {
    if (startingSOL <= 0 || startingPrice <= 0) {
      setDrawdownResult(null);
      return;
    }

    setIsCalculating(true);

    const timeoutId = setTimeout(() => {
      const result = runDrawdownSimulation({
        startingSOL,
        startingPrice,
        monthlyIncomeToday: monthlyIncome,
        retirementYears,
        volatility,
        realGrowthRate,
        simulations,
        inflationRate,
      });
      setDrawdownResult(result);
      setIsCalculating(false);
    }, 50);

    return () => clearTimeout(timeoutId);
  }, [startingSOL, startingPrice, monthlyIncome, retirementYears, volatility, realGrowthRate, simulations, inflationRate]);

  // Calculate annual withdrawal rate (4% rule comparison)
  const annualWithdrawalRate = useMemo(() => {
    if (startingValueUSD <= 0) return 0;
    return (monthlyIncome * 12) / startingValueUSD;
  }, [monthlyIncome, startingValueUSD]);

  // Safe withdrawal rate adjusted for retirement duration
  // Shorter retirement = can withdraw more, longer = need to be more conservative
  // Base: 4% for 30 years, adjust proportionally
  const safeWithdrawalRate = useMemo(() => {
    // Simple adjustment: 4% is designed for ~30 years
    // Scale inversely with duration (longer = lower rate)
    const baseRate = 0.04;
    const baseYears = 30;
    // Use a dampened adjustment to avoid extreme values
    const adjustment = Math.sqrt(baseYears / retirementYears);
    return Math.min(0.08, Math.max(0.025, baseRate * adjustment));
  }, [retirementYears]);

  // Safe withdrawal suggestion based on adjusted rate
  const safeMonthlyWithdrawal = useMemo(() => {
    return Math.round(startingValueUSD * safeWithdrawalRate / 12);
  }, [startingValueUSD, safeWithdrawalRate]);

  return (
    <>
      <section className="input-section">
        <h2>Portfolio at Retirement</h2>
        <div className="spend-portfolio-summary">
          <div className="portfolio-stat">
            <span className="stat-label">Portfolio Value</span>
            <span className="stat-value highlight">{formatUSD(startingValueUSD)}</span>
          </div>
          <div className="portfolio-stat">
            <span className="stat-label">SOL Balance</span>
            <span className="stat-value">{formatSOL(startingSOL)} SOL</span>
          </div>
          <div className="portfolio-stat">
            <span className="stat-label">SOL Price</span>
            <span className="stat-value">${startingPrice.toLocaleString()}</span>
          </div>
        </div>
        <p className="portfolio-note">
          Values from Grow tab (median with Monte Carlo enabled)
        </p>
      </section>

      <section className="input-section">
        <h2>Withdrawal Plan</h2>

        <div className="input-group slider-group">
          <label htmlFor="monthlyIncome">
            Monthly Income: <span className="slider-value">{formatUSD(monthlyIncome)}</span>
          </label>
          <input
            id="monthlyIncome"
            type="range"
            min="500"
            max={monthlyIncomeMax}
            step={monthlyIncomeMax <= 20000 ? 100 : 500}
            value={Math.min(monthlyIncome, monthlyIncomeMax)}
            onChange={(e) => setMonthlyIncome(Number(e.target.value))}
          />
          <div className="slider-labels">
            <span>$500</span>
            <span className="slider-marker" style={{ left: `${(safeMonthlyWithdrawal / monthlyIncomeMax) * 100}%` }}>
              {formatUSD(safeMonthlyWithdrawal)} ({(safeWithdrawalRate * 100).toFixed(1)}%)
            </span>
            <span>${(monthlyIncomeMax / 1000).toFixed(0)}K</span>
          </div>
          <div className="limit-buttons">
            {[10000, 20000, 50000].map((limit) => (
              <button
                key={limit}
                type="button"
                className={`limit-btn ${monthlyIncomeMax === limit ? 'active' : ''}`}
                onClick={() => setMonthlyIncomeMax(limit)}
              >
                ${limit >= 1000 ? `${limit / 1000}K` : limit}
              </button>
            ))}
          </div>
          <span className="input-hint">
            {annualWithdrawalRate > 0 && (
              <>
                Annual withdrawal rate: {(annualWithdrawalRate * 100).toFixed(1)}%
              </>
            )}
          </span>
        </div>

        <div className="input-group slider-group">
          <label htmlFor="retirementYears">
            Retirement Duration: <span className="slider-value">{retirementYears} years</span>
          </label>
          <input
            id="retirementYears"
            type="range"
            min="10"
            max="50"
            value={retirementYears}
            onChange={(e) => setRetirementYears(Number(e.target.value))}
          />
          <div className="slider-labels">
            <span>10 years</span>
            <span className="slider-marker" style={{ left: '62.5%' }}>35yr typical</span>
            <span>50 years</span>
          </div>
        </div>

        {/* Expandable simulation settings */}
        <button
          type="button"
          className={`params-toggle ${settingsExpanded ? 'expanded' : ''}`}
          onClick={() => setSettingsExpanded(!settingsExpanded)}
        >
          <span className="params-toggle-label">Simulation Settings</span>
          <span className="params-toggle-summary">
            {Math.round(volatility * 100)}% vol, {Math.round(realGrowthRate * 100)}% growth
          </span>
          <span className={`toggle-arrow ${settingsExpanded ? 'expanded' : ''}`}>▼</span>
        </button>

        <div className={`growth-params-content ${settingsExpanded ? 'expanded' : ''}`}>
          <div className="input-group slider-group">
            <label htmlFor="spendVolatility">
              Price Volatility: <span className="slider-value">{Math.round(volatility * 100)}%</span>
            </label>
            <input
              id="spendVolatility"
              type="range"
              min="10"
              max="60"
              step="5"
              value={volatility * 100}
              onChange={(e) => setVolatility(Number(e.target.value) / 100)}
            />
            <div className="slider-labels">
              <span>10%</span>
              <span className="slider-marker" style={{ left: '33%' }}>25% typical</span>
              <span>60%</span>
            </div>
            <span className="input-hint">Mature assets: 15-25%. Higher vol = more risk but also more upside potential.</span>
          </div>

          <div className="input-group slider-group">
            <label htmlFor="spendRealGrowth">
              Real Growth Rate: <span className="slider-value">{Math.round(realGrowthRate * 100)}%</span>
            </label>
            <input
              id="spendRealGrowth"
              type="range"
              min="0"
              max="15"
              step="1"
              value={realGrowthRate * 100}
              onChange={(e) => setRealGrowthRate(Number(e.target.value) / 100)}
            />
            <div className="slider-labels">
              <span>0%</span>
              <span className="slider-marker" style={{ left: '53%' }}>8% stocks</span>
              <span>15%</span>
            </div>
            <span className="input-hint">Expected return above inflation. 0% = conservative, 7-8% = stock-like, 10%+ = optimistic.</span>
          </div>

          <div className="input-group slider-group">
            <label htmlFor="spendInflation">
              Inflation Rate: <span className="slider-value">{(inflationRate * 100).toFixed(1)}%</span>
            </label>
            <input
              id="spendInflation"
              type="range"
              min="0"
              max="10"
              step="0.5"
              value={inflationRate * 100}
              onChange={(e) => setInflationRate(Number(e.target.value) / 100)}
            />
            <div className="slider-labels">
              <span>0%</span>
              <span className="slider-marker" style={{ left: '35%' }}>3.5% historical</span>
              <span>10%</span>
            </div>
            <span className="input-hint">Withdrawal amount increases yearly to maintain purchasing power.</span>
          </div>

          <div className="input-group slider-group">
            <label htmlFor="spendSimulations">
              Simulations: <span className="slider-value">{simulations}</span>
            </label>
            <input
              id="spendSimulations"
              type="range"
              min="100"
              max="2000"
              step="100"
              value={simulations}
              onChange={(e) => setSimulations(Number(e.target.value))}
            />
            <div className="slider-labels">
              <span>100</span>
              <span className="slider-marker" style={{ left: '21%' }}>500 default</span>
              <span>2000</span>
            </div>
          </div>
        </div>
      </section>

      {/* Results Section */}
      {drawdownResult && (
        <section className="results-section">
          <div className="results-header">
            <h2>Drawdown Results</h2>
            <button
              type="button"
              className="share-btn"
              onClick={() => shareDrawdown({
                result: drawdownResult,
                startingSOL,
                startingPrice,
                startingValueUSD,
                monthlyIncome,
                retirementYears,
                volatility,
                inflationRate,
                simulations,
              })}
            >
              Share
            </button>
          </div>

          <div className="summary-cards">
            <div className="summary-card">
              <span className="card-label">Success Rate</span>
              <span className={`card-value ${drawdownResult.successRate >= 0.9 ? 'highlight' : drawdownResult.successRate >= 0.7 ? '' : 'warning'}`}>
                {Math.round(drawdownResult.successRate * 100)}%
              </span>
              <span className="card-subvalue">
                {drawdownResult.successRate >= 0.9 ? 'Excellent' : drawdownResult.successRate >= 0.7 ? 'Good' : 'Risky'}
              </span>
            </div>
            <div className="summary-card">
              <span className="card-label">Median Ending</span>
              <span className="card-value">
                {formatUSD(drawdownResult.medianEndingValue)}
              </span>
              <span className="card-subvalue">
                After {retirementYears} years
              </span>
            </div>
            <div className="summary-card">
              <span className="card-label">Failed Runs</span>
              <span className={`card-value ${drawdownResult.successRate < 1 ? 'warning' : ''}`}>
                {Math.round((1 - drawdownResult.successRate) * simulations)}
              </span>
              {drawdownResult.medianFailureMonth && (
                <span className="card-subvalue">
                  Median: {formatMonth(drawdownResult.medianFailureMonth)}
                </span>
              )}
            </div>
          </div>

          <div className="chart-container">
            {isCalculating && (
              <div className="mc-loading-overlay">
                <div className="mc-spinner"></div>
                <span>Running simulations...</span>
              </div>
            )}
            <DrawdownChart
              result={drawdownResult}
              retirementYears={retirementYears}
              monthlyIncome={monthlyIncome}
            />
          </div>

          <div className="drawdown-summary-note">
            <p>
              Simulating {simulations} retirement scenarios with {formatUSD(monthlyIncome)}/month withdrawals
              (inflation-adjusted at {(inflationRate * 100).toFixed(1)}% annually).
              {drawdownResult.successRate < 0.9 && (() => {
                // Only suggest reducing income if:
                // 1. Safe withdrawal is at least $500/month (meaningful amount)
                // 2. Current income is more than 20% above safe withdrawal
                const meaningfulSuggestion = safeMonthlyWithdrawal >= 500 && monthlyIncome > safeMonthlyWithdrawal * 1.2;
                if (meaningfulSuggestion) {
                  return (
                    <span className="suggestion">
                      {' '}Consider reducing monthly income to {formatUSD(safeMonthlyWithdrawal)} for higher success rate.
                    </span>
                  );
                } else {
                  return (
                    <span className="suggestion">
                      {' '}Your portfolio may be too small for this withdrawal rate. Try increasing your portfolio in the Grow tab or reducing monthly income.
                    </span>
                  );
                }
              })()}
            </p>
          </div>
        </section>
      )}
    </>
  );
}
