import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { EditableSliderValue } from './EditableSliderValue';
import { useWallet } from '../contexts/WalletProvider';
import {
  calculateProjection,
  formatUSD,
  formatSOL,
  type ProjectionInput,
  type ProjectionResult,
  type GrowthModel,
  type GrowthModelParams,
} from '../utils/calculations';
import { calculateDCASchedule } from '../utils/dcaSchedule';
import { notificationService } from '../services/notificationService';
import { getModelDisplayName, getModelDescription, getFuturePowerLawFairValue, type CAGRDecayType } from '../utils/growthModels';
import { toTodaysDollars, type InflationParams } from '../utils/inflation';
import { runMonteCarloSimulation, type MonteCarloParams, type MonteCarloResult, type VolatilityDecayType } from '../utils/monteCarlo';
import { fetchSOLPrice, startPriceRefresh } from '../utils/solPrice';
import { loadSettings, saveSettings, clearSettings, saveActivePlan, loadActivePlan, clearActivePlan, DEFAULT_SETTINGS, type ActivePlan, type StoredSettings } from '../utils/storage';
import { shareProjection } from '../utils/shareImageAdvanced';
import { useDemoMode } from '../contexts/DemoContext';
import { DemoPanel } from './DemoPanel';
import { GrowthChart } from './GrowthChart';
import { ComparisonChart } from './ComparisonChart';
import { SpendTab } from './SpendTab';
import { CancelPlanModal } from './CancelPlanModal';
import { MonitorAccum } from './MonitorAccum';
import { MonitorDecum } from './MonitorDecum';
import { TipFooter } from './TipFooter';
import { LeaderboardOptIn } from './LeaderboardOptIn';
import { Leaderboard } from './Leaderboard';
import { isLeaderboardOptedIn, setLeaderboardOptIn, setSeekerID, setSeekerName } from '../utils/leaderboardScore';
import { clearAppUsed } from '../hooks/useBiometricLock';
import { version as APP_VERSION } from '../../package.json';
import './AdvancedMode.css';

type DCAFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly';
type MainTab = 'plan' | 'monitor' | 'leaderboard';
type PlanSubTab = 'grow' | 'spend';
type MonitorSubTab = 'accum' | 'decum';

interface AdvancedModeProps {
  initialSOL?: number;
  initialDCA?: number;
  initialYears?: number;
}

/** Inline-editable value for sliders. Tap the green number to type.
 *  A transparent input sits over the text so the tap directly focuses it,
 *  opening the keyboard on mobile. The visible text updates live. */

