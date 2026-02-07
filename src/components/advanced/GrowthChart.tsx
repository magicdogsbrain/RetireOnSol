import { useState } from 'react';
import {
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Area,
  ComposedChart,
} from 'recharts';
import type { YearlyProjection } from '../../utils/calculations';
import { formatUSD } from '../../utils/calculations';
import type { MonteCarloResult } from '../../utils/monteCarlo';

interface GrowthChartProps {
  projections: YearlyProjection[];
  inflationAdjustment?: (value: number, year: number) => number;
  showRealValue?: boolean;
  mcResult?: MonteCarloResult | null;
}

interface ChartDataPoint {
  year: number;
  value: number;           // Portfolio value in USD (nominal or real)
  invested: number;        // Total invested in USD
  // Monte Carlo percentiles (when enabled)
  p10?: number;
  p50?: number;
  p90?: number;
}

export function GrowthChart({ projections, inflationAdjustment, showRealValue, mcResult }: GrowthChartProps) {
  const [useLogScale, setUseLogScale] = useState(false);

  // Transform data for the chart, applying inflation adjustment if provided
  const chartData: ChartDataPoint[] = projections.map((p, i) => {
    const adjustValue = (v: number) =>
      inflationAdjustment && showRealValue ? inflationAdjustment(v, p.year) : v;

    const basePoint: ChartDataPoint = {
      year: p.year,
      value: adjustValue(p.portfolioValueUSD),
      invested: p.totalInvestedUSD,
    };

    // Add Monte Carlo percentiles if available
    if (mcResult && mcResult.percentiles[i]) {
      const mc = mcResult.percentiles[i];
      basePoint.p10 = adjustValue(mc.p10);
      basePoint.p50 = adjustValue(mc.p50);
      basePoint.p90 = adjustValue(mc.p90);
    }

    return basePoint;
  });

  // Custom tooltip
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="chart-tooltip">
          <p className="tooltip-year">Year {label}</p>
          {payload
            .filter((entry: any) => entry.dataKey !== 'p10' && entry.dataKey !== 'p90')
            .map((entry: any, index: number) => (
              <p key={index} style={{ color: entry.color }}>
                {entry.name}: {formatUSD(entry.value)}
              </p>
            ))}
          {mcResult && payload.find((e: any) => e.dataKey === 'p10') && (
            <p style={{ color: '#666', fontSize: '0.85em' }}>
              Range: {formatUSD(payload.find((e: any) => e.dataKey === 'p10')?.value)} - {formatUSD(payload.find((e: any) => e.dataKey === 'p90')?.value)}
            </p>
          )}
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
        {mcResult && (
          <span className="scale-hint mc-hint">
            Showing 10th-90th percentile range
          </span>
        )}
      </div>
      <ResponsiveContainer width="100%" height={350}>
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

          {/* Monte Carlo: Shaded area between 10th and 90th percentile */}
          {mcResult && (
            <>
              {/* Background fill from 0 to p90 */}
              <Area
                type="monotone"
                dataKey="p90"
                stroke="none"
                fill="#9945FF"
                fillOpacity={0.15}
                legendType="none"
              />
              {/* Cut out area below p10 */}
              <Area
                type="monotone"
                dataKey="p10"
                stroke="none"
                fill="#0D0D0D"
                fillOpacity={1}
                legendType="none"
              />
              {/* 10th percentile line */}
              <Line
                type="monotone"
                dataKey="p10"
                stroke="#9945FF"
                strokeWidth={1}
                strokeDasharray="4 4"
                dot={false}
                name="10th Percentile"
                legendType="none"
              />
              {/* 90th percentile line */}
              <Line
                type="monotone"
                dataKey="p90"
                stroke="#9945FF"
                strokeWidth={1}
                strokeDasharray="4 4"
                dot={false}
                name="90th Percentile"
                legendType="none"
              />
            </>
          )}

          {/* Non-MC: Shaded area for portfolio value */}
          {!mcResult && (
            <Area
              type="monotone"
              dataKey="value"
              stroke="none"
              fill="#9945FF"
              fillOpacity={0.2}
              legendType="none"
            />
          )}

          {/* Portfolio value line (deterministic) or median (MC) */}
          <Line
            type="monotone"
            dataKey={mcResult ? 'p50' : 'value'}
            stroke="#9945FF"
            strokeWidth={3}
            dot={false}
            name={mcResult ? 'Median Value' : 'Portfolio Value'}
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
