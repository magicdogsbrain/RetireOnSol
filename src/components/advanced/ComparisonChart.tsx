import { useState, useMemo } from 'react';
import {
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ComposedChart,
} from 'recharts';
import { calculateProjection, formatUSD, type ProjectionInput } from '../../utils/calculations';
import { runMonteCarloSimulation, type MonteCarloParams } from '../../utils/monteCarlo';
import type { GrowthModel, GrowthModelParams } from '../../utils/growthModels';

interface ComparisonChartProps {
  currentSOL: number;
  currentPrice: number;
  years: number;
  dcaAmountUSD: number;
  dcaFrequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
  modelParams: GrowthModelParams;
  inflationAdjustment?: (value: number, year: number) => number;
  showRealValue?: boolean;
  mcParams?: MonteCarloParams | null;
}

interface ComparisonDataPoint {
  year: number;
  cagr: number;
  powerlaw: number;
  scurve: number;
  invested: number;
}

const MODEL_COLORS: Record<GrowthModel, string> = {
  cagr: '#FF6B6B',
  powerlaw: '#9945FF',
  scurve: '#00C2FF',
};

const MODEL_NAMES: Record<GrowthModel, string> = {
  cagr: 'CAGR (25%)',
  powerlaw: 'Power Law',
  scurve: 'Asymptotic',
};

export function ComparisonChart({
  currentSOL,
  currentPrice,
  years,
  dcaAmountUSD,
  dcaFrequency,
  modelParams,
  inflationAdjustment,
  showRealValue,
  mcParams,
}: ComparisonChartProps) {
  const [useLogScale, setUseLogScale] = useState(false);

  const mcEnabled = mcParams?.enabled ?? false;

  // Calculate projections for all models (deterministic or MC median)
  const chartData = useMemo<ComparisonDataPoint[]>(() => {
    const models: GrowthModel[] = ['cagr', 'powerlaw', 'scurve'];
    const projections: Record<GrowthModel, number[]> = {
      cagr: [],
      powerlaw: [],
      scurve: [],
    };

    // Calculate each model's projections
    for (const model of models) {
      if (mcEnabled && mcParams) {
        // Run Monte Carlo and use median (p50)
        const mcResult = runMonteCarloSimulation(
          currentSOL,
          currentPrice,
          years,
          dcaAmountUSD,
          dcaFrequency,
          model,
          modelParams,
          mcParams
        );
        projections[model] = mcResult.percentiles.map((p) => p.p50);
      } else {
        // Deterministic projection
        const input: ProjectionInput = {
          currentSOL,
          currentPrice,
          years,
          dcaAmountUSD,
          dcaFrequency,
          growthModel: model,
          modelParams,
        };
        const result = calculateProjection(input);
        projections[model] = result.projections.map((p) => p.portfolioValueUSD);
      }
    }

    // Also get invested amounts (same for all models)
    const baseInput: ProjectionInput = {
      currentSOL,
      currentPrice,
      years,
      dcaAmountUSD,
      dcaFrequency,
      growthModel: 'cagr',
      modelParams,
    };
    const baseResult = calculateProjection(baseInput);
    const invested = baseResult.projections.map((p) => p.totalInvestedUSD);

    // Combine into chart data, applying inflation adjustment if provided
    const adjustValue = (value: number, year: number) =>
      inflationAdjustment && showRealValue ? inflationAdjustment(value, year) : value;

    return Array.from({ length: years }, (_, i) => ({
      year: i + 1,
      cagr: adjustValue(projections.cagr[i], i + 1),
      powerlaw: adjustValue(projections.powerlaw[i], i + 1),
      scurve: adjustValue(projections.scurve[i], i + 1),
      invested: invested[i],
    }));
  }, [currentSOL, currentPrice, years, dcaAmountUSD, dcaFrequency, modelParams, inflationAdjustment, showRealValue, mcEnabled, mcParams]);

  // Custom tooltip
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="chart-tooltip">
          <p className="tooltip-year">Year {label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} style={{ color: entry.color }}>
              {entry.name}: {formatUSD(entry.value)}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="chart-wrapper">
      <div className="chart-controls">
        <button
          type="button"
          className={`scale-toggle ${useLogScale ? 'active' : ''}`}
          onClick={() => setUseLogScale(!useLogScale)}
        >
          {useLogScale ? 'Log Scale' : 'Linear Scale'}
        </button>
        <span className={`scale-hint comparison-hint ${mcEnabled ? 'mc-hint' : ''}`}>
          {mcEnabled ? 'Comparing median outcomes (Monte Carlo)' : 'Comparing all 3 growth models'}
        </span>
      </div>
      <ResponsiveContainer width="100%" height={400}>
        <ComposedChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 30 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#333" />
          <XAxis dataKey="year" stroke="#888" />
          <YAxis
            stroke="#888"
            tickFormatter={(v) => formatUSD(v)}
            width={70}
            scale={useLogScale ? 'log' : 'auto'}
            domain={useLogScale ? ['auto', 'auto'] : [0, 'auto']}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ paddingTop: '10px' }} />

          {/* Model lines */}
          <Line
            type="monotone"
            dataKey="cagr"
            stroke={MODEL_COLORS.cagr}
            strokeWidth={2}
            dot={false}
            name={mcEnabled ? 'CAGR (median)' : MODEL_NAMES.cagr}
          />
          <Line
            type="monotone"
            dataKey="powerlaw"
            stroke={MODEL_COLORS.powerlaw}
            strokeWidth={2}
            dot={false}
            name={mcEnabled ? 'Power Law (median)' : MODEL_NAMES.powerlaw}
          />
          <Line
            type="monotone"
            dataKey="scurve"
            stroke={MODEL_COLORS.scurve}
            strokeWidth={2}
            dot={false}
            name={mcEnabled ? 'Asymptotic (median)' : MODEL_NAMES.scurve}
          />

          {/* Total invested line */}
          <Line
            type="monotone"
            dataKey="invested"
            stroke="#14F195"
            strokeWidth={2}
            strokeDasharray="5 5"
            dot={false}
            name="Total Invested"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
