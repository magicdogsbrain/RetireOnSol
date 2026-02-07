import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  calculateProjection,
  formatUSD,
  formatSOL,
  type ProjectionInput,
  type ProjectionResult,
  type GrowthModel,
  type GrowthModelParams,
} from './utils/calculations';
import { getModelDisplayName, getModelDescription, getFuturePowerLawFairValue, type CAGRDecayType } from './utils/growthModels';
import { toTodaysDollars, type InflationParams } from './utils/inflation';
import { runMonteCarloSimulation, type MonteCarloParams, type MonteCarloResult, type VolatilityDecayType } from './utils/monteCarlo';
import { fetchSOLPrice, startPriceRefresh } from './utils/solPrice';
import { loadSettings, saveSettings, clearSettings, DEFAULT_SETTINGS } from './utils/storage';
import { GrowthChart } from './components/GrowthChart';
import { ComparisonChart } from './components/ComparisonChart';
import { WalletButton } from './components/WalletButton';
import { SpendTab } from './components/SpendTab';
import { shareProjection } from './utils/shareImage';
import './App.css';

type DCAFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly';
type AppTab = 'grow' | 'spend';

// Load initial settings from localStorage
const initialSettings = loadSettings();

function App() {
  // Tab state
  const [activeTab, setActiveTab] = useState<AppTab>('grow');

  // Spend Now mode - skip grow phase and go straight to spend
  const [spendNowMode, setSpendNowMode] = useState(false);

  // Form state (with localStorage defaults)
  const [currentSOL, setCurrentSOL] = useState<number>(initialSettings.currentSOL ?? DEFAULT_SETTINGS.currentSOL);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [priceLoading, setPriceLoading] = useState<boolean>(true);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [years, setYears] = useState<number>(initialSettings.years ?? DEFAULT_SETTINGS.years);
  const [dcaAmountUSD, setDcaAmountUSD] = useState<number>(initialSettings.dcaAmountUSD ?? DEFAULT_SETTINGS.dcaAmountUSD);
  const [dcaMaxLimit, setDcaMaxLimit] = useState<number>(initialSettings.dcaMaxLimit ?? DEFAULT_SETTINGS.dcaMaxLimit);
  const [dcaFrequency, setDcaFrequency] = useState<DCAFrequency>(initialSettings.dcaFrequency ?? DEFAULT_SETTINGS.dcaFrequency);

  // Growth model state (with localStorage defaults)
  const [growthModel, setGrowthModel] = useState<GrowthModel>(initialSettings.growthModel ?? DEFAULT_SETTINGS.growthModel);
  const [modelParams, setModelParams] = useState<GrowthModelParams>({
    cagr: initialSettings.modelParams?.cagr ?? DEFAULT_SETTINGS.modelParams.cagr,
    cagrDecay: initialSettings.modelParams?.cagrDecay ?? DEFAULT_SETTINGS.modelParams.cagrDecay,
    powerLawSlope: initialSettings.modelParams?.powerLawSlope ?? DEFAULT_SETTINGS.modelParams.powerLawSlope,
    sCurveYearsToHalfRemaining: initialSettings.modelParams?.sCurveYearsToHalfRemaining ?? DEFAULT_SETTINGS.modelParams.sCurveYearsToHalfRemaining,
  });

  // Calculate dynamic asymptotic ceiling based on power law growth (normalized to current price)
  const dynamicCeiling = useMemo(() => {
    if (currentPrice === null) return 50000; // fallback
    const slope = modelParams.powerLawSlope || 1.6;
    // Get power law fair values for today and future to derive growth multiplier
    const todayFairValue = getFuturePowerLawFairValue(0, slope);
    const futureFairValue = getFuturePowerLawFairValue(years, slope);
    const growthMultiplier = futureFairValue / todayFairValue;
    // Apply multiplier to current price (normalized approach)
    const normalizedCeiling = currentPrice * growthMultiplier;
    // Round to nearest $1000
    return Math.round(normalizedCeiling / 1000) * 1000;
  }, [years, modelParams.powerLawSlope, currentPrice]);
  const [compareMode, setCompareMode] = useState(false);
  const [growthModelExpanded, setGrowthModelExpanded] = useState(false);

  // Inflation & Debasement state (with localStorage defaults)
  const [inflationEnabled, setInflationEnabled] = useState(initialSettings.inflationEnabled ?? DEFAULT_SETTINGS.inflationEnabled);
  const [inflationExpanded, setInflationExpanded] = useState(false);
  const [inflationType, setInflationType] = useState<'linear' | 'cyclical'>(initialSettings.inflationType ?? DEFAULT_SETTINGS.inflationType);
  const [inflationRate, setInflationRate] = useState(initialSettings.inflationRate ?? DEFAULT_SETTINGS.inflationRate);
  const [inflationAmplitude, setInflationAmplitude] = useState(initialSettings.inflationAmplitude ?? DEFAULT_SETTINGS.inflationAmplitude);
  const [inflationCyclePeriod, setInflationCyclePeriod] = useState(initialSettings.inflationCyclePeriod ?? DEFAULT_SETTINGS.inflationCyclePeriod);
  const [debasementRate, setDebasementRate] = useState(initialSettings.debasementRate ?? DEFAULT_SETTINGS.debasementRate);

  // Monte Carlo state (with localStorage defaults)
  const [mcEnabled, setMcEnabled] = useState(initialSettings.mcEnabled ?? DEFAULT_SETTINGS.mcEnabled);
  const [mcExpanded, setMcExpanded] = useState(false);
  const [mcVolatility, setMcVolatility] = useState(initialSettings.mcVolatility ?? DEFAULT_SETTINGS.mcVolatility);
  const [mcVolatilityDecay, setMcVolatilityDecay] = useState<VolatilityDecayType>(initialSettings.mcVolatilityDecay ?? DEFAULT_SETTINGS.mcVolatilityDecay);
  const [mcSimulations, setMcSimulations] = useState(initialSettings.mcSimulations ?? DEFAULT_SETTINGS.mcSimulations);
  const [mcCalculating, setMcCalculating] = useState(false);

  // Reset key - incremented when Reset All Settings is clicked to trigger SpendTab reset
  const [resetKey, setResetKey] = useState(0);

  // Fetch SOL price on mount and refresh every 5 minutes
  useEffect(() => {
    async function loadPrice() {
      try {
        setPriceLoading(true);
        setPriceError(null);
        const data = await fetchSOLPrice();
        setCurrentPrice(data.price);
      } catch (err) {
        setPriceError(err instanceof Error ? err.message : 'Could not fetch price');
        // No fallback - price will remain null until network is available
      } finally {
        setPriceLoading(false);
      }
    }
    loadPrice();

    // Start periodic refresh every 5 minutes
    const cleanup = startPriceRefresh((newPrice) => {
      setCurrentPrice(newPrice);
      setPriceError(null);
    });

    return cleanup;
  }, []);

  // Save settings to localStorage when they change
  useEffect(() => {
    saveSettings({
      currentSOL,
      years,
      dcaAmountUSD,
      dcaMaxLimit,
      dcaFrequency,
      growthModel,
      modelParams,
      inflationEnabled,
      inflationType,
      inflationRate,
      inflationAmplitude,
      inflationCyclePeriod,
      debasementRate,
      mcEnabled,
      mcVolatility,
      mcVolatilityDecay,
      mcSimulations,
    });
  }, [
    currentSOL, years, dcaAmountUSD, dcaMaxLimit, dcaFrequency,
    growthModel, modelParams,
    inflationEnabled, inflationType, inflationRate, inflationAmplitude, inflationCyclePeriod, debasementRate,
    mcEnabled, mcVolatility, mcVolatilityDecay, mcSimulations,
  ]);

  // Reset all settings to defaults
  const resetSettings = useCallback(() => {
    if (window.confirm('Reset all settings to defaults? This cannot be undone.')) {
      clearSettings();
      setCurrentSOL(DEFAULT_SETTINGS.currentSOL);
      setYears(DEFAULT_SETTINGS.years);
      setDcaAmountUSD(DEFAULT_SETTINGS.dcaAmountUSD);
      setDcaMaxLimit(DEFAULT_SETTINGS.dcaMaxLimit);
      setDcaFrequency(DEFAULT_SETTINGS.dcaFrequency);
      setGrowthModel(DEFAULT_SETTINGS.growthModel);
      setModelParams({
        cagr: DEFAULT_SETTINGS.modelParams.cagr,
        cagrDecay: DEFAULT_SETTINGS.modelParams.cagrDecay,
        powerLawSlope: DEFAULT_SETTINGS.modelParams.powerLawSlope,
        sCurveYearsToHalfRemaining: DEFAULT_SETTINGS.modelParams.sCurveYearsToHalfRemaining,
      });
      setInflationEnabled(DEFAULT_SETTINGS.inflationEnabled);
      setInflationType(DEFAULT_SETTINGS.inflationType);
      setInflationRate(DEFAULT_SETTINGS.inflationRate);
      setInflationAmplitude(DEFAULT_SETTINGS.inflationAmplitude);
      setInflationCyclePeriod(DEFAULT_SETTINGS.inflationCyclePeriod);
      setDebasementRate(DEFAULT_SETTINGS.debasementRate);
      setMcEnabled(DEFAULT_SETTINGS.mcEnabled);
      setMcVolatility(DEFAULT_SETTINGS.mcVolatility);
      setMcVolatilityDecay(DEFAULT_SETTINGS.mcVolatilityDecay);
      setMcSimulations(DEFAULT_SETTINGS.mcSimulations);
      // Trigger SpendTab reset
      setResetKey(k => k + 1);
    }
  }, []);

  // Track wallet balance for "Use Wallet Balance" button
  const [walletBalance, setWalletBalance] = useState<number | null>(null);

  // Handle wallet balance loaded
  const handleWalletBalance = useCallback((balance: number) => {
    setWalletBalance(balance);
  }, []);

  // Apply wallet balance to input
  const useWalletBalanceForInput = useCallback(() => {
    if (walletBalance !== null) {
      setCurrentSOL(walletBalance);
    }
  }, [walletBalance]);

  // Effective model params with dynamic ceiling for scurve
  const effectiveModelParams = useMemo(() => ({
    ...modelParams,
    // Always use dynamic ceiling for scurve (no manual override anymore)
    sCurveMaxPrice: dynamicCeiling,
  }), [modelParams, dynamicCeiling]);

  // Calculate projections
  const projection = useMemo<ProjectionResult | null>(() => {
    if (currentPrice === null) return null;
    const input: ProjectionInput = {
      currentSOL,
      currentPrice,
      years,
      dcaAmountUSD,
      dcaFrequency,
      growthModel,
      modelParams: effectiveModelParams,
    };
    return calculateProjection(input);
  }, [currentSOL, currentPrice, years, dcaAmountUSD, dcaFrequency, growthModel, effectiveModelParams]);

  // Inflation params for today's dollars calculation
  const inflationParams: InflationParams = useMemo(() => ({
    enabled: inflationEnabled,
    type: inflationType,
    rate: inflationRate,
    amplitude: inflationAmplitude,
    cyclePeriod: inflationCyclePeriod,
    debasementRate: debasementRate,
  }), [inflationEnabled, inflationType, inflationRate, inflationAmplitude, inflationCyclePeriod, debasementRate]);

  // Calculate today's dollars value
  const todaysDollarsValue = useMemo(() => {
    if (!projection || !inflationEnabled) return null;
    return toTodaysDollars(projection.finalValueUSD, years, inflationParams);
  }, [projection, years, inflationParams, inflationEnabled]);

  // Inflation adjustment function for charts (adjusts value at specific year)
  const inflationAdjustmentFn = useCallback((value: number, year: number) => {
    return toTodaysDollars(value, year, inflationParams);
  }, [inflationParams]);

  // Monte Carlo params
  const mcParams: MonteCarloParams = useMemo(() => ({
    enabled: mcEnabled,
    volatility: mcVolatility,
    volatilityDecay: mcVolatilityDecay,
    simulations: mcSimulations,
  }), [mcEnabled, mcVolatility, mcVolatilityDecay, mcSimulations]);

  // Monte Carlo simulation results (with loading state)
  const [mcResult, setMcResult] = useState<MonteCarloResult | null>(null);

  useEffect(() => {
    if (!mcEnabled || currentPrice === null) {
      setMcResult(null);
      setMcCalculating(false);
      return;
    }

    // Show loading state
    setMcCalculating(true);

    // Use setTimeout to allow UI to update before heavy calculation
    // Small delay ensures spinner is visible even on fast machines
    const timeoutId = setTimeout(() => {
      const result = runMonteCarloSimulation(
        currentSOL,
        currentPrice,
        years,
        dcaAmountUSD,
        dcaFrequency,
        growthModel,
        effectiveModelParams,
        mcParams
      );
      setMcResult(result);
      setMcCalculating(false);
    }, 50);

    return () => clearTimeout(timeoutId);
  }, [mcEnabled, currentSOL, currentPrice, years, dcaAmountUSD, dcaFrequency, growthModel, effectiveModelParams, mcParams]);

  return (
    <div className="app">
      <header className="header">
        <div className="header-top">
          <div className="header-brand">
            <img src="/icons/icon.svg" alt="RetireOnSol" className="header-logo" />
            <div className="header-title-group">
              <h1>RetireOnSol</h1>
              <p className="subtitle">Plan your SOL accumulation journey</p>
            </div>
          </div>
          <WalletButton onBalanceLoaded={handleWalletBalance} />
        </div>
      </header>

      {/* Tab Navigation */}
      <nav className="tab-nav">
        <button
          type="button"
          className={`tab-btn ${activeTab === 'grow' ? 'active' : ''}`}
          onClick={() => setActiveTab('grow')}
        >
          Grow
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === 'spend' ? 'active' : ''}`}
          onClick={() => setActiveTab('spend')}
        >
          Spend
        </button>
      </nav>

      <main className="main">
        {/* GROW TAB */}
        {activeTab === 'grow' && (
          <>
        <section className="input-section">
          <h2>Your SOL Holdings</h2>

          <div className="input-row">
            <div className="input-group">
              <label htmlFor="currentSOL">Current SOL</label>
              <div className="sol-input-wrapper">
                <input
                  id="currentSOL"
                  type="number"
                  min="0"
                  step="1"
                  value={currentSOL || ''}
                  onChange={(e) => setCurrentSOL(e.target.value === '' ? 0 : Number(e.target.value))}
                />
                {walletBalance !== null && (
                  <button
                    type="button"
                    className="use-wallet-btn"
                    onClick={useWalletBalanceForInput}
                    title={`Use wallet balance: ${walletBalance} SOL`}
                  >
                    Use {walletBalance} SOL
                  </button>
                )}
              </div>
            </div>

            <div className="input-group">
              <label>Current Price</label>
              <div className="price-display">
                {priceLoading ? (
                  <span className="price-loading">Loading...</span>
                ) : priceError ? (
                  <span className="price-value">${currentPrice?.toFixed(2)} <span className="price-note">(fallback)</span></span>
                ) : (
                  <span className="price-value">${currentPrice?.toFixed(2)} <span className="price-note">live</span></span>
                )}
              </div>
            </div>
          </div>

          {currentPrice !== null && (
            <div className="current-value-display">
              Current Value: <span className="highlight">{formatUSD(currentSOL * currentPrice)}</span>
            </div>
          )}

          {/* Spend Now Toggle */}
          <div className="spend-now-toggle">
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={spendNowMode}
                onChange={(e) => setSpendNowMode(e.target.checked)}
              />
              <span className="toggle-slider"></span>
            </label>
            <div className="toggle-text">
              <span className="toggle-label">Spend Now</span>
              <span className="toggle-hint">
                {spendNowMode
                  ? 'Skip to Spend tab with current holdings'
                  : 'Plan accumulation before spending'}
              </span>
            </div>
          </div>
        </section>

        {!spendNowMode && (
          <>
          <section className="input-section">
            <h2>Accumulation Plan</h2>

            <div className="input-group slider-group">
              <label htmlFor="years">Years to Retirement: <span className="slider-value">{years}</span></label>
              <input
                id="years"
                type="range"
                min="5"
                max="40"
                value={years}
                onChange={(e) => setYears(Number(e.target.value))}
              />
              <div className="slider-labels">
                <span>5</span>
                <span>40</span>
              </div>
            </div>

          <div className="input-group slider-group">
            <label htmlFor="dcaAmountUSD">DCA per Period: <span className="slider-value">${dcaAmountUSD}</span></label>
            <input
              id="dcaAmountUSD"
              type="range"
              min="0"
              max={dcaMaxLimit}
              step={dcaMaxLimit <= 1000 ? 10 : 50}
              value={Math.min(dcaAmountUSD, dcaMaxLimit)}
              onChange={(e) => setDcaAmountUSD(Number(e.target.value))}
            />
            <div className="slider-labels">
              <span>$0</span>
              <span>${dcaMaxLimit.toLocaleString()}</span>
            </div>
            <div className="limit-buttons">
              {[1000, 5000, 10000].map((limit) => (
                <button
                  key={limit}
                  type="button"
                  className={`limit-btn ${dcaMaxLimit === limit ? 'active' : ''}`}
                  onClick={() => setDcaMaxLimit(limit)}
                >
                  ${limit >= 1000 ? `${limit / 1000}K` : limit}
                </button>
              ))}
            </div>
          </div>

          <div className="input-group">
            <label>Frequency</label>
            <div className="frequency-buttons">
              {(['daily', 'weekly', 'monthly', 'yearly'] as DCAFrequency[]).map((freq) => (
                <button
                  key={freq}
                  type="button"
                  className={`freq-btn ${dcaFrequency === freq ? 'active' : ''}`}
                  onClick={() => setDcaFrequency(freq)}
                >
                  {freq.charAt(0).toUpperCase() + freq.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="input-section">
          <h2>Growth Model</h2>

          <div className="input-group">
            <label>Price Projection Model</label>
            <div className="model-buttons">
              {(['cagr', 'powerlaw', 'scurve'] as GrowthModel[]).map((model) => (
                <button
                  key={model}
                  type="button"
                  className={`model-btn ${growthModel === model ? 'active' : ''}`}
                  onClick={() => setGrowthModel(model)}
                >
                  {getModelDisplayName(model)}
                </button>
              ))}
            </div>
            <span className="input-hint">{getModelDescription(growthModel)}</span>
          </div>

          {/* Expandable parameters toggle */}
          <button
            type="button"
            className={`params-toggle ${growthModelExpanded ? 'expanded' : ''}`}
            onClick={() => setGrowthModelExpanded(!growthModelExpanded)}
          >
            <span className="params-toggle-label">Parameters</span>
            <span className="params-toggle-summary">
              {growthModel === 'cagr' && `${Math.round((modelParams.cagr || 0.25) * 100)}%${modelParams.cagrDecay === 'auto' ? ' + auto decay' : ''}`}
              {growthModel === 'powerlaw' && `slope ${(modelParams.powerLawSlope || 1.6).toFixed(1)}`}
              {growthModel === 'scurve' && `$${(dynamicCeiling / 1000).toFixed(0)}K ceiling, ${modelParams.sCurveYearsToHalfRemaining || 12}yr`}
            </span>
            <span className={`toggle-arrow ${growthModelExpanded ? 'expanded' : ''}`}>▼</span>
          </button>

          {/* Model-specific parameters */}
          <div className={`growth-params-content ${growthModelExpanded ? 'expanded' : ''}`}>
          {growthModel === 'cagr' && (
            <>
              <div className="input-group slider-group">
                <label htmlFor="cagr">Starting Growth Rate: <span className="slider-value">{Math.round((modelParams.cagr || 0.25) * 100)}%</span></label>
                <input
                  id="cagr"
                  type="range"
                  min="0"
                  max="100"
                  value={(modelParams.cagr || 0.25) * 100}
                  onChange={(e) => setModelParams({ ...modelParams, cagr: Number(e.target.value) / 100 })}
                />
                <div className="slider-labels">
                  <span>0%</span>
                  <span className="slider-marker" style={{ left: '25%' }}>25% typical</span>
                  <span>100%</span>
                </div>
                <span className="input-hint">Historical crypto CAGR: 20-40% for mature assets. SOL 5yr avg ~50% but decelerating.</span>
              </div>
              <div className="input-group">
                <label>CAGR Decay</label>
                <div className="decay-buttons">
                  {([
                    { value: 'none' as CAGRDecayType, label: 'None' },
                    { value: 'auto' as CAGRDecayType, label: 'Auto' },
                  ]).map((decay) => (
                    <button
                      key={decay.value}
                      type="button"
                      className={`decay-btn ${modelParams.cagrDecay === decay.value ? 'active' : ''}`}
                      onClick={() => setModelParams({ ...modelParams, cagrDecay: decay.value })}
                    >
                      {decay.label}
                    </button>
                  ))}
                </div>
                <span className="input-hint">
                  {modelParams.cagrDecay === 'none'
                    ? 'Constant CAGR forever - unrealistic but simple.'
                    : 'Realistic decay adapts to your time horizon. Fast decay early, stabilizing over time. Floor: 3%.'}
                </span>
              </div>
            </>
          )}

          {growthModel === 'powerlaw' && (
            <div className="input-group slider-group">
              <label htmlFor="powerLawSlope">Power Law Slope: <span className="slider-value">{(modelParams.powerLawSlope || 1.6).toFixed(1)}</span></label>
              <input
                id="powerLawSlope"
                type="range"
                min="1"
                max="3"
                step="0.1"
                value={modelParams.powerLawSlope || 1.6}
                onChange={(e) => setModelParams({ ...modelParams, powerLawSlope: Number(e.target.value) })}
              />
              <div className="slider-labels">
                <span>1.0</span>
                <span className="slider-marker" style={{ left: '30%' }}>1.6 SOL default</span>
                <span>3.0</span>
              </div>
              <span className="input-hint">Growth rate derived from SOL historical regression. Normalized to today's price.</span>
            </div>
          )}

          {growthModel === 'scurve' && (
            <>
              <div className="input-group">
                <label>Price Ceiling</label>
                <div className="ceiling-display">
                  <span className="ceiling-value">${dynamicCeiling.toLocaleString()}</span>
                  <span className="ceiling-note">at {years} years</span>
                </div>
                <span className="input-hint">Ceiling adjusts based on your time to retirement.</span>
              </div>
              <div className="input-group slider-group">
                <label htmlFor="sCurveYearsToHalfRemaining">Years to 50% of Remaining: <span className="slider-value">{modelParams.sCurveYearsToHalfRemaining || 12} years</span></label>
                <input
                  id="sCurveYearsToHalfRemaining"
                  type="range"
                  min="5"
                  max="30"
                  value={modelParams.sCurveYearsToHalfRemaining || 12}
                  onChange={(e) => setModelParams({ ...modelParams, sCurveYearsToHalfRemaining: Number(e.target.value) })}
                />
                <div className="slider-labels">
                  <span>5 years (fast)</span>
                  <span className="slider-marker" style={{ left: '28%' }}>12yr typical</span>
                  <span>30 years (slow)</span>
                </div>
                <span className="input-hint">Years to capture half the remaining upside to ceiling. Lower = faster adoption.</span>
              </div>
            </>
          )}

          </div>
        </section>

        {/* Inflation & Debasement Collapsible Section */}
        <section className="inflation-section">
          <div className={`inflation-toggle ${inflationEnabled ? 'enabled' : ''} ${inflationExpanded ? 'expanded-below' : ''}`}>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={inflationEnabled}
                onChange={(e) => setInflationEnabled(e.target.checked)}
              />
              <span className="toggle-slider"></span>
            </label>
            <div className="toggle-text">
              <span className="toggle-label">Inflation & Debasement</span>
              <span className="inflation-summary">
                {!inflationEnabled
                  ? 'Off'
                  : `${inflationType === 'cyclical'
                      ? `~${(inflationRate * 100).toFixed(1)}% cyclical`
                      : `${(inflationRate * 100).toFixed(1)}%`} + ${(debasementRate * 100).toFixed(0)}% debasement`}
              </span>
            </div>
            <button
              type="button"
              className="toggle-arrow-btn"
              onClick={() => setInflationExpanded(!inflationExpanded)}
              aria-label={inflationExpanded ? 'Collapse' : 'Expand'}
            >
              <span className={`toggle-arrow ${inflationExpanded ? 'expanded' : ''}`}>▼</span>
            </button>
          </div>

          <div className={`inflation-content ${inflationExpanded ? 'expanded' : ''}`}>
            <div className="input-group">
              <label>Inflation Model</label>
              <div className="decay-buttons">
                <button
                  type="button"
                  className={`decay-btn ${inflationType === 'linear' ? 'active' : ''}`}
                  onClick={() => setInflationType('linear')}
                >
                  Linear
                </button>
                <button
                  type="button"
                  className={`decay-btn ${inflationType === 'cyclical' ? 'active' : ''}`}
                  onClick={() => setInflationType('cyclical')}
                >
                  Cyclical
                </button>
              </div>
              <span className="input-hint">
                {inflationType === 'linear'
                  ? 'Constant inflation rate each year.'
                  : 'Models business cycle with peaks and troughs. Avg cycle: 6-7 years.'}
              </span>
            </div>

            <div className="input-group slider-group">
              <label htmlFor="inflationRate">
                {inflationType === 'linear' ? 'Inflation Rate' : 'Base Inflation'}: <span className="slider-value">{(inflationRate * 100).toFixed(1)}%</span>
              </label>
              <input
                id="inflationRate"
                type="range"
                min="0"
                max="10"
                step="0.5"
                value={inflationRate * 100}
                onChange={(e) => setInflationRate(Number(e.target.value) / 100)}
              />
              <div className="slider-labels">
                <span>0%</span>
                <span className="slider-marker" style={{ left: '35%' }}>3.5% historical avg</span>
                <span>10%</span>
              </div>
            </div>

            {inflationType === 'cyclical' && (
              <>
                <div className="input-group slider-group">
                  <label htmlFor="inflationAmplitude">Cycle Amplitude: <span className="slider-value">±{(inflationAmplitude * 100).toFixed(1)}%</span></label>
                  <input
                    id="inflationAmplitude"
                    type="range"
                    min="0"
                    max="5"
                    step="0.5"
                    value={inflationAmplitude * 100}
                    onChange={(e) => setInflationAmplitude(Number(e.target.value) / 100)}
                  />
                  <div className="slider-labels">
                    <span>0%</span>
                    <span className="slider-marker" style={{ left: '40%' }}>±2% typical</span>
                    <span>±5%</span>
                  </div>
                  <span className="input-hint">With 3.5% base and 2% amplitude: inflation swings between 1.5% and 5.5%.</span>
                </div>

                <div className="input-group slider-group">
                  <label htmlFor="inflationCycle">Cycle Period: <span className="slider-value">{inflationCyclePeriod} years</span></label>
                  <input
                    id="inflationCycle"
                    type="range"
                    min="4"
                    max="12"
                    step="1"
                    value={inflationCyclePeriod}
                    onChange={(e) => setInflationCyclePeriod(Number(e.target.value))}
                  />
                  <div className="slider-labels">
                    <span>4 yrs</span>
                    <span className="slider-marker" style={{ left: '38%' }}>7 yrs historical</span>
                    <span>12 yrs</span>
                  </div>
                </div>
              </>
            )}

            <div className="input-group slider-group">
              <label htmlFor="debasement">Currency Debasement: <span className="slider-value">{(debasementRate * 100).toFixed(1)}%</span></label>
              <input
                id="debasement"
                type="range"
                min="0"
                max="15"
                step="0.5"
                value={debasementRate * 100}
                onChange={(e) => setDebasementRate(Number(e.target.value) / 100)}
              />
              <div className="slider-labels">
                <span>0%</span>
                <span className="slider-marker" style={{ left: '47%' }}>7% M2 avg</span>
                <span>15%</span>
              </div>
              <span className="input-hint">M2 money supply growth. Affects purchasing power vs hard assets like property.</span>
            </div>
          </div>
        </section>

        {/* Monte Carlo Simulation Section */}
        <section className="montecarlo-section">
          <div className={`montecarlo-toggle ${mcEnabled ? 'enabled' : ''} ${mcExpanded ? 'expanded-below' : ''}`}>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={mcEnabled}
                onChange={(e) => setMcEnabled(e.target.checked)}
              />
              <span className="toggle-slider"></span>
            </label>
            <div className="toggle-text">
              <span className="toggle-label">Monte Carlo Simulation</span>
              <span className="montecarlo-summary">
                {!mcEnabled
                  ? 'Off'
                  : `${Math.round(mcVolatility * 100)}% vol${mcVolatilityDecay === 'auto' ? ' + decay' : ''}, ${mcSimulations} sims`}
              </span>
            </div>
            <button
              type="button"
              className="toggle-arrow-btn"
              onClick={() => setMcExpanded(!mcExpanded)}
              aria-label={mcExpanded ? 'Collapse' : 'Expand'}
            >
              <span className={`toggle-arrow ${mcExpanded ? 'expanded' : ''}`}>▼</span>
            </button>
          </div>

          <div className={`montecarlo-content ${mcExpanded ? 'expanded' : ''}`}>
            <div className="input-group slider-group">
              <label htmlFor="mcVolatility">Starting Volatility: <span className="slider-value">{Math.round(mcVolatility * 100)}%</span></label>
              <input
                id="mcVolatility"
                type="range"
                min="20"
                max="150"
                step="5"
                value={mcVolatility * 100}
                onChange={(e) => setMcVolatility(Number(e.target.value) / 100)}
              />
              <div className="slider-labels">
                <span>20%</span>
                <span className="slider-marker" style={{ left: '46%' }}>80% SOL typical</span>
                <span>150%</span>
              </div>
              <span className="input-hint">SOL historical volatility: 80-100%. Higher = wider range of outcomes.</span>
            </div>

            <div className="input-group">
              <label>Volatility Decay</label>
              <div className="decay-buttons">
                {([
                  { value: 'none' as VolatilityDecayType, label: 'None' },
                  { value: 'auto' as VolatilityDecayType, label: 'Auto' },
                ]).map((decay) => (
                  <button
                    key={decay.value}
                    type="button"
                    className={`decay-btn ${mcVolatilityDecay === decay.value ? 'active' : ''}`}
                    onClick={() => setMcVolatilityDecay(decay.value)}
                  >
                    {decay.label}
                  </button>
                ))}
              </div>
              <span className="input-hint">
                {mcVolatilityDecay === 'none'
                  ? 'Constant volatility forever - pessimistic assumption.'
                  : 'Realistic decay as asset matures. 80% → ~30% over 25 years. Floor: 25%.'}
              </span>
            </div>

            <div className="input-group slider-group">
              <label htmlFor="mcSimulations">Simulations: <span className="slider-value">{mcSimulations}</span></label>
              <input
                id="mcSimulations"
                type="range"
                min="100"
                max="2000"
                step="100"
                value={mcSimulations}
                onChange={(e) => setMcSimulations(Number(e.target.value))}
              />
              <div className="slider-labels">
                <span>100</span>
                <span className="slider-marker" style={{ left: '21%' }}>500 default</span>
                <span>2000</span>
              </div>
              <span className="input-hint">More simulations = smoother results but slower. 500 is a good balance.</span>
            </div>
          </div>
        </section>
          </>
        )}

        {!spendNowMode && projection && (
          <section className="results-section">
            <div className="results-header">
              <h2>After {years} Years</h2>
              <button
                type="button"
                className="share-btn"
                onClick={() => shareProjection({
                  projection,
                  years,
                  growthModel,
                  modelParams: effectiveModelParams,
                  dcaAmountUSD,
                  dcaFrequency,
                  currentSOL,
                  currentPrice: currentPrice!,
                  mcEnabled,
                  mcResult,
                  mcVolatility,
                  mcSimulations,
                  inflationEnabled,
                  inflationParams,
                  todaysDollarsValue,
                  inflationAdjustmentFn,
                })}
              >
                Share
              </button>
            </div>

            <div className="summary-cards">
              <div className="summary-card">
                <span className="card-label">
                  {mcEnabled ? "Median Value" : (inflationEnabled ? "Today's Dollars" : "Portfolio Value")}
                </span>
                <span className="card-value highlight">
                  {mcEnabled && mcResult
                    ? formatUSD(inflationEnabled ? inflationAdjustmentFn(mcResult.finalP50, years) : mcResult.finalP50)
                    : formatUSD(inflationEnabled && todaysDollarsValue ? todaysDollarsValue : projection.finalValueUSD)}
                </span>
                {mcEnabled && mcResult ? (
                  <span className="card-subvalue mc-range">
                    {formatUSD(inflationEnabled ? inflationAdjustmentFn(mcResult.finalP10, years) : mcResult.finalP10)} - {formatUSD(inflationEnabled ? inflationAdjustmentFn(mcResult.finalP90, years) : mcResult.finalP90)}
                  </span>
                ) : inflationEnabled && (
                  <span className="card-subvalue">
                    Nominal: {formatUSD(projection.finalValueUSD)}
                  </span>
                )}
              </div>
              <div className="summary-card">
                <span className="card-label">{mcEnabled ? "Median SOL" : "SOL Accumulated"}</span>
                <span className="card-value">
                  {mcEnabled && mcResult
                    ? `${formatSOL(mcResult.finalSolP50)} SOL`
                    : `${formatSOL(projection.finalSOL)} SOL`}
                </span>
                {mcEnabled && mcResult && (
                  <span className="card-subvalue mc-range">
                    {formatSOL(mcResult.finalSolP10)} - {formatSOL(mcResult.finalSolP90)}
                  </span>
                )}
              </div>
              <div className="summary-card">
                <span className="card-label">SOL Price</span>
                <span className="card-value">${projection.finalPrice.toLocaleString()}</span>
                {mcEnabled && (
                  <span className="card-subvalue mc-note">
                    (model expected)
                  </span>
                )}
              </div>
            </div>

            <div className="summary-row">
              <div className="summary-item">
                <span className="item-label">Total Invested:</span>
                <span className="item-value">{formatUSD(projection.totalInvestedUSD)}</span>
              </div>
              <div className="summary-item">
                <span className="item-label">{mcEnabled ? "Median Gain:" : (inflationEnabled ? "Real Gain:" : "Total Gain:")}</span>
                <span className="item-value gain">
                  {(() => {
                    if (mcEnabled && mcResult) {
                      const medianValue = inflationEnabled
                        ? inflationAdjustmentFn(mcResult.finalP50, years)
                        : mcResult.finalP50;
                      return formatUSD(medianValue - projection.totalInvestedUSD);
                    }
                    return formatUSD(inflationEnabled && todaysDollarsValue
                      ? todaysDollarsValue - projection.totalInvestedUSD
                      : projection.totalGainUSD);
                  })()}
                </span>
              </div>
            </div>

            <div className="chart-container">
              {mcCalculating && (
                <div className="mc-loading-overlay">
                  <div className="mc-spinner"></div>
                  <span>Running simulations...</span>
                </div>
              )}
              <div className="chart-mode-toggle">
                <button
                  type="button"
                  className={`mode-btn ${!compareMode ? 'active' : ''}`}
                  onClick={() => setCompareMode(false)}
                >
                  Single Model
                </button>
                <button
                  type="button"
                  className={`mode-btn ${compareMode ? 'active' : ''}`}
                  onClick={() => setCompareMode(true)}
                >
                  Compare All
                </button>
              </div>
              {compareMode && currentPrice ? (
                <ComparisonChart
                  currentSOL={currentSOL}
                  currentPrice={currentPrice}
                  years={years}
                  dcaAmountUSD={dcaAmountUSD}
                  dcaFrequency={dcaFrequency}
                  modelParams={effectiveModelParams}
                  inflationAdjustment={inflationAdjustmentFn}
                  showRealValue={inflationEnabled}
                  mcParams={mcEnabled ? mcParams : null}
                />
              ) : (
                <GrowthChart
                  projections={projection.projections}
                  inflationAdjustment={inflationAdjustmentFn}
                  showRealValue={inflationEnabled}
                  mcResult={mcEnabled ? mcResult : null}
                />
              )}
            </div>

            <div className="projection-table">
              <h3>
                Year-by-Year Breakdown
                {mcEnabled && <span className="table-note"> (Median)</span>}
                {inflationEnabled && !mcEnabled && <span className="table-note"> (Today's Dollars)</span>}
                {inflationEnabled && mcEnabled && <span className="table-note"> (Today's Dollars)</span>}
              </h3>
              <table>
                <thead>
                  <tr>
                    <th>Year</th>
                    <th>SOL</th>
                    <th>Price</th>
                    <th>{mcEnabled ? "Median Value" : (inflationEnabled ? "Real Value" : "Value")}</th>
                    <th>Invested</th>
                  </tr>
                </thead>
                <tbody>
                  {projection.projections
                    .map((p, i) => ({ p, i }))
                    .filter(({ i }) => i % 5 === 4 || i === 0)
                    .map(({ p, i }) => {
                      // Use original index for MC percentiles lookup
                      const mcPercentile = mcEnabled && mcResult?.percentiles[i];

                      // Value to display
                      const displayValue = mcPercentile
                        ? (inflationEnabled ? inflationAdjustmentFn(mcPercentile.p50, p.year) : mcPercentile.p50)
                        : (inflationEnabled ? inflationAdjustmentFn(p.portfolioValueUSD, p.year) : p.portfolioValueUSD);

                      return (
                        <tr key={p.year}>
                          <td>{p.year}</td>
                          <td>{formatSOL(p.solBalance)}</td>
                          <td>${p.solPrice.toLocaleString()}</td>
                          <td>{formatUSD(displayValue)}</td>
                          <td>{formatUSD(p.totalInvestedUSD)}</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </section>
        )}
          </>
        )}

        {/* SPEND TAB */}
        {activeTab === 'spend' && (
          <SpendTab
            startingSOL={
              spendNowMode
                ? currentSOL
                : (mcEnabled && mcResult ? mcResult.finalSolP50 : (projection?.finalSOL || 0))
            }
            startingPrice={
              spendNowMode
                ? (currentPrice || 0)
                : (projection?.finalPrice || 0)
            }
            startingValueUSD={
              spendNowMode
                ? (currentSOL * (currentPrice || 0))
                : (mcEnabled && mcResult
                    ? (inflationEnabled ? inflationAdjustmentFn(mcResult.finalP50, years) : mcResult.finalP50)
                    : (inflationEnabled && todaysDollarsValue ? todaysDollarsValue : (projection?.finalValueUSD || 0)))
            }
            defaultInflationRate={inflationRate}
            defaultVolatility={mcVolatility}
            defaultSimulations={mcSimulations}
            resetKey={resetKey}
          />
        )}
      </main>

      <footer className="footer">
        <div className="footer-brand">
          <img src="/icons/icon.svg" alt="RetireOnSol" className="footer-logo" />
          <span className="footer-name">RetireOnSol</span>
        </div>
        <div className="footer-links">
          <a href="/privacy" className="footer-link">Privacy Policy</a>
          <span className="footer-divider">|</span>
          <a href="/terms" className="footer-link">Terms of Service</a>
          <span className="footer-divider">|</span>
          <button
            type="button"
            className="footer-link reset-link"
            onClick={resetSettings}
          >
            Reset Settings
          </button>
        </div>
        <div className="footer-disclaimer">
          <p>For educational and entertainment purposes only.</p>
          <p>Not financial advice. Projections are hypothetical and do not guarantee future results.</p>
          <p>Past performance does not indicate future returns. Always do your own research.</p>
        </div>
        <p className="footer-copyright">&copy; {new Date().getFullYear()} RetireOnSol. All rights reserved.</p>
        <p className="footer-version">v2.0.4</p>
      </footer>
    </div>
  );
}

export default App;
