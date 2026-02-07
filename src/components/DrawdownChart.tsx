import { useState, useMemo } from 'react';
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
  ReferenceLine,
} from 'recharts';
import { formatUSD } from '../utils/calculations';
import type { DrawdownResult, SimulationPath } from '../utils/drawdownMonteCarlo';
import { formatMonth } from '../utils/drawdownMonteCarlo';

interface DrawdownChartProps {
  result: DrawdownResult;
  retirementYears: number;
  monthlyIncome: number;
}

interface ChartDataPoint {
  month: number;
  year: number;
  p10: number;
  p50: number;
  p90: number;
  // Individual path values for highlighting
  [key: string]: number;
}

export function DrawdownChart({ result, retirementYears, monthlyIncome }: DrawdownChartProps) {
  const [useLogScale, setUseLogScale] = useState(false);
  const [selectedPath, setSelectedPath] = useState<SimulationPath | null>(null);
  const [showIndividualPaths, setShowIndividualPaths] = useState(true);

  // Transform data for the chart
  const chartData = useMemo<ChartDataPoint[]>(() => {
    // Guard against empty or incomplete results
    if (!result.percentiles || result.percentiles.length === 0) {
      return [];
    }

    const totalMonths = retirementYears * 12;
    const data: ChartDataPoint[] = [];

    for (let month = 0; month <= totalMonths; month++) {
      const p = result.percentiles[month];
      // Skip if percentile data doesn't exist for this month
      if (!p) continue;

      const point: ChartDataPoint = {
        month,
        year: month / 12,
        p10: p.p10,
        p50: p.p50,
        p90: p.p90,
      };

      // Add individual failed paths
      if (showIndividualPaths) {
        result.failedPaths.forEach((path, i) => {
          point[`failed_${i}`] = path.portfolioValue[month];
        });
      }

      data.push(point);
    }

    return data;
  }, [result, retirementYears, showIndividualPaths]);

  // Custom tooltip
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      // label is year (decimal), convert back to months for formatMonth
      const yearValue = label as number;
      const monthNum = Math.round(yearValue * 12);
      return (
        <div className="chart-tooltip">
          <p className="tooltip-year">{formatMonth(monthNum)}</p>
          {payload
            .filter((entry: any) => !entry.dataKey.startsWith('failed_') && entry.dataKey !== 'p10' && entry.dataKey !== 'p90')
            .map((entry: any, index: number) => (
              <p key={index} style={{ color: entry.color }}>
                {entry.name}: {formatUSD(entry.value)}
              </p>
            ))}
          {payload.find((e: any) => e.dataKey === 'p10') && (
            <p style={{ color: '#666', fontSize: '0.85em' }}>
              Range: {formatUSD(payload.find((e: any) => e.dataKey === 'p10')?.value)} - {formatUSD(payload.find((e: any) => e.dataKey === 'p90')?.value)}
            </p>
          )}
        </div>
      );
    }
    return null;
  };

  // Handle clicking on a failed path
  const handlePathClick = (path: SimulationPath) => {
    setSelectedPath(selectedPath?.id === path.id ? null : path);
  };

  const successPercent = Math.round(result.successRate * 100);
  const failedCount = result.failedPaths.length;

  return (
    <div className="chart-wrapper drawdown-chart">
      <div className="chart-controls">
        <button
          type="button"
          className={`scale-toggle ${useLogScale ? 'active' : ''}`}
          onClick={() => setUseLogScale(!useLogScale)}
        >
          {useLogScale ? 'Log Scale' : 'Linear Scale'}
        </button>
        {failedCount > 0 && (
          <button
            type="button"
            className={`scale-toggle ${showIndividualPaths ? 'active' : ''}`}
            onClick={() => setShowIndividualPaths(!showIndividualPaths)}
          >
            {showIndividualPaths ? 'Hide Paths' : 'Show Failed'}
          </button>
        )}
        <span className="scale-hint drawdown-hint">
          {successPercent}% success rate
        </span>
      </div>

      <ResponsiveContainer width="100%" height={350}>
        <ComposedChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 30 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#333" />
          <XAxis
            dataKey="year"
            stroke="#888"
            tickFormatter={(v) => `${Math.round(v)}y`}
            label={{ value: 'Years', position: 'bottom', offset: 10, fill: '#888' }}
          />
          <YAxis
            stroke="#888"
            tickFormatter={(v) => formatUSD(v)}
            width={70}
            scale={useLogScale ? 'log' : 'auto'}
            domain={useLogScale ? [1, 'auto'] : [0, 'auto']}
            allowDataOverflow={useLogScale}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ paddingTop: '10px' }} />

          {/* Reference line at $0 */}
          <ReferenceLine y={0} stroke="#666" strokeDasharray="3 3" />

          {/* Shaded area from p10 to p90 */}
          <Area
            type="monotone"
            dataKey="p90"
            stroke="none"
            fill="#14F195"
            fillOpacity={0.15}
            legendType="none"
          />
          <Area
            type="monotone"
            dataKey="p10"
            stroke="none"
            fill="#0D0D0D"
            fillOpacity={1}
            legendType="none"
          />

          {/* Percentile lines */}
          <Line
            type="monotone"
            dataKey="p10"
            stroke="#14F195"
            strokeWidth={1}
            strokeDasharray="4 4"
            dot={false}
            name="10th Percentile"
            legendType="none"
          />
          <Line
            type="monotone"
            dataKey="p90"
            stroke="#14F195"
            strokeWidth={1}
            strokeDasharray="4 4"
            dot={false}
            name="90th Percentile"
            legendType="none"
          />

          {/* Median line */}
          <Line
            type="monotone"
            dataKey="p50"
            stroke="#14F195"
            strokeWidth={3}
            dot={false}
            name="Median Portfolio"
          />

          {/* Individual failed paths */}
          {showIndividualPaths && result.failedPaths.map((path, i) => (
            <Line
              key={`failed_${i}`}
              type="monotone"
              dataKey={`failed_${i}`}
              stroke={selectedPath?.id === path.id ? '#FF6B6B' : '#FF6B6B'}
              strokeWidth={selectedPath?.id === path.id ? 2 : 1}
              strokeOpacity={selectedPath?.id === path.id ? 1 : 0.4}
              dot={false}
              legendType="none"
              activeDot={{ r: 4, onClick: () => handlePathClick(path) }}
            />
          ))}
        </ComposedChart>
      </ResponsiveContainer>

      {/* Failed paths list */}
      {failedCount > 0 && (
        <div className="failed-paths-section">
          <h4>Failed Scenarios ({result.allPaths.filter(p => p.failed).length} of {result.allPaths.length})</h4>
          <div className="failed-paths-list">
            {result.failedPaths.map((path, i) => (
              <button
                key={path.id}
                type="button"
                className={`failed-path-btn ${selectedPath?.id === path.id ? 'selected' : ''}`}
                onClick={() => handlePathClick(path)}
              >
                <span className="path-label">Path {i + 1}</span>
                <span className="path-failure">
                  Failed at {formatMonth(path.failureMonth!)}
                </span>
              </button>
            ))}
          </div>
          {selectedPath && (
            <div className="selected-path-detail">
              <p>
                <strong>Simulation {selectedPath.id + 1}</strong> ran out of funds at{' '}
                <span className="failure-time">{formatMonth(selectedPath.failureMonth!)}</span>
              </p>
              <p className="path-detail-note">
                Monthly withdrawal: {formatUSD(monthlyIncome)} (inflation-adjusted)
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
