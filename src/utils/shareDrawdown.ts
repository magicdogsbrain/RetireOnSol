import { formatUSD, formatSOL } from './calculations';
import type { DrawdownResult } from './drawdownMonteCarlo';
import { formatMonth } from './drawdownMonteCarlo';

interface ShareDrawdownOptions {
  result: DrawdownResult;
  startingSOL: number;
  startingPrice: number;
  startingValueUSD: number;
  monthlyIncome: number;
  retirementYears: number;
  volatility: number;
  inflationRate: number;
  simulations: number;
}

/**
 * Draw the drawdown chart on the canvas
 */
function drawDrawdownChart(
  ctx: CanvasRenderingContext2D,
  result: DrawdownResult,
  x: number,
  y: number,
  width: number,
  height: number,
  retirementYears: number
) {
  const padding = { top: 20, right: 20, bottom: 40, left: 70 };
  const chartX = x + padding.left;
  const chartY = y + padding.top;
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const totalMonths = retirementYears * 12;

  // Find max value for scaling
  let maxValue = 0;
  result.percentiles.forEach((p) => {
    maxValue = Math.max(maxValue, p.p90);
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
  const getX = (month: number) => chartX + (month / totalMonths) * chartWidth;
  const getY = (value: number) => chartY + chartHeight - (value / maxValue) * chartHeight;

  // Draw percentile band (p10 to p90)
  ctx.fillStyle = 'rgba(20, 241, 149, 0.2)';
  ctx.beginPath();

  // Top edge (p90)
  result.percentiles.forEach((p, i) => {
    const px = getX(p.month);
    const py = getY(p.p90);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });

  // Bottom edge (p10) - reverse direction
  for (let i = result.percentiles.length - 1; i >= 0; i--) {
    const p = result.percentiles[i];
    const px = getX(p.month);
    const py = getY(p.p10);
    ctx.lineTo(px, py);
  }

  ctx.closePath();
  ctx.fill();

  // Draw p10 line (dashed)
  ctx.strokeStyle = '#14F195';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  result.percentiles.forEach((p, i) => {
    const px = getX(p.month);
    const py = getY(p.p10);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.stroke();

  // Draw p90 line (dashed)
  ctx.beginPath();
  result.percentiles.forEach((p, i) => {
    const px = getX(p.month);
    const py = getY(p.p90);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.stroke();
  ctx.setLineDash([]);

  // Draw failed paths (red, thin)
  ctx.strokeStyle = 'rgba(255, 107, 107, 0.4)';
  ctx.lineWidth = 1;
  result.failedPaths.forEach((path) => {
    ctx.beginPath();
    path.months.forEach((month, i) => {
      const px = getX(month);
      const py = getY(path.portfolioValue[i]);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();
  });

  // Draw median line (green)
  ctx.strokeStyle = '#14F195';
  ctx.lineWidth = 3;
  ctx.beginPath();
  result.percentiles.forEach((p, i) => {
    const px = getX(p.month);
    const py = getY(p.p50);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.stroke();

  // Draw $0 reference line
  ctx.strokeStyle = 'rgba(255, 107, 107, 0.5)';
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(chartX, chartY + chartHeight);
  ctx.lineTo(chartX + chartWidth, chartY + chartHeight);
  ctx.stroke();
  ctx.setLineDash([]);

  // Draw legend
  ctx.font = '14px -apple-system, BlinkMacSystemFont, sans-serif';
  const legendY = y + height - 12;

  // Median legend
  ctx.fillStyle = '#14F195';
  ctx.fillRect(chartX, legendY - 10, 12, 12);
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'left';
  ctx.fillText('Median Portfolio', chartX + 18, legendY);

  // Range legend
  ctx.fillStyle = 'rgba(20, 241, 149, 0.4)';
  ctx.fillRect(chartX + 140, legendY - 10, 12, 12);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText('10th-90th Percentile', chartX + 158, legendY);

  // Failed paths legend
  if (result.failedPaths.length > 0) {
    ctx.fillStyle = 'rgba(255, 107, 107, 0.6)';
    ctx.fillRect(chartX + 320, legendY - 10, 12, 12);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText('Failed Scenarios', chartX + 338, legendY);
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
  ctx.fillText('Year 0', chartX, chartY + chartHeight + 18);
  ctx.fillText(`Year ${Math.floor(retirementYears / 2)}`, chartX + chartWidth / 2, chartY + chartHeight + 18);
  ctx.fillText(`Year ${retirementYears}`, chartX + chartWidth, chartY + chartHeight + 18);
}

/**
 * Generate a shareable image of the drawdown results
 */
export async function generateDrawdownShareImage(options: ShareDrawdownOptions): Promise<Blob> {
  const {
    result,
    startingSOL,
    startingPrice,
    startingValueUSD,
    monthlyIncome,
    retirementYears,
    volatility,
    inflationRate,
    simulations,
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
  ctx.strokeStyle = 'rgba(20, 241, 149, 0.1)';
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

  // Subtitle
  ctx.fillStyle = '#888888';
  ctx.font = '20px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText(`${retirementYears}-Year Retirement Drawdown Simulation`, canvas.width / 2, 75);

  // Main result - Success Rate
  const successPercent = Math.round(result.successRate * 100);
  const successColor = successPercent >= 90 ? '#14F195' : successPercent >= 70 ? '#FFB347' : '#FF6B6B';

  ctx.fillStyle = successColor;
  ctx.font = 'bold 72px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText(`${successPercent}%`, canvas.width / 2, 155);

  ctx.fillStyle = '#888888';
  ctx.font = '20px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText('Success Rate', canvas.width / 2, 185);

  // Stats row
  const statsY = 245;
  const statsGap = 200;
  const statsStartX = (canvas.width - statsGap * 4) / 2 + 80;

  // Starting Portfolio
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 24px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(formatUSD(startingValueUSD), statsStartX, statsY);
  ctx.fillStyle = '#888888';
  ctx.font = '13px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText('Starting Portfolio', statsStartX, statsY + 20);

  // Monthly Income
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 24px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText(formatUSD(monthlyIncome), statsStartX + statsGap, statsY);
  ctx.fillStyle = '#888888';
  ctx.font = '13px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText('Monthly Income', statsStartX + statsGap, statsY + 20);

  // Median Ending
  ctx.fillStyle = '#14F195';
  ctx.font = 'bold 24px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText(formatUSD(result.medianEndingValue), statsStartX + statsGap * 2, statsY);
  ctx.fillStyle = '#888888';
  ctx.font = '13px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText('Median Ending', statsStartX + statsGap * 2, statsY + 20);

  // Failed Runs
  const failedCount = Math.round((1 - result.successRate) * simulations);
  ctx.fillStyle = failedCount > 0 ? '#FF6B6B' : '#14F195';
  ctx.font = 'bold 24px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText(failedCount.toString(), statsStartX + statsGap * 3, statsY);
  ctx.fillStyle = '#888888';
  ctx.font = '13px -apple-system, BlinkMacSystemFont, sans-serif';
  if (result.medianFailureMonth) {
    ctx.fillText(`Failed (med: ${formatMonth(result.medianFailureMonth)})`, statsStartX + statsGap * 3, statsY + 20);
  } else {
    ctx.fillText('Failed Runs', statsStartX + statsGap * 3, statsY + 20);
  }

  // SOL details row
  const solY = statsY + 55;
  ctx.fillStyle = '#666666';
  ctx.font = '14px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText(
    `Starting: ${formatSOL(startingSOL)} SOL @ $${startingPrice.toLocaleString()}`,
    canvas.width / 2,
    solY
  );

  // Draw chart
  const chartY = 315;
  drawDrawdownChart(ctx, result, 80, chartY, 1040, 380, retirementYears);

  // Parameters section
  const paramsY = chartY + 410;
  ctx.fillStyle = '#666666';
  ctx.font = '13px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.textAlign = 'center';

  const withdrawalRate = (monthlyIncome * 12 / startingValueUSD * 100).toFixed(1);
  const params = [
    `Withdrawal Rate: ${withdrawalRate}%`,
    `Volatility: ${(volatility * 100).toFixed(0)}%`,
    `Inflation: ${(inflationRate * 100).toFixed(1)}%`,
    `Simulations: ${simulations}`,
  ];

  ctx.fillText(params.join('  •  '), canvas.width / 2, paramsY);

  // Footer
  const footerY = paramsY + 35;
  ctx.fillStyle = '#555555';
  ctx.font = '14px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText('Not financial advice. Projections are hypothetical and do not guarantee future results.', canvas.width / 2, footerY);

  // Branding
  ctx.fillStyle = '#14F195';
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
 * Share or download the drawdown image
 */
export async function shareDrawdown(options: ShareDrawdownOptions): Promise<void> {
  const blob = await generateDrawdownShareImage(options);
  const file = new File([blob], 'retireonsol-drawdown.png', { type: 'image/png' });

  const successPercent = Math.round(options.result.successRate * 100);

  // Try native share if available (mobile)
  if (navigator.share && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: 'My RetireOnSol Drawdown',
        text: `My ${options.retirementYears}-year retirement simulation: ${successPercent}% success rate with ${formatUSD(options.monthlyIncome)}/month`,
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
  a.download = 'retireonsol-drawdown.png';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
