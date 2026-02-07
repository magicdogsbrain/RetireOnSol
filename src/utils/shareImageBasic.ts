import { formatUSD, type RetirementProjection } from './calculationsBasic';

interface ShareImageOptions {
  projection: RetirementProjection;
  years: number;
  currentSOL: number;
  dcaMonthly: number;
}

/**
 * Draw a simple cone of uncertainty chart
 */
function drawChart(
  ctx: CanvasRenderingContext2D,
  projection: RetirementProjection,
  years: number,
  x: number,
  y: number,
  width: number,
  height: number
) {
  const padding = { top: 20, right: 20, bottom: 40, left: 70 };
  const chartX = x + padding.left;
  const chartY = y + padding.top;
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  // Calculate values for chart
  const maxValue = projection.p90;
  
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

  // Helper functions
  const getX = (yearPct: number) => chartX + (yearPct * chartWidth);
  const getY = (value: number) => chartY + chartHeight - (value / maxValue) * chartHeight;

  // Draw cone of uncertainty
  ctx.fillStyle = 'rgba(153, 69, 255, 0.2)';
  ctx.beginPath();
  
  // Start point
  ctx.moveTo(getX(0), getY(projection.startValue));
  
  // P90 line (top)
  ctx.lineTo(getX(1), getY(projection.p90));
  
  // P10 line (bottom)
  ctx.lineTo(getX(1), getY(projection.p10));
  
  // Close back to start
  ctx.lineTo(getX(0), getY(projection.startValue));
  ctx.closePath();
  ctx.fill();

  // Draw P10 line (dashed)
  ctx.strokeStyle = '#9945FF';
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(getX(0), getY(projection.startValue));
  ctx.lineTo(getX(1), getY(projection.p10));
  ctx.stroke();

  // Draw P90 line (dashed)
  ctx.beginPath();
  ctx.moveTo(getX(0), getY(projection.startValue));
  ctx.lineTo(getX(1), getY(projection.p90));
  ctx.stroke();
  ctx.setLineDash([]);

  // Draw median line (solid)
  ctx.strokeStyle = '#14F195';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(getX(0), getY(projection.startValue));
  ctx.lineTo(getX(1), getY(projection.p50));
  ctx.stroke();

  // Draw legend
  ctx.font = '14px -apple-system, BlinkMacSystemFont, sans-serif';
  const legendY = y + height - 12;

  // Median legend
  ctx.fillStyle = '#14F195';
  ctx.fillRect(chartX, legendY - 10, 12, 12);
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'left';
  ctx.fillText('Median (P50)', chartX + 18, legendY);

  // Range legend
  ctx.fillStyle = 'rgba(153, 69, 255, 0.4)';
  ctx.fillRect(chartX + 140, legendY - 10, 12, 12);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText('P10-P90 Range', chartX + 158, legendY);

  // Y-axis labels
  ctx.fillStyle = '#888888';
  ctx.font = '12px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(formatUSD(maxValue), chartX - 8, chartY + 10);
  ctx.fillText(formatUSD(maxValue / 2), chartX - 8, chartY + chartHeight / 2);
  ctx.fillText('$0', chartX - 8, chartY + chartHeight);

  // X-axis labels
  ctx.textAlign = 'center';
  ctx.fillText('Today', chartX, chartY + chartHeight + 18);
  ctx.fillText(`Year ${years}`, chartX + chartWidth, chartY + chartHeight + 18);
}

/**
 * Generate a shareable image of the projection
 */
export async function generateShareImage(options: ShareImageOptions): Promise<Blob> {
  const { projection, years, currentSOL, dcaMonthly } = options;

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
  ctx.fillText('RetireOnSol Charlie', canvas.width / 2, 45);

  // Subtitle
  ctx.fillStyle = '#888888';
  ctx.font = '20px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText(`${years}-Year SOL Retirement Plan`, canvas.width / 2, 75);

  // Main result - Median Portfolio Value
  ctx.fillStyle = '#14F195';
  ctx.font = 'bold 64px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText(formatUSD(projection.p50), canvas.width / 2, 150);

  ctx.fillStyle = '#888888';
  ctx.font = '18px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText('Projected Portfolio Value (Median)', canvas.width / 2, 180);

  // Range display
  ctx.fillStyle = '#9945FF';
  ctx.font = '16px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText(
    `Range: ${formatUSD(projection.p10)} - ${formatUSD(projection.p90)} (10th-90th percentile)`,
    canvas.width / 2,
    205
  );

  // Stats row
  const statsY = 255;
  const statsGap = 240;
  const statsStartX = (canvas.width - statsGap * 3) / 2 + 60;

  // Total Invested
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 28px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(formatUSD(projection.totalInvested), statsStartX, statsY);
  ctx.fillStyle = '#888888';
  ctx.font = '14px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText('Total Invested', statsStartX, statsY + 22);

  // ROI
  const roi = ((projection.p50 - projection.totalInvested) / projection.totalInvested) * 100;
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 28px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText(`+${roi.toFixed(0)}%`, statsStartX + statsGap, statsY);
  ctx.fillStyle = '#888888';
  ctx.font = '14px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText('ROI', statsStartX + statsGap, statsY + 22);

  // Monthly Income
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 28px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText(formatUSD(projection.monthlyIncome) + '/mo', statsStartX + statsGap * 2, statsY);
  ctx.fillStyle = '#888888';
  ctx.font = '14px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText('Monthly Income', statsStartX + statsGap * 2, statsY + 22);
  ctx.font = '11px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillStyle = '#666666';
  ctx.fillText('(in today\'s money)', statsStartX + statsGap * 2, statsY + 36);

  // Years of Income
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 28px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText(`${projection.yearsOfIncome.toFixed(1)}yr`, statsStartX + statsGap * 3, statsY);
  ctx.fillStyle = '#888888';
  ctx.font = '14px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText('Sustainable', statsStartX + statsGap * 3, statsY + 22);

  // Draw chart
  drawChart(ctx, projection, years, 80, 300, 1040, 380);

  // Parameters section
  const paramsY = 710;
  ctx.fillStyle = '#666666';
  ctx.font = '13px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.textAlign = 'center';

  const params: string[] = [];
  params.push(`Starting: ${currentSOL.toFixed(2)} SOL`);
  if (dcaMonthly > 0) {
    params.push(`DCA: $${dcaMonthly}/month`);
  }
  params.push('25% CAGR with auto decay');
  params.push('3.5% inflation (always applied)');

  ctx.fillText(params.join('  •  '), canvas.width / 2, paramsY);

  // Footer
  const footerY = 760;
  ctx.fillStyle = '#555555';
  ctx.font = '14px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText(
    'Not financial advice. Projections are hypothetical and do not guarantee future results.',
    canvas.width / 2,
    footerY
  );

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
  const file = new File([blob], 'retireonsol-charlie-projection.png', { type: 'image/png' });

  // Try native share if available (mobile)
  if (navigator.share && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: 'My RetireOnSol Projection',
        text: `Check out my ${options.years}-year SOL projection: ${formatUSD(options.projection.p50)}`,
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
  a.download = 'retireonsol-charlie-projection.png';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
