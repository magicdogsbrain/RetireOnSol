import type { ProjectionResult, YearlyProjection } from './calculations';
import { formatUSD, formatSOL } from './calculations';
import { getModelDisplayName } from './growthModels';
import type { GrowthModel, GrowthModelParams } from './growthModels';
import type { MonteCarloResult } from './monteCarlo';
import type { InflationParams } from './inflation';

interface ShareImageOptions {
  projection: ProjectionResult;
  years: number;
  growthModel: GrowthModel;
  modelParams: GrowthModelParams;
  dcaAmountUSD: number;
  dcaFrequency: string;
  currentSOL: number;
  currentPrice: number;
  // Monte Carlo
  mcEnabled: boolean;
  mcResult: MonteCarloResult | null;
  mcVolatility: number;
  mcSimulations: number;
  // Inflation
  inflationEnabled: boolean;
  inflationParams: InflationParams;
  // Adjusted values
  todaysDollarsValue: number | null;
  inflationAdjustmentFn: (value: number, year: number) => number;
}

/**
 * Draw the chart on the canvas - supports both deterministic and Monte Carlo
 */
function drawChart(
  ctx: CanvasRenderingContext2D,
  projections: YearlyProjection[],
  x: number,
  y: number,
  width: number,
  height: number,
  mcResult: MonteCarloResult | null,
  inflationEnabled: boolean,
  inflationAdjustmentFn: (value: number, year: number) => number
) {
  const padding = { top: 20, right: 20, bottom: 40, left: 70 };
  const chartX = x + padding.left;
  const chartY = y + padding.top;
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  // Get values to plot, applying inflation adjustment if needed
  const getValue = (p: YearlyProjection, mcP: { p10: number; p50: number; p90: number } | null) => {
    if (mcP) {
      return {
        value: inflationEnabled ? inflationAdjustmentFn(mcP.p50, p.year) : mcP.p50,
        p10: inflationEnabled ? inflationAdjustmentFn(mcP.p10, p.year) : mcP.p10,
        p90: inflationEnabled ? inflationAdjustmentFn(mcP.p90, p.year) : mcP.p90,
      };
    }
    const val = inflationEnabled ? inflationAdjustmentFn(p.portfolioValueUSD, p.year) : p.portfolioValueUSD;
    return { value: val, p10: val, p90: val };
  };

  // Find max value for scaling
  let maxValue = 0;
  projections.forEach((p, i) => {
    const mcP = mcResult?.percentiles[i] || null;
    const vals = getValue(p, mcP);
    maxValue = Math.max(maxValue, vals.p90, vals.value, p.totalInvestedUSD);
  });

  // Draw chart background
  ctx.fillStyle = 'rgba(26, 26, 26, 0.9)';
  ctx.fillRect(x, y, width, height);

  // Draw grid lines
  ctx.strokeStyle = 'rgba(136, 136, 136, 0.2)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const lineY = chartY + (chartHeight / 4) * i;
    ctx.beginPath();
    ctx.moveTo(chartX, lineY);
    ctx.lineTo(chartX + chartWidth, lineY);
    ctx.stroke();
  }

  // Helper to get pixel coordinates
  const getX = (i: number) => chartX + (i / (projections.length - 1)) * chartWidth;
  const getY = (value: number) => chartY + chartHeight - (value / maxValue) * chartHeight;

  // Draw Monte Carlo percentile band if enabled
  if (mcResult) {
    // Fill area between p10 and p90
    ctx.fillStyle = 'rgba(153, 69, 255, 0.2)';
    ctx.beginPath();

    // Top edge (p90)
    projections.forEach((p, i) => {
      const mcP = mcResult.percentiles[i];
      const vals = getValue(p, mcP);
      const px = getX(i);
      const py = getY(vals.p90);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });

    // Bottom edge (p10) - reverse direction
    for (let i = projections.length - 1; i >= 0; i--) {
      const p = projections[i];
      const mcP = mcResult.percentiles[i];
      const vals = getValue(p, mcP);
      const px = getX(i);
      const py = getY(vals.p10);
      ctx.lineTo(px, py);
    }

    ctx.closePath();
    ctx.fill();

    // Draw p10 line (dashed)
    ctx.strokeStyle = '#9945FF';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    projections.forEach((p, i) => {
      const mcP = mcResult.percentiles[i];
      const vals = getValue(p, mcP);
      const px = getX(i);
      const py = getY(vals.p10);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();

    // Draw p90 line (dashed)
    ctx.beginPath();
    projections.forEach((p, i) => {
      const mcP = mcResult.percentiles[i];
      const vals = getValue(p, mcP);
      const px = getX(i);
      const py = getY(vals.p90);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();
    ctx.setLineDash([]);
  } else {
    // Non-MC: Fill area under portfolio value
    ctx.fillStyle = 'rgba(153, 69, 255, 0.2)';
    ctx.beginPath();
    ctx.moveTo(getX(0), chartY + chartHeight);
    projections.forEach((p, i) => {
      const vals = getValue(p, null);
      ctx.lineTo(getX(i), getY(vals.value));
    });
    ctx.lineTo(getX(projections.length - 1), chartY + chartHeight);
    ctx.closePath();
    ctx.fill();
  }

  // Draw invested line (teal, dashed)
  ctx.strokeStyle = '#14F195';
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  projections.forEach((p, i) => {
    const px = getX(i);
    const py = getY(p.totalInvestedUSD);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.stroke();
  ctx.setLineDash([]);

  // Draw main value line (purple)
  ctx.strokeStyle = '#9945FF';
  ctx.lineWidth = 3;
  ctx.beginPath();
  projections.forEach((p, i) => {
    const mcP = mcResult?.percentiles[i] || null;
    const vals = getValue(p, mcP);
    const px = getX(i);
    const py = getY(vals.value);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.stroke();

  // Draw legend
  ctx.font = '14px -apple-system, BlinkMacSystemFont, sans-serif';
  const legendY = y + height - 12;

  // Portfolio Value / Median legend
  ctx.fillStyle = '#9945FF';
  ctx.fillRect(chartX, legendY - 10, 12, 12);
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'left';
  ctx.fillText(mcResult ? 'Median Value' : 'Portfolio Value', chartX + 18, legendY);

  // Total Invested legend
  ctx.fillStyle = '#14F195';
  ctx.fillRect(chartX + 140, legendY - 10, 12, 12);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText('Total Invested', chartX + 158, legendY);

  // MC range legend
  if (mcResult) {
    ctx.fillStyle = 'rgba(153, 69, 255, 0.4)';
    ctx.fillRect(chartX + 280, legendY - 10, 12, 12);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText('10th-90th Percentile', chartX + 298, legendY);
  }

  // Y-axis labels
  ctx.fillStyle = '#888888';
  ctx.font = '12px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(formatUSD(maxValue), chartX - 8, chartY + 10);
  ctx.fillText(formatUSD(maxValue / 2), chartX - 8, chartY + chartHeight / 2);
  ctx.fillText('$0', chartX - 8, chartY + chartHeight);

  // X-axis labels
  ctx.textAlign = 'center';
  ctx.fillText('Year 1', chartX, chartY + chartHeight + 18);
  ctx.fillText(`Year ${Math.floor(projections.length / 2)}`, chartX + chartWidth / 2, chartY + chartHeight + 18);
  ctx.fillText(`Year ${projections.length}`, chartX + chartWidth, chartY + chartHeight + 18);
}

/**
 * Generate a shareable image of the projection results
 */
export async function generateShareImage(options: ShareImageOptions): Promise<Blob> {
  const {
    projection,
    years,
    growthModel,
    modelParams,
    dcaAmountUSD,
    dcaFrequency,
    currentSOL,
    currentPrice,
    mcEnabled,
    mcResult,
    mcVolatility,
    mcSimulations,
    inflationEnabled,
    inflationParams,
    todaysDollarsValue,
    inflationAdjustmentFn,
  } = options;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;

  // Set canvas size (optimized for social sharing)
  canvas.width = 1200;
  canvas.height = 900;

  // Background gradient
  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, '#0D0D0D');
  gradient.addColorStop(1, '#1A1A2E');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Add subtle grid pattern
  ctx.strokeStyle = 'rgba(153, 69, 255, 0.1)';
  ctx.lineWidth = 1;
  for (let x = 0; x < canvas.width; x += 60) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  for (let y = 0; y < canvas.height; y += 60) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }

  // Title
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 42px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('RetireOnSol', canvas.width / 2, 45);

  // Subtitle with model info
  ctx.fillStyle = '#888888';
  ctx.font = '20px -apple-system, BlinkMacSystemFont, sans-serif';
  const modelText = `${years}-Year ${getModelDisplayName(growthModel)} Projection${mcEnabled ? ' (Monte Carlo)' : ''}`;
  ctx.fillText(modelText, canvas.width / 2, 75);

  // Main result - Portfolio Value (use MC median if enabled)
  let mainValue: number;
  let valueLabel: string;

  if (mcEnabled && mcResult) {
    mainValue = inflationEnabled ? inflationAdjustmentFn(mcResult.finalP50, years) : mcResult.finalP50;
    valueLabel = inflationEnabled ? "Median Value (Today's Dollars)" : 'Median Portfolio Value';
  } else if (inflationEnabled && todaysDollarsValue) {
    mainValue = todaysDollarsValue;
    valueLabel = "Portfolio Value (Today's Dollars)";
  } else {
    mainValue = projection.finalValueUSD;
    valueLabel = 'Projected Portfolio Value';
  }

  ctx.fillStyle = '#14F195';
  ctx.font = 'bold 64px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText(formatUSD(mainValue), canvas.width / 2, 150);

  ctx.fillStyle = '#888888';
  ctx.font = '18px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText(valueLabel, canvas.width / 2, 180);

  // MC range if enabled
  if (mcEnabled && mcResult) {
    const p10 = inflationEnabled ? inflationAdjustmentFn(mcResult.finalP10, years) : mcResult.finalP10;
    const p90 = inflationEnabled ? inflationAdjustmentFn(mcResult.finalP90, years) : mcResult.finalP90;
    ctx.fillStyle = '#9945FF';
    ctx.font = '16px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText(`Range: ${formatUSD(p10)} - ${formatUSD(p90)} (10th-90th percentile)`, canvas.width / 2, 205);
  }

  // Stats row
  const statsY = mcEnabled ? 255 : 235;
  const statsGap = 240;
  const statsStartX = (canvas.width - statsGap * 3) / 2 + 60;

  // SOL Accumulated
  const solValue = mcEnabled && mcResult ? mcResult.finalSolP50 : projection.finalSOL;
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 28px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(formatSOL(solValue) + ' SOL', statsStartX, statsY);
  ctx.fillStyle = '#888888';
  ctx.font = '14px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText(mcEnabled ? 'Median SOL' : 'SOL Accumulated', statsStartX, statsY + 22);

  // SOL Price
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 28px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText('$' + projection.finalPrice.toLocaleString(), statsStartX + statsGap, statsY);
  ctx.fillStyle = '#888888';
  ctx.font = '14px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText('Model Expected Price', statsStartX + statsGap, statsY + 22);

  // Total Invested
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 28px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText(formatUSD(projection.totalInvestedUSD), statsStartX + statsGap * 2, statsY);
  ctx.fillStyle = '#888888';
  ctx.font = '14px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText('Total Invested', statsStartX + statsGap * 2, statsY + 22);

  // Gain
  const gain = mainValue - projection.totalInvestedUSD;
  ctx.fillStyle = '#14F195';
  ctx.font = 'bold 28px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText(formatUSD(gain), statsStartX + statsGap * 3, statsY);
  ctx.fillStyle = '#888888';
  ctx.font = '14px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText(mcEnabled ? 'Median Gain' : (inflationEnabled ? 'Real Gain' : 'Total Gain'), statsStartX + statsGap * 3, statsY + 22);

  // Draw chart
  const chartY = mcEnabled ? 300 : 280;
  drawChart(
    ctx,
    projection.projections,
    80,
    chartY,
    1040,
    380,
    mcEnabled ? mcResult : null,
    inflationEnabled,
    inflationAdjustmentFn
  );

  // Parameters section (small print)
  const paramsY = chartY + 410;
  ctx.fillStyle = '#666666';
  ctx.font = '13px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.textAlign = 'center';

  // Build parameters string
  const params: string[] = [];

  // Starting position
  params.push(`Starting: ${formatSOL(currentSOL)} SOL @ $${currentPrice.toFixed(2)}`);

  // DCA
  if (dcaAmountUSD > 0) {
    params.push(`DCA: $${dcaAmountUSD} ${dcaFrequency}`);
  }

  // Growth model params
  if (growthModel === 'cagr') {
    const cagr = (modelParams.cagr || 0.25) * 100;
    params.push(`CAGR: ${cagr.toFixed(0)}%${modelParams.cagrDecay === 'auto' ? ' (auto decay)' : ''}`);
  } else if (growthModel === 'powerlaw') {
    params.push(`Power Law slope: ${(modelParams.powerLawSlope || 1.6).toFixed(1)}`);
  } else if (growthModel === 'scurve') {
    params.push(`Ceiling: $${((modelParams.sCurveMaxPrice || 50000) / 1000).toFixed(0)}K, Half-life: ${modelParams.sCurveYearsToHalfRemaining || 12}yr`);
  }

  // Monte Carlo
  if (mcEnabled) {
    params.push(`MC: ${(mcVolatility * 100).toFixed(0)}% vol, ${mcSimulations} sims`);
  }

  // Inflation
  if (inflationEnabled) {
    const inflRate = (inflationParams.rate * 100).toFixed(1);
    const debRate = (inflationParams.debasementRate * 100).toFixed(0);
    if (inflationParams.type === 'cyclical') {
      params.push(`Inflation: ~${inflRate}% cyclical + ${debRate}% debasement`);
    } else {
      params.push(`Inflation: ${inflRate}% + ${debRate}% debasement`);
    }
  }

  // Draw parameters in two lines if needed
  const paramsLine1 = params.slice(0, 3).join('  •  ');
  const paramsLine2 = params.slice(3).join('  •  ');

  ctx.fillText(paramsLine1, canvas.width / 2, paramsY);
  if (paramsLine2) {
    ctx.fillText(paramsLine2, canvas.width / 2, paramsY + 18);
  }

  // Footer
  const footerY = paramsLine2 ? paramsY + 50 : paramsY + 35;
  ctx.fillStyle = '#555555';
  ctx.font = '14px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText('Not financial advice. Projections are hypothetical and do not guarantee future results.', canvas.width / 2, footerY);

  // Branding
  ctx.fillStyle = '#9945FF';
  ctx.font = 'bold 16px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText('retireonsol.uk', canvas.width / 2, footerY + 22);

  // Convert to blob
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      resolve(blob!);
    }, 'image/png');
  });
}

/**
 * Share or download the projection image
 */
export async function shareProjection(options: ShareImageOptions): Promise<void> {
  const blob = await generateShareImage(options);
  const file = new File([blob], 'retireonsol-projection.png', { type: 'image/png' });

  // Determine main value for share text
  let mainValue: number;
  if (options.mcEnabled && options.mcResult) {
    mainValue = options.inflationEnabled
      ? options.inflationAdjustmentFn(options.mcResult.finalP50, options.years)
      : options.mcResult.finalP50;
  } else if (options.inflationEnabled && options.todaysDollarsValue) {
    mainValue = options.todaysDollarsValue;
  } else {
    mainValue = options.projection.finalValueUSD;
  }

  // Try native share if available (mobile)
  if (navigator.share && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: 'My RetireOnSol Projection',
        text: `Check out my ${options.years}-year SOL projection: ${formatUSD(mainValue)}${options.mcEnabled ? ' (median)' : ''}`,
      });
      return;
    } catch (err) {
      // User cancelled or share failed, fall back to download
      if ((err as Error).name === 'AbortError') return;
    }
  }

  // Fall back to download
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'retireonsol-projection.png';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
