import { Share2 } from 'lucide-react';
import { formatUSD, type RetirementProjection } from '../utils/calculationsBasic';
import { shareProjection } from '../utils/shareImageBasic';
import './Results.css';

interface ResultsProps {
  projection: RetirementProjection;
  years: number;
  currentSOL: number;
  dcaMonthly: number;
}

export function Results({ projection, years, currentSOL, dcaMonthly }: ResultsProps) {
  const roi = ((projection.todaysP50 - projection.totalInvested) / projection.totalInvested) * 100;
  const sustainable = projection.yearsOfIncome >= 30;

  const handleShare = async () => {
    try {
      await shareProjection({ projection, years, currentSOL, dcaMonthly });
    } catch (error) {
      console.error('Failed to share:', error);
      alert('Failed to generate share image. Please try again.');
    }
  };

  return (
    <div className="results card">
      <div className="results-header">
        <h2>Your Projection</h2>
        <button className="share-btn" onClick={handleShare} title="Share projection">
          <Share2 size={18} />
        </button>
      </div>
      <div className="result-card primary">
        <div className="result-label">Portfolio Value (Today's Dollars)</div>
        <div className="result-value">{formatUSD(projection.todaysP50)}</div>
        <div style={{ fontSize: '0.85em', color: '#888', marginTop: '4px' }}>
          Nominal: {formatUSD(projection.p50)}
        </div>
        <div className="result-range">
          <div style={{ fontSize: '0.9em', marginTop: '8px', color: '#888' }}>
            <div>Pessimistic (P10): {formatUSD(projection.todaysP10)}</div>
            <div>Median (P50): {formatUSD(projection.todaysP50)}</div>
            <div>Optimistic (P90): {formatUSD(projection.todaysP90)}</div>
          </div>
        </div>
      </div>

      <div className="result-grid">
        <div className="result-card">
          <div className="result-label">Total Invested</div>
          <div className="result-value-sm">{formatUSD(projection.totalInvested)}</div>
        </div>

        <div className="result-card">
          <div className="result-label">ROI (Real)</div>
          <div className={`result-value-sm ${roi > 100 ? 'positive' : ''}`}>
            +{roi.toFixed(0)}%
          </div>
        </div>

        <div className="result-card">
          <div className="result-label">Monthly Income</div>
          <div className="result-value-sm">{formatUSD(projection.monthlyIncome)}/mo</div>
          <div className="result-sublabel">(in today's money)</div>
        </div>

        <div className="result-card">
          <div className="result-label">Years of Income</div>
          <div className={`result-value-sm ${sustainable ? 'positive' : 'warning'}`}>
            {projection.yearsOfIncome.toFixed(1)} years
          </div>
        </div>
      </div>

      <div style={{ fontSize: '0.85em', color: '#666', marginTop: '12px', fontStyle: 'italic' }}>
        SOL @ ${projection.solPrice.toFixed(0)} | 25% CAGR auto-decay | 3.5% inflation
      </div>

      {!sustainable && (
        <div className="warning-banner">
          Your portfolio may not last 30+ years at this withdrawal rate.
          Consider increasing DCA or reducing monthly income.
        </div>
      )}

      {sustainable && (
        <div className="success-banner">
          Your plan looks sustainable! You can withdraw {formatUSD(projection.monthlyIncome)}/month
          for {projection.yearsOfIncome.toFixed(0)} years.
        </div>
      )}
    </div>
  );
}