export function AdvancedMode(_props: AdvancedModeProps) {
  // Load initial settings from localStorage on each mount
  const [initialSettings] = useState(() => loadSettings());
  const demo = useDemoMode();

  // Wallet connection
  const { connected, address, balance: walletBalance, jitoBalance: walletJitoSolBalance, connect: connectWallet, disconnect, isRefreshing: walletLoading, refreshBalance, accountLabel } = useWallet();

  // Tab state — persisted to localStorage
  const [mainTab, setMainTab] = useState<MainTab>(() => {
    try {
      const saved = localStorage.getItem('retireonsol_mainTab');
      if (saved === 'plan' || saved === 'monitor') return saved;
      if (saved === 'leaderboard' && isLeaderboardOptedIn()) return saved;
    } catch { /* ignore */ }
    return 'plan';
  });
  const [planSubTab, setPlanSubTab] = useState<PlanSubTab>(() => {
    try {
      const saved = localStorage.getItem('retireonsol_planSubTab');
      if (saved === 'grow' || saved === 'spend') return saved;
    } catch { /* ignore */ }
    return 'grow';
  });
  const [monitorSubTab, setMonitorSubTab] = useState<MonitorSubTab>(() => {
    try {
      const saved = localStorage.getItem('retireonsol_monitorSubTab');
      if (saved === 'accum' || saved === 'decum') return saved;
    } catch { /* ignore */ }
    return 'accum';
  });

  useEffect(() => {
    try { localStorage.setItem('retireonsol_mainTab', mainTab); } catch { /* ignore */ }
  }, [mainTab]);
  useEffect(() => {
    try { localStorage.setItem('retireonsol_planSubTab', planSubTab); } catch { /* ignore */ }
  }, [planSubTab]);
  useEffect(() => {
    try { localStorage.setItem('retireonsol_monitorSubTab', monitorSubTab); } catch { /* ignore */ }
  }, [monitorSubTab]);

  // Active plan state
  const [activePlan, setActivePlan] = useState<ActivePlan | null>(() => loadActivePlan());
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showExecuteModal, setShowExecuteModal] = useState(false);
  const [showLeaderboardOptIn, setShowLeaderboardOptIn] = useState(false);
  const [leaderboardOptedIn, setLeaderboardOptedIn] = useState(isLeaderboardOptedIn);

  // Spend Now mode
  const [spendNowMode, setSpendNowMode] = useState(false);

  // Form state (with localStorage defaults)
  const [currentSOL, setCurrentSOL] = useState<number>(initialSettings.currentSOL ?? DEFAULT_SETTINGS.currentSOL);
  const [currentJitoSOL, setCurrentJitoSOL] = useState<number>(initialSettings.currentJitoSOL ?? DEFAULT_SETTINGS.currentJitoSOL);
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

  // Calculate dynamic ceiling for S-curve
  const dynamicCeiling = useMemo(() => {
    if (currentPrice === null) return 50000;
    const slope = modelParams.powerLawSlope || 1.6;
    const todayFairValue = getFuturePowerLawFairValue(0, slope);
    const futureFairValue = getFuturePowerLawFairValue(years, slope);
    const growthMultiplier = futureFairValue / todayFairValue;
    const normalizedCeiling = currentPrice * growthMultiplier;
    return Math.round(normalizedCeiling / 1000) * 1000;
  }, [years, modelParams.powerLawSlope, currentPrice]);

  const [compareMode, setCompareMode] = useState(false);
  const [growthModelExpanded, setGrowthModelExpanded] = useState(false);

  // Inflation & Debasement state (with localStorage defaults)
  const [inflationEnabled, setInflationEnabled] = useState(initialSettings.inflationEnabled ?? DEFAULT_SETTINGS.inflationEnabled);
  const [inflationExpanded, setInflationExpanded] = useState(false);
  const [jitoSOLExpanded, setJitoSOLExpanded] = useState(false);
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

  // JitoSOL staking state
  const [jitoSOLEnabled, setJitoSOLEnabled] = useState(initialSettings.jitoSOLEnabled ?? false);
  const [jitoSOLAPR, setJitoSOLAPR] = useState(initialSettings.jitoSOLAPR ?? 0.075);

  // Reset key - incremented when Reset All Settings is clicked to trigger SpendTab reset
  const [resetKey, setResetKey] = useState(0);

  // Wallet import state
  const [walletImported, setWalletImported] = useState(false);
  const [walletImportError, _setWalletImportError] = useState<string | null>(null);
  const walletImportTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pendingImport, setPendingImport] = useState(false);

  // Scroll to top on tab change
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [mainTab, planSubTab, monitorSubTab]);

  // Demo Mode: Check for due notifications when time advances
  const lastNotifiedRef = useRef<string | null>(null);

  useEffect(() => {
    if (demo.enabled && activePlan && demo.demoDate) {
      // No DCA reminders when DCA amount is zero (user just holding)
      if (activePlan.settings.dcaAmountUSD === 0) return;

      const schedule = calculateDCASchedule(
        activePlan.activatedAt,
        activePlan.settings.dcaFrequency,
        activePlan.settings.dcaAmountUSD,
        demo.demoDate
      );

      const latestDueDate = schedule.allDueDates[schedule.allDueDates.length - 1];

      if (latestDueDate) {
        const dateIso = latestDueDate.toISOString();
        if (dateIso !== lastNotifiedRef.current && !demo.completedDCAs.has(dateIso)) {
          notificationService.scheduleMissedDCAReminder(
            activePlan.settings.dcaAmountUSD,
            Math.max(0, Math.floor((demo.demoDate.getTime() - latestDueDate.getTime()) / (1000 * 60 * 60 * 24)))
          );
          lastNotifiedRef.current = dateIso;
        }
      }
    }
  }, [demo.demoDate, demo.enabled, activePlan, demo.completedDCAs]);

  // Demo Mode: Tip reminder every 7 demo-days
  const lastTipWeekRef = useRef<number>(-1);

  useEffect(() => {
    if (demo.enabled && activePlan && demo.demoDate) {
      const daysSinceActivation = Math.floor(
        (demo.demoDate.getTime() - new Date(activePlan.activatedAt).getTime()) / (1000 * 60 * 60 * 24)
      );
      const weekNumber = Math.floor(daysSinceActivation / 7);
      if (weekNumber > 0 && weekNumber !== lastTipWeekRef.current) {
        lastTipWeekRef.current = weekNumber;
        // Fire tip notification immediately (1s delay) for demo
        const msgs = [
          { title: 'Enjoying RetireOnSol?', body: "Your plan is on track! If the app's helping, buy the dev a coffee — donate in the footer." },
          { title: 'Your SOL plan is working hard', body: "Built by an indie dev, not AI — Claude Code isn't getting a cent! Tip in the footer." },
          { title: 'Still stacking SOL?', body: 'If RetireOnSol is part of your routine, the dev would love a coffee. Donate in the footer!' },
          { title: 'Keep building that future!', body: "RetireOnSol is free and ad-free. Claude Code built it but the dev pays the bills — tip in the footer!" },
        ];
        const msg = msgs[weekNumber % msgs.length];
        console.log(`[Demo Tip] Week ${weekNumber}: firing tip notification`);
        notificationService.sendCustomNotification(msg.title, msg.body, 'dca_reminders', 'tip-reminder');
      }
    }
  }, [demo.demoDate, demo.enabled, activePlan]);

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
      } finally {
        setPriceLoading(false);
      }
    }
    loadPrice();

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
      currentJitoSOL,
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
      jitoSOLEnabled,
      jitoSOLAPR,
    });
  }, [
    currentSOL, currentJitoSOL, years, dcaAmountUSD, dcaMaxLimit, dcaFrequency,
    growthModel, modelParams,
    inflationEnabled, inflationType, inflationRate, inflationAmplitude, inflationCyclePeriod, debasementRate,
    mcEnabled, mcVolatility, mcVolatilityDecay, mcSimulations,
    jitoSOLEnabled, jitoSOLAPR,
  ]);

  // Reset all settings to defaults — full factory reset
  const resetSettings = useCallback(async () => {
    if (window.confirm('Reset everything to defaults? This will disconnect your wallet, clear all data, and cannot be undone.')) {
      // Disconnect wallet
      if (connected) {
        try { await disconnect(); } catch { /* ignore */ }
      }

      // Clear all retireonsol localStorage keys
      clearSettings();
      clearActivePlan();
      clearAppUsed();
      try {
        localStorage.removeItem('retireonsol_mode');
        localStorage.removeItem('retireonsol_mainTab');
        localStorage.removeItem('retireonsol_planSubTab');
        localStorage.removeItem('retireonsol_monitorSubTab');
        localStorage.removeItem('retireonsol_price_baseline');
        localStorage.removeItem('retireonsol_price_alert_cooldown');
        localStorage.removeItem('retireonsol_sol_price');
      } catch { /* ignore */ }

      // Clear MWA wallet keys (not prefixed with retireonsol_)
      try {
        localStorage.removeItem('mwa_address');
        localStorage.removeItem('mwa_auth_token');
        localStorage.removeItem('mwa_account_label');
      } catch { /* ignore */ }

      // Reset all state to defaults
      setCurrentSOL(DEFAULT_SETTINGS.currentSOL);
      setCurrentJitoSOL(DEFAULT_SETTINGS.currentJitoSOL);
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
      setJitoSOLEnabled(false);
      setJitoSOLAPR(0.075);
      setActivePlan(null);

      // Clear leaderboard state
      setLeaderboardOptIn(false);
      setSeekerID(null);
      setSeekerName(null);
      setLeaderboardOptedIn(false);
      setShowLeaderboardOptIn(false);

      // Reset tab state to defaults
      setMainTab('plan');
      setPlanSubTab('grow');
      setMonitorSubTab('accum');

      setResetKey(k => k + 1);
    }
  }, [connected, disconnect]);

  // Execute Plan handler - saves current settings as active plan
  const executePlan = useCallback(() => {
    const latestSettings = loadSettings();

    const currentSettings: StoredSettings = {
      currentSOL,
      currentJitoSOL,
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
      jitoSOLEnabled,
      jitoSOLAPR,
      spendMonthlyIncome: latestSettings.spendMonthlyIncome ?? DEFAULT_SETTINGS.spendMonthlyIncome,
      spendMonthlyIncomeMax: latestSettings.spendMonthlyIncomeMax ?? DEFAULT_SETTINGS.spendMonthlyIncomeMax,
      spendRetirementYears: latestSettings.spendRetirementYears ?? DEFAULT_SETTINGS.spendRetirementYears,
      spendVolatility: latestSettings.spendVolatility ?? DEFAULT_SETTINGS.spendVolatility,
      spendRealGrowthRate: latestSettings.spendRealGrowthRate ?? DEFAULT_SETTINGS.spendRealGrowthRate,
      spendInflationRate: latestSettings.spendInflationRate ?? DEFAULT_SETTINGS.spendInflationRate,
      spendSimulations: latestSettings.spendSimulations ?? DEFAULT_SETTINGS.spendSimulations,
    };
    const plan: ActivePlan = {
      activatedAt: new Date().toISOString(),
      settings: currentSettings,
      startPhase: spendNowMode ? 'decum' : 'accum',
    };
    saveActivePlan(plan);
    setActivePlan(plan);
    setShowExecuteModal(false);
    setMainTab('monitor');
    setMonitorSubTab('accum');
    // Show leaderboard opt-in if not already opted in
    if (!isLeaderboardOptedIn()) {
      setShowLeaderboardOptIn(true);
    }
  }, [currentSOL, currentJitoSOL, years, dcaAmountUSD, dcaMaxLimit, dcaFrequency, growthModel, modelParams, inflationEnabled, inflationType, inflationRate, inflationAmplitude, inflationCyclePeriod, debasementRate, mcEnabled, mcVolatility, mcVolatilityDecay, mcSimulations, jitoSOLEnabled, jitoSOLAPR, spendNowMode]);

  // Cancel execution handler (confirmed from modal)
  const cancelExecution = useCallback(() => {
    clearActivePlan();
    setActivePlan(null);
    setShowCancelModal(false);
    setMainTab('plan');
  }, []);

  // When wallet connects and we have a pending import, do the import
  useEffect(() => {
    if (pendingImport && connected && !walletLoading) {
      if (walletBalance !== null) {
        setCurrentSOL(walletBalance);
        setCurrentJitoSOL(walletJitoSolBalance ?? 0);
        setPendingImport(false);
        setWalletImported(true);
        if (walletImportTimerRef.current) clearTimeout(walletImportTimerRef.current);
        walletImportTimerRef.current = setTimeout(() => setWalletImported(false), 3000);
      }
    }
  }, [pendingImport, connected, walletLoading, walletBalance, walletJitoSolBalance]);

  // Import from wallet handler
  const importFromWallet = useCallback(() => {
    if (demo.enabled) {
      setCurrentSOL(demo.solBalance);
      setCurrentJitoSOL(demo.jitoSolBalance);
      setWalletImported(true);
      if (walletImportTimerRef.current) clearTimeout(walletImportTimerRef.current);
      walletImportTimerRef.current = setTimeout(() => setWalletImported(false), 3000);
      return;
    }

    if (connected && walletBalance !== null) {
      setCurrentSOL(walletBalance);
      setCurrentJitoSOL(walletJitoSolBalance ?? 0);
      setWalletImported(true);
      if (walletImportTimerRef.current) clearTimeout(walletImportTimerRef.current);
      walletImportTimerRef.current = setTimeout(() => setWalletImported(false), 3000);
    } else if (connected) {
      // Connected but balance not fetched yet — refresh, don't re-connect
      setPendingImport(true);
      refreshBalance();
    } else {
      setPendingImport(true);
      connectWallet();
    }
  }, [connected, walletBalance, walletJitoSolBalance, connectWallet, refreshBalance, demo.enabled, demo.solBalance, demo.jitoSolBalance]);

  // Effective model params with dynamic ceiling
  const effectiveModelParams = useMemo(() => ({
    ...modelParams,
    sCurveMaxPrice: dynamicCeiling,
  }), [modelParams, dynamicCeiling]);

  // Calculate projections
  const effectiveSOL = jitoSOLEnabled ? currentSOL + currentJitoSOL : currentSOL + currentJitoSOL;
  const projection = useMemo<ProjectionResult | null>(() => {
    if (currentPrice === null) return null;
    const input: ProjectionInput = {
      currentSOL: effectiveSOL,
      currentPrice,
      years,
      dcaAmountUSD,
      dcaFrequency,
      growthModel,
      modelParams: effectiveModelParams,
      jitoSOLEnabled,
      jitoSOLAPR,
    };
    return calculateProjection(input);
  }, [effectiveSOL, currentPrice, years, dcaAmountUSD, dcaFrequency, growthModel, effectiveModelParams, jitoSOLEnabled, jitoSOLAPR]);

  // Inflation params
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

  // Inflation adjustment function
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

  // Monte Carlo simulation results
  const [mcResult, setMcResult] = useState<MonteCarloResult | null>(null);

  useEffect(() => {
    if (!mcEnabled || currentPrice === null) {
      setMcResult(null);
      setMcCalculating(false);
      return;
    }

    setMcCalculating(true);
    const timeoutId = setTimeout(() => {
      const result = runMonteCarloSimulation(
        effectiveSOL,
        currentPrice,
        years,
        dcaAmountUSD,
        dcaFrequency,
        growthModel,
        effectiveModelParams,
        mcParams,
        jitoSOLEnabled,
        jitoSOLAPR
      );
      setMcResult(result);
      setMcCalculating(false);
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [mcEnabled, effectiveSOL, currentPrice, years, dcaAmountUSD, dcaFrequency, growthModel, effectiveModelParams, mcParams, jitoSOLEnabled, jitoSOLAPR]);

  if (priceLoading) {
    return <div className="advanced-loading">Loading price data...</div>;
  }

  return (
    <div className="advanced-mode">
      {/* Main Tabs */}
      <div className="main-tabs">
        <button
          className={`main-tab-btn ${mainTab === 'plan' ? 'active' : ''}`}
          onClick={() => setMainTab('plan')}
        >
          Plan
        </button>
        <button
          className={`main-tab-btn ${mainTab === 'monitor' ? 'active' : ''}`}
          onClick={() => setMainTab('monitor')}
        >
          Monitor
          {activePlan && <span className="active-plan-badge">Active</span>}
        </button>
        {activePlan && (
          <button
            className={`main-tab-btn ${mainTab === 'leaderboard' ? 'active' : ''}`}
            onClick={() => setMainTab('leaderboard')}
          >
            Board
          </button>
        )}
      </div>

      {/* Plan Tab */}
      {mainTab === 'plan' && (
        <>
          {/* Plan Sub-tabs */}
          <div className="sub-tabs">
            <button
              className={`sub-tab-btn ${planSubTab === 'grow' ? 'active' : ''}`}
              onClick={() => setPlanSubTab('grow')}
            >
              Grow
            </button>
            <button
              className={`sub-tab-btn ${planSubTab === 'spend' ? 'active' : ''}`}
              onClick={() => setPlanSubTab('spend')}
            >
              Spend
            </button>
          </div>

          {/* Wallet card */}
          {!demo.enabled && (
            <div className="card" style={{ padding: '0.75rem 1rem', marginBottom: '1rem' }}>
              <div className="wallet-badge-group">
                {connected && address ? (
                  <>
                    <div className="wallet-badge">
                      <span className="wallet-dot"></span>
                      <span title={address}>
                        {accountLabel || `${address.slice(0, 4)}...${address.slice(-4)}`}
                      </span>
                    </div>
                    <button type="button" className="link-btn" onClick={importFromWallet}
                      disabled={walletLoading}
                      style={{ padding: '0 8px', fontSize: '0.7rem', height: '100%' }}>
                      {walletLoading ? 'Loading...' : 'Import Balance'}
                    </button>
                    <button type="button" className="disconnect-btn" onClick={() => disconnect()}
                      title="Disconnect Wallet">×</button>
                  </>
                ) : (
                  <button type="button" className="link-btn" onClick={() => connectWallet()}
                    disabled={walletLoading}
                    style={{ padding: '0 8px', fontSize: '0.7rem', height: '100%', width: '100%', textAlign: 'center' }}>
                    {walletLoading ? 'Connecting...' : 'Connect Wallet'}
                  </button>
                )}
              </div>
            </div>
          )}

          {walletImported && (
            <div className="wallet-imported-notice">✓ Balance imported</div>
          )}

          {/* Editing mode warning when active plan exists */}
          {activePlan && (
            <div style={{
              background: 'rgba(245, 166, 35, 0.1)',
              border: '1px solid rgba(245, 166, 35, 0.3)',
              borderRadius: '8px',
              padding: '12px',
              marginBottom: '16px',
              fontSize: '0.9rem',
              color: '#F5A623',
              display: 'flex',
              alignItems: 'center',
              gap: '12px'
            }}>
              <span style={{ fontSize: '1.2rem' }}>📝</span>
              <div>
                <strong>Editing Mode</strong>
                <div style={{ fontSize: '0.8rem', opacity: 0.9 }}>
                  You have an active plan running. Changes made here won't affect your tracked plan unless you click <strong>Execute Plan</strong> again.
                </div>
              </div>
            </div>
          )}

          {/* Grow Sub-tab Content */}
          {planSubTab === 'grow' && (
            <>
              {/* Holdings Section */}
              <section className="adv-section">
                <div className="holdings-header">
                  <h2>Your SOL Holdings</h2>
                </div>
                {walletImportError && (
                  <div style={{
                    background: 'rgba(255, 107, 107, 0.1)',
                    border: '1px solid rgba(255, 107, 107, 0.3)',
                    borderRadius: '6px',
                    padding: '6px 10px',
                    marginBottom: '10px',
                    fontSize: '0.8rem',
                    color: '#FF6B6B',
                    textAlign: 'center',
                  }}>
                    {walletImportError}
                  </div>
                )}

                <div className="input-row">
                  <div className="input-group">
                    <label htmlFor="currentSOL">Current SOL</label>
                    <input
                      id="currentSOL"
                      type="number"
                      min="0"
                      step="1"
                      value={currentSOL || ''}
                      onChange={(e) => setCurrentSOL(e.target.value === '' ? 0 : Number(e.target.value))}
                      onBlur={(e) => { if (e.target.value === '') setCurrentSOL(0); }}
                      placeholder="0"
                    />
                  </div>

                  <div className="input-group">
                    <label htmlFor="currentJitoSOL">Current JitoSOL</label>
                    <input
                      id="currentJitoSOL"
                      type="number"
                      min="0"
                      step="0.01"
                      value={currentJitoSOL || ''}
                      onChange={(e) => setCurrentJitoSOL(e.target.value === '' ? 0 : Number(e.target.value))}
                      onBlur={(e) => { if (e.target.value === '') setCurrentJitoSOL(0); }}
                      placeholder="0"
                    />
                  </div>
                </div>

                <div className="price-display">
                  Current Price: {priceLoading ? (
                    <span className="price-loading">Loading...</span>
                  ) : priceError ? (
                    <span className="price-value">${currentPrice?.toFixed(2)} <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>(fallback)</span></span>
                  ) : (
                    <span className="price-value">${currentPrice?.toFixed(2)} <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>live</span></span>
                  )}
                </div>

                {currentPrice !== null && (
                  <div className="current-value-display">
                    Current Value: <span className="highlight">{formatUSD((currentSOL + currentJitoSOL) * currentPrice)}</span>
                    {currentJitoSOL > 0 && (
                      <span className="value-breakdown" style={{ fontSize: '0.8rem', opacity: 0.7, marginLeft: '6px' }}> ({currentSOL} SOL + {currentJitoSOL} JitoSOL)</span>
                    )}
                  </div>
                )}
              </section>

              {/* Spend Now Toggle */}
              <section className="adv-section spend-now-section">
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
                    <span className="toggle-summary">
                      {spendNowMode ? 'Skip to Spend tab with current holdings' : 'Plan accumulation before spending'}
                    </span>
                  </div>
                </div>
              </section>

              {!spendNowMode && (
                <>
                  {/* Accumulation Plan */}
                  <section className="adv-section">
                    <h2>Accumulation Plan</h2>

                    <div className="input-group slider-group">
                      <label htmlFor="years">Years to Retirement: <EditableSliderValue value={years} min={1} max={40} step={1} onChange={setYears} /></label>
                      <input
                        id="years"
                        type="range"
                        min="1"
                        max="40"
                        value={years}
                        onChange={(e) => setYears(Number(e.target.value))}
                      />
                      <div className="slider-labels">
                        <span>1</span>
                        <span>40</span>
                      </div>
                    </div>

                    <div className="input-group slider-group">
                      <label htmlFor="dcaAmountUSD">DCA per Period: <EditableSliderValue value={dcaAmountUSD} min={0} max={dcaMaxLimit} step={dcaMaxLimit <= 1000 ? 10 : 50} prefix="$" onChange={setDcaAmountUSD} /></label>
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

                    <div className="input-group" style={dcaAmountUSD === 0 ? { opacity: 0.35, pointerEvents: 'none' } : undefined}>
                      <label>Frequency{dcaAmountUSD === 0 ? ' (no DCA)' : ''}</label>
                      <div className="frequency-buttons">
                        {(['daily', 'weekly', 'monthly', 'yearly'] as DCAFrequency[]).map((freq) => (
                          <button
                            key={freq}
                            type="button"
                            className={`freq-btn ${dcaFrequency === freq ? 'active' : ''}`}
                            onClick={() => setDcaFrequency(freq)}
                            disabled={dcaAmountUSD === 0}
                          >
                            {freq.charAt(0).toUpperCase() + freq.slice(1)}
                          </button>
                        ))}
                      </div>
                    </div>
                  </section>

                  {/* Growth Model */}
                  <section className="adv-section">
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

                    <button
                      type="button"
                      className={`params-toggle ${growthModelExpanded ? 'expanded' : ''}`}
                      onClick={() => setGrowthModelExpanded(!growthModelExpanded)}
                    >
                      <span className="params-toggle-label">Parameters</span>
                      <span className="params-toggle-summary">
                        {growthModel === 'cagr' && `${Math.round((modelParams.cagr || 0.25) * 100)}%${modelParams.cagrDecay === 'auto' ? ' + auto decay' : ''}`}
                        {growthModel === 'powerlaw' && `slope ${(modelParams.powerLawSlope || 1.6).toFixed(1)}`}
                        {growthModel === 'scurve' && `$${(dynamicCeiling / 1000).toFixed(0)}K ceiling`}
                      </span>
                      <span className={`toggle-arrow ${growthModelExpanded ? 'expanded' : ''}`}>▼</span>
                    </button>

                    <div className={`growth-params-content ${growthModelExpanded ? 'expanded' : ''}`}>
                      {growthModel === 'cagr' && (
                        <>
                          <div className="input-group slider-group">
                            <label htmlFor="cagr">Starting Growth Rate: <EditableSliderValue value={Math.round((modelParams.cagr || 0.25) * 100)} min={0} max={100} step={1} suffix="%" onChange={(v) => setModelParams({ ...modelParams, cagr: v / 100 })} /></label>
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
                              <span>100%</span>
                            </div>
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
                          </div>
                        </>
                      )}

                      {growthModel === 'powerlaw' && (
                        <div className="input-group slider-group">
                          <label htmlFor="powerLawSlope">Power Law Slope: <EditableSliderValue value={parseFloat((modelParams.powerLawSlope || 1.6).toFixed(1))} min={1} max={3} step={0.1} onChange={(v) => setModelParams({ ...modelParams, powerLawSlope: v })} /></label>
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
                            <span>3.0</span>
                          </div>
                        </div>
                      )}

                      {growthModel === 'scurve' && (
                        <div className="input-group slider-group">
                          <label htmlFor="sCurveYearsToHalfRemaining">Years to 50% of Remaining: <EditableSliderValue value={modelParams.sCurveYearsToHalfRemaining || 12} min={5} max={30} step={1} suffix=" years" onChange={(v) => setModelParams({ ...modelParams, sCurveYearsToHalfRemaining: v })} /></label>
                          <input
                            id="sCurveYearsToHalfRemaining"
                            type="range"
                            min="5"
                            max="30"
                            value={modelParams.sCurveYearsToHalfRemaining || 12}
                            onChange={(e) => setModelParams({ ...modelParams, sCurveYearsToHalfRemaining: Number(e.target.value) })}
                          />
                          <div className="slider-labels">
                            <span>5 years</span>
                            <span>30 years</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </section>

                  {/* JitoSOL Staking */}
                  <section className="adv-section collapsible-section">
                    <div className={`section-toggle ${jitoSOLEnabled ? 'enabled' : ''} ${jitoSOLExpanded ? 'expanded-below' : ''}`}>
                      <label className="toggle-switch">
                        <input
                          type="checkbox"
                          checked={jitoSOLEnabled}
                          onChange={(e) => setJitoSOLEnabled(e.target.checked)}
                        />
                        <span className="toggle-slider"></span>
                      </label>
                      <div className="toggle-text">
                        <span className="toggle-label">Stake to JitoSOL</span>
                        <span className="toggle-summary">
                          {!jitoSOLEnabled ? 'Off' : `~${(jitoSOLAPR * 100).toFixed(1)}% APR`}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="toggle-arrow-btn"
                        onClick={() => setJitoSOLExpanded(!jitoSOLExpanded)}
                      >
                        <span className={`toggle-arrow ${jitoSOLExpanded ? 'expanded' : ''}`}>▼</span>
                      </button>
                    </div>

                    <div className={`section-content ${jitoSOLExpanded ? 'expanded' : ''}`}>
                      <div className="input-group slider-group">
                        <label htmlFor="jitoSOLAPR">JitoSOL APR: <EditableSliderValue value={parseFloat((jitoSOLAPR * 100).toFixed(1))} min={3} max={12} step={0.5} suffix="%" onChange={(v) => setJitoSOLAPR(v / 100)} /></label>
                        <input
                          id="jitoSOLAPR"
                          type="range"
                          min="3"
                          max="12"
                          step="0.5"
                          value={jitoSOLAPR * 100}
                          onChange={(e) => setJitoSOLAPR(Number(e.target.value) / 100)}
                        />
                        <div className="slider-labels">
                          <span>3%</span>
                          <span>12%</span>
                        </div>
                      </div>
                    </div>
                  </section>

                  {/* Inflation & Debasement */}
                  <section className="adv-section collapsible-section">
                    <div className={`section-toggle ${inflationEnabled ? 'enabled' : ''} ${inflationExpanded ? 'expanded-below' : ''}`}>
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
                        <span className="toggle-summary">
                          {!inflationEnabled ? 'Off' : `${(inflationRate * 100).toFixed(1)}%${debasementRate > 0 ? ` + ${(debasementRate * 100).toFixed(0)}% debasement` : ''}`}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="toggle-arrow-btn"
                        onClick={() => setInflationExpanded(!inflationExpanded)}
                      >
                        <span className={`toggle-arrow ${inflationExpanded ? 'expanded' : ''}`}>▼</span>
                      </button>
                    </div>

                    <div className={`section-content ${inflationExpanded ? 'expanded' : ''}`}>
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
                      </div>

                      <div className="input-group slider-group">
                        <label htmlFor="inflationRate">
                          {inflationType === 'linear' ? 'Inflation Rate' : 'Base Inflation'}: <EditableSliderValue value={parseFloat((inflationRate * 100).toFixed(1))} min={0} max={10} step={0.5} suffix="%" onChange={(v) => setInflationRate(v / 100)} />
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
                          <span>10%</span>
                        </div>
                      </div>

                      {inflationType === 'cyclical' && (
                        <>
                          <div className="input-group slider-group">
                            <label htmlFor="inflationAmplitude">Cycle Amplitude: {'\u00B1'}<EditableSliderValue value={parseFloat((inflationAmplitude * 100).toFixed(1))} min={0} max={5} step={0.5} suffix="%" onChange={(v) => setInflationAmplitude(v / 100)} /></label>
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
                              <span>{'\u00B1'}5%</span>
                            </div>
                          </div>

                          <div className="input-group slider-group">
                            <label htmlFor="inflationCycle">Cycle Period: <EditableSliderValue value={inflationCyclePeriod} min={4} max={12} step={1} suffix=" years" onChange={setInflationCyclePeriod} /></label>
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
                              <span>12 yrs</span>
                            </div>
                          </div>
                        </>
                      )}

                      <div className="input-group slider-group">
                        <label htmlFor="debasement">Currency Debasement: <EditableSliderValue value={parseFloat((debasementRate * 100).toFixed(1))} min={0} max={15} step={0.5} suffix="%" onChange={(v) => setDebasementRate(v / 100)} /></label>
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
                          <span>15%</span>
                        </div>
                      </div>
                    </div>
                  </section>

                  {/* Monte Carlo Simulation */}
                  <section className="adv-section collapsible-section">
                    <div className={`section-toggle ${mcEnabled ? 'enabled' : ''} ${mcExpanded ? 'expanded-below' : ''}`}>
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
                        <span className="toggle-summary">
                          {!mcEnabled ? 'Off' : `${Math.round(mcVolatility * 100)}% vol, ${mcSimulations} sims`}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="toggle-arrow-btn"
                        onClick={() => setMcExpanded(!mcExpanded)}
                      >
                        <span className={`toggle-arrow ${mcExpanded ? 'expanded' : ''}`}>▼</span>
                      </button>
                    </div>

                    <div className={`section-content ${mcExpanded ? 'expanded' : ''}`}>
                      <div className="input-group slider-group">
                        <label htmlFor="mcVolatility">Starting Volatility: <EditableSliderValue value={Math.round(mcVolatility * 100)} min={20} max={150} step={5} suffix="%" onChange={(v) => setMcVolatility(v / 100)} /></label>
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
                          <span>150%</span>
                        </div>
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
                      </div>

                      <div className="input-group slider-group">
                        <label htmlFor="mcSimulations">Simulations: <EditableSliderValue value={mcSimulations} min={100} max={2000} step={100} onChange={setMcSimulations} /></label>
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
                          <span>2000</span>
                        </div>
                      </div>
                    </div>
                  </section>
                </>
              )}

              {/* Results Section - Show when on Grow sub-tab and not spendNow */}
              {!spendNowMode && projection && (
                <section className="adv-section results-section">
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
                        currentSOL: effectiveSOL,
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

                  <div className="summary-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: '0.9rem', borderTop: '1px solid rgba(255,255,255,0.1)', marginTop: '8px' }}>
                    <div className="summary-item">
                      <span className="item-label" style={{ opacity: 0.7 }}>Total Invested: </span>
                      <span className="item-value">{formatUSD(projection.totalInvestedUSD)}</span>
                    </div>
                    <div className="summary-item">
                      <span className="item-label" style={{ opacity: 0.7 }}>{mcEnabled ? "Median Gain: " : (inflationEnabled ? "Real Gain: " : "Total Gain: ")}</span>
                      <span className="item-value gain" style={{ color: '#14F195' }}>
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

                  {projection.projections && projection.projections.length > 0 && (
                    <div className="chart-container">
                      {mcCalculating && (
                        <div className="mc-loading-overlay" style={{
                          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: 'rgba(0,0,0,0.5)', zIndex: 10, borderRadius: '8px',
                          gap: '8px', fontSize: '0.9rem',
                        }}>
                          <div className="mc-spinner"></div>
                          <span>Running simulations...</span>
                        </div>
                      )}
                      <div className="chart-mode-toggle" style={{ display: 'flex', gap: '4px', marginBottom: '8px' }}>
                        <button
                          type="button"
                          className={`mode-btn ${!compareMode ? 'active' : ''}`}
                          onClick={() => setCompareMode(false)}
                          style={{
                            padding: '4px 12px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.2)',
                            background: !compareMode ? 'var(--sol-purple)' : 'transparent',
                            color: '#fff', cursor: 'pointer', fontSize: '0.8rem',
                          }}
                        >
                          Single Model
                        </button>
                        <button
                          type="button"
                          className={`mode-btn ${compareMode ? 'active' : ''}`}
                          onClick={() => setCompareMode(true)}
                          style={{
                            padding: '4px 12px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.2)',
                            background: compareMode ? 'var(--sol-purple)' : 'transparent',
                            color: '#fff', cursor: 'pointer', fontSize: '0.8rem',
                          }}
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
                          mcResult={mcEnabled ? mcResult : null}
                          inflationAdjustment={inflationEnabled ? inflationAdjustmentFn : undefined}
                          showRealValue={inflationEnabled}
                        />
                      )}
                    </div>
                  )}

                  {/* Year-by-Year Table */}
                  <div className="projection-table" style={{ marginTop: '1.5rem' }}>
                    <h3>
                      Year-by-Year Breakdown
                      {mcEnabled && <span style={{ fontSize: '0.8rem', opacity: 0.7 }}> (Median)</span>}
                      {inflationEnabled && !mcEnabled && <span style={{ fontSize: '0.8rem', opacity: 0.7 }}> (Today's Dollars)</span>}
                      {inflationEnabled && mcEnabled && <span style={{ fontSize: '0.8rem', opacity: 0.7 }}> (Today's Dollars)</span>}
                    </h3>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.2)' }}>
                          <th style={{ textAlign: 'left', padding: '8px 4px' }}>Year</th>
                          <th style={{ textAlign: 'right', padding: '8px 4px' }}>SOL</th>
                          <th style={{ textAlign: 'right', padding: '8px 4px' }}>Price</th>
                          <th style={{ textAlign: 'right', padding: '8px 4px' }}>{mcEnabled ? "Median Value" : (inflationEnabled ? "Real Value" : "Value")}</th>
                          <th style={{ textAlign: 'right', padding: '8px 4px' }}>Invested</th>
                        </tr>
                      </thead>
                      <tbody>
                        {projection.projections
                          .map((p, i) => ({ p, i }))
                          .filter(({ i }) => i % 5 === 4 || i === 0)
                          .map(({ p, i }) => {
                            const mcPercentile = mcEnabled && mcResult?.percentiles[i];
                            const displayValue = mcPercentile
                              ? (inflationEnabled ? inflationAdjustmentFn(mcPercentile.p50, p.year) : mcPercentile.p50)
                              : (inflationEnabled ? inflationAdjustmentFn(p.portfolioValueUSD, p.year) : p.portfolioValueUSD);

                            return (
                              <tr key={p.year} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                <td style={{ padding: '6px 4px' }}>{p.year}</td>
                                <td style={{ textAlign: 'right', padding: '6px 4px' }}>{formatSOL(p.solBalance)}</td>
                                <td style={{ textAlign: 'right', padding: '6px 4px' }}>${p.solPrice.toLocaleString()}</td>
                                <td style={{ textAlign: 'right', padding: '6px 4px' }}>{formatUSD(displayValue)}</td>
                                <td style={{ textAlign: 'right', padding: '6px 4px' }}>{formatUSD(p.totalInvestedUSD)}</td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {/* Navigation to Spend tab */}
              {!spendNowMode && (
                <div className="execute-plan-container" style={{ padding: '1rem 0' }}>
                  <button
                    type="button"
                    className="execute-plan-btn"
                    onClick={() => setPlanSubTab('spend')}
                    style={{ width: '100%', padding: '12px', background: 'transparent', border: '1px solid var(--sol-purple)', color: 'var(--sol-purple)', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '1rem' }}
                  >
                    Next: Plan Spend Strategy →
                  </button>
                </div>
              )}
            </>
          )}

          {/* Spend Sub-tab Content */}
          {planSubTab === 'spend' && (
            <>
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

              <div className="execute-plan-container" style={{ padding: '1rem 0', textAlign: 'center' }}>
                <button
                  type="button"
                  className="execute-plan-btn"
                  onClick={() => setShowExecuteModal(true)}
                  style={{
                    width: '100%', padding: '14px', background: 'linear-gradient(135deg, var(--sol-purple), var(--sol-green))',
                    border: 'none', borderRadius: '8px', color: '#fff', fontWeight: 'bold', cursor: 'pointer', fontSize: '1rem',
                  }}
                >
                  Execute Plan
                </button>
                <p style={{ fontSize: '0.8rem', opacity: 0.6, marginTop: '8px' }}>
                  Save your plan and start tracking progress
                </p>
              </div>
            </>
          )}
        </>
      )}

      {/* Monitor Tab */}
      {mainTab === 'monitor' && (
        <>
          {/* Monitor Sub-tabs */}
          <div className="sub-tabs">
            <button
              className={`sub-tab-btn ${monitorSubTab === 'accum' ? 'active' : ''}`}
              onClick={() => setMonitorSubTab('accum')}
            >
              Accum
            </button>
            <button
              className={`sub-tab-btn ${monitorSubTab === 'decum' ? 'active' : ''}`}
              onClick={() => setMonitorSubTab('decum')}
            >
              Decum
            </button>
          </div>

          {!activePlan ? (
            <section className="adv-section" style={{ textAlign: 'center', padding: '2rem 1rem' }}>
              <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>📋</div>
              <h2>No Active Plan</h2>
              <p style={{ opacity: 0.7, marginBottom: '1.5rem' }}>
                Go to the Plan tab to configure your accumulation and spending strategy, then click &quot;Execute Plan&quot; to start tracking.
              </p>
              <button
                type="button"
                onClick={() => setMainTab('plan')}
                style={{
                  padding: '12px 24px', background: 'var(--sol-purple)', border: 'none',
                  borderRadius: '8px', color: '#fff', fontWeight: 'bold', cursor: 'pointer', fontSize: '1rem',
                }}
              >
                Go to Plan →
              </button>
            </section>
          ) : (
            <>
              <section className="adv-section" style={{ padding: '12px' }}>
                <div style={{
                  background: 'rgba(20, 241, 149, 0.1)',
                  border: '1px solid rgba(20, 241, 149, 0.3)',
                  borderRadius: '8px',
                  padding: '10px 16px',
                  color: '#14F195',
                  fontWeight: 'bold',
                  textAlign: 'center',
                  fontSize: '0.9rem',
                }}>
                  Plan activated on {new Date(activePlan.activatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </div>
              </section>

              {/* Accum Sub-tab */}
              {monitorSubTab === 'accum' && (
                <section className="adv-section">
                  <h2>Accumulation Tracker</h2>
                  <div className="plan-summary-grid" style={{
                    display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '1rem',
                    fontSize: '0.85rem',
                  }}>
                    <div style={{ padding: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '6px' }}>
                      <span style={{ display: 'block', opacity: 0.6, fontSize: '0.75rem' }}>Starting SOL</span>
                      <span style={{ fontWeight: 'bold' }}>{activePlan.settings.currentSOL}</span>
                    </div>
                    <div style={{ padding: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '6px' }}>
                      <span style={{ display: 'block', opacity: 0.6, fontSize: '0.75rem' }}>Starting JitoSOL</span>
                      <span style={{ fontWeight: 'bold' }}>{activePlan.settings.currentJitoSOL}</span>
                    </div>
                    <div style={{ padding: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '6px' }}>
                      <span style={{ display: 'block', opacity: 0.6, fontSize: '0.75rem' }}>DCA Amount</span>
                      <span style={{ fontWeight: 'bold' }}>${activePlan.settings.dcaAmountUSD}/{activePlan.settings.dcaFrequency}</span>
                    </div>
                    <div style={{ padding: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '6px' }}>
                      <span style={{ display: 'block', opacity: 0.6, fontSize: '0.75rem' }}>Target Years</span>
                      <span style={{ fontWeight: 'bold' }}>{activePlan.settings.years}</span>
                    </div>
                    <div style={{ padding: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '6px' }}>
                      <span style={{ display: 'block', opacity: 0.6, fontSize: '0.75rem' }}>Growth Model</span>
                      <span style={{ fontWeight: 'bold' }}>{activePlan.settings.growthModel.toUpperCase()}</span>
                    </div>
                    <div style={{ padding: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '6px' }}>
                      <span style={{ display: 'block', opacity: 0.6, fontSize: '0.75rem' }}>JitoSOL Staking</span>
                      <span style={{ fontWeight: 'bold' }}>{activePlan.settings.jitoSOLEnabled ? `${(activePlan.settings.jitoSOLAPR * 100).toFixed(1)}% APR` : 'Off'}</span>
                    </div>
                  </div>

                  <div className="monitor-wallet-connect" style={{ marginBottom: '1rem' }}>
                    {demo.enabled ? (
                      <div className="wallet-imported-notice" style={{ textAlign: 'center', fontWeight: 'bold' }}>
                        Demo Wallet Connected
                      </div>
                    ) : connected ? (
                      <div className="wallet-badge-group">
                        <div className="wallet-badge">
                          <span className="wallet-dot"></span>
                          <span>{accountLabel || (address ? `${address.slice(0, 4)}...${address.slice(-4)}` : 'Connected')}</span>
                        </div>
                        <button className="disconnect-btn" onClick={() => disconnect()} title="Disconnect Wallet">×</button>
                      </div>
                    ) : (
                      <button className="btn-primary" onClick={() => connectWallet()} style={{ width: '100%' }}>
                        Connect Wallet
                      </button>
                    )}
                  </div>

                  <MonitorAccum
                    activePlan={activePlan}
                    walletSOL={walletBalance}
                    walletJitoSOL={walletJitoSolBalance}
                    currentPrice={currentPrice}
                    connected={demo.enabled || connected}
                    demoDate={demo.enabled ? demo.demoDate : null}
                    completedDCAs={demo.enabled ? demo.completedDCAs : undefined}
                    onMarkDCAComplete={demo.enabled ? demo.markDCAComplete : undefined}
                    onJoinLeaderboard={() => setShowLeaderboardOptIn(true)}
                    leaderboardOptedIn={leaderboardOptedIn}
                    onGoToLeaderboard={() => setMainTab('leaderboard')}
                  />
                </section>
              )}

              {/* Decum Sub-tab */}
              {monitorSubTab === 'decum' && (
                <section className="adv-section">
                  <h2>Decumulation Tracker</h2>
                  <div className="plan-summary-grid" style={{
                    display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '1rem',
                    fontSize: '0.85rem',
                  }}>
                    <div style={{ padding: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '6px' }}>
                      <span style={{ display: 'block', opacity: 0.6, fontSize: '0.75rem' }}>Monthly Income</span>
                      <span style={{ fontWeight: 'bold' }}>${activePlan.settings.spendMonthlyIncome?.toLocaleString() ?? 'N/A'}</span>
                    </div>
                    <div style={{ padding: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '6px' }}>
                      <span style={{ display: 'block', opacity: 0.6, fontSize: '0.75rem' }}>Retirement Years</span>
                      <span style={{ fontWeight: 'bold' }}>{activePlan.settings.spendRetirementYears ?? 'N/A'}</span>
                    </div>
                    <div style={{ padding: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '6px' }}>
                      <span style={{ display: 'block', opacity: 0.6, fontSize: '0.75rem' }}>Inflation Rate</span>
                      <span style={{ fontWeight: 'bold' }}>{activePlan.settings.spendInflationRate ? `${(activePlan.settings.spendInflationRate * 100).toFixed(1)}%` : 'N/A'}</span>
                    </div>
                  </div>

                  <div className="monitor-wallet-connect" style={{ marginBottom: '1rem' }}>
                    {demo.enabled ? (
                      <div className="wallet-imported-notice" style={{ textAlign: 'center', fontWeight: 'bold' }}>
                        Demo Wallet Connected
                      </div>
                    ) : connected ? (
                      <div className="wallet-badge-group">
                        <div className="wallet-badge">
                          <span className="wallet-dot"></span>
                          <span>{accountLabel || (address ? `${address.slice(0, 4)}...${address.slice(-4)}` : 'Connected')}</span>
                        </div>
                        <button className="disconnect-btn" onClick={() => disconnect()} title="Disconnect Wallet">×</button>
                      </div>
                    ) : (
                      <button className="btn-primary" onClick={() => connectWallet()} style={{ width: '100%' }}>
                        Connect Wallet
                      </button>
                    )}
                  </div>

                  <MonitorDecum
                    activePlan={activePlan}
                    walletSOL={walletBalance}
                    walletJitoSOL={walletJitoSolBalance}
                    currentPrice={currentPrice}
                    connected={demo.enabled || connected}
                    demoDate={demo.enabled ? demo.demoDate : null}
                  />
                </section>
              )}

              <div style={{ padding: '1rem 0', textAlign: 'center' }}>
                <button
                  type="button"
                  onClick={() => setShowCancelModal(true)}
                  style={{
                    padding: '10px 24px', background: 'transparent', border: '1px solid #555',
                    borderRadius: '8px', color: '#ccc', cursor: 'pointer', fontWeight: '600',
                  }}
                >
                  ← Back to Planning
                </button>
              </div>

              {showCancelModal && activePlan && (
                <CancelPlanModal
                  activePlan={activePlan}
                  currentPrice={currentPrice}
                  onConfirm={cancelExecution}
                  onClose={() => setShowCancelModal(false)}
                  demoDate={demo.enabled ? demo.demoDate : null}
                />
              )}
            </>
          )}
        </>
      )}

      {/* Leaderboard Tab */}
      {mainTab === 'leaderboard' && activePlan && (
        <section className="adv-section">
          <Leaderboard
            activePlan={activePlan}
            walletSOL={walletBalance ?? 0}
            walletJitoSOL={walletJitoSolBalance ?? 0}
            completedDCAs={demo.enabled ? demo.completedDCAs : new Set()}
          />
        </section>
      )}

      {/* Leaderboard Opt-In Modal */}
      {showLeaderboardOptIn && (
        <LeaderboardOptIn
          onJoin={() => {
            setLeaderboardOptIn(true);
            setLeaderboardOptedIn(true);
            setShowLeaderboardOptIn(false);
            setMainTab('leaderboard');
          }}
          onDismiss={() => setShowLeaderboardOptIn(false)}
        />
      )}

      {/* Execute Plan Modal */}
      {showExecuteModal && (
        <div className="cancel-modal-overlay" style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center',
          justifyContent: 'center', zIndex: 1000, padding: '1rem',
        }}>
          <div className="cancel-modal" style={{
            background: '#1a1a2e', border: '1px solid #14F195', borderRadius: '12px',
            maxWidth: '420px', width: '100%', boxShadow: '0 8px 40px rgba(20, 241, 149, 0.2)',
          }}>
            <div style={{
              padding: '16px', textAlign: 'center',
              background: 'rgba(20, 241, 149, 0.1)',
              borderBottom: '1px solid rgba(20, 241, 149, 0.2)',
              borderRadius: '12px 12px 0 0',
            }}>
              <div style={{ fontSize: '2rem' }}>🚀</div>
              <h2 style={{ color: '#14F195', margin: '8px 0 0' }}>Execute Plan?</h2>
            </div>
            <div style={{ padding: '20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                <div style={{ textAlign: 'center', padding: '12px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px' }}>
                  <div style={{ fontSize: '0.75rem', opacity: 0.6 }}>Accumulation</div>
                  <div style={{ fontWeight: 'bold', color: '#14F195' }}>{years} Years</div>
                  <div style={{ fontSize: '0.75rem', opacity: 0.7 }}>DCA {formatUSD(dcaAmountUSD)} / {dcaFrequency}</div>
                </div>
                <div style={{ textAlign: 'center', padding: '12px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px' }}>
                  <div style={{ fontSize: '0.75rem', opacity: 0.6 }}>Retirement</div>
                  <div style={{ fontWeight: 'bold', color: '#14F195' }}>
                    {loadSettings().spendRetirementYears ?? DEFAULT_SETTINGS.spendRetirementYears} Years
                  </div>
                  <div style={{ fontSize: '0.75rem', opacity: 0.7 }}>
                    Withdraw {formatUSD(loadSettings().spendMonthlyIncome ?? DEFAULT_SETTINGS.spendMonthlyIncome)}/mo
                  </div>
                </div>
              </div>
              <p style={{ fontSize: '0.9rem', color: '#ccc', textAlign: 'center', margin: '0 0 16px' }}>
                This will save your plan and start tracking your progress against these targets.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <button
                  type="button"
                  onClick={() => setShowExecuteModal(false)}
                  style={{
                    padding: '12px', background: 'transparent', border: '1px solid #555',
                    borderRadius: '8px', color: '#ccc', cursor: 'pointer', fontWeight: '600',
                  }}
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={executePlan}
                  style={{
                    padding: '12px', background: 'linear-gradient(135deg, var(--sol-purple), var(--sol-green))',
                    border: 'none', borderRadius: '8px', color: '#fff', fontWeight: 'bold', cursor: 'pointer',
                  }}
                >
                  Confirm & Execute
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer style={{
        marginTop: '3rem', padding: '2rem 1rem', borderTop: '1px solid rgba(255,255,255,0.1)',
        textAlign: 'center', fontSize: '0.8rem', opacity: 0.6,
      }}>
        <div style={{ marginBottom: '8px' }}>
          <a href={`${import.meta.env.BASE_URL}privacy`} style={{ color: 'inherit', textDecoration: 'none' }}>Privacy Policy</a>
          <span style={{ margin: '0 8px' }}>|</span>
          <a href={`${import.meta.env.BASE_URL}terms`} style={{ color: 'inherit', textDecoration: 'none' }}>Terms of Service</a>
          <span style={{ margin: '0 8px' }}>|</span>
          <button
            type="button"
            onClick={resetSettings}
            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', textDecoration: 'underline', fontSize: 'inherit' }}
          >
            Reset Settings
          </button>
        </div>
        <div style={{ marginBottom: '8px', lineHeight: 1.5 }}>
          <p style={{ margin: '2px 0' }}>For educational and entertainment purposes only.</p>
          <p style={{ margin: '2px 0' }}>Not financial advice. Projections are hypothetical and do not guarantee future results.</p>
          <p style={{ margin: '2px 0' }}>Past performance does not indicate future returns. Always do your own research.</p>
        </div>
        <p style={{ margin: '4px 0' }}>&copy; {new Date().getFullYear()} RetireOnSol. All rights reserved.</p>
        <p style={{ margin: '4px 0' }}>v{APP_VERSION}</p>
      </footer>

      <TipFooter />

      <DemoPanel />
    </div>
  );
}
