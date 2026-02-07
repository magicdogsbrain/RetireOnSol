import { useState, useMemo } from 'react';
import { type ActivePlan } from '../utils/storage';
import { calculateProjection, formatUSD, type ProjectionInput } from '../utils/calculations';

interface CancelPlanModalProps {
  activePlan: ActivePlan;
  currentPrice: number | null;
  onConfirm: () => void;
  onClose: () => void;
  demoDate?: Date | null;
}

export function CancelPlanModal({ activePlan, currentPrice, onConfirm, onClose, demoDate }: CancelPlanModalProps) {
  const [confirmText, setConfirmText] = useState('');

  const activatedDate = new Date(activePlan.activatedAt);
  const now = demoDate || new Date();
  const elapsedMs = now.getTime() - activatedDate.getTime();
  const elapsedDays = Math.max(0, Math.floor(elapsedMs / (1000 * 60 * 60 * 24)));
  const elapsedMonths = Math.floor(elapsedDays / 30.44);
  const remainderDays = elapsedDays - Math.round(elapsedMonths * 30.44);

  const elapsedLabel = elapsedMonths > 0
    ? `${elapsedMonths} month${elapsedMonths !== 1 ? 's' : ''}${remainderDays > 0 ? ` and ${remainderDays} day${remainderDays !== 1 ? 's' : ''}` : ''}`
    : `${elapsedDays} day${elapsedDays !== 1 ? 's' : ''}`;

  // Calculate projected final value using stored plan settings
  const projection = useMemo(() => {
    const s = activePlan.settings;
    const price = currentPrice ?? 150; // fallback
    const input: ProjectionInput = {
      currentSOL: s.currentSOL + s.currentJitoSOL,
      currentPrice: price,
      years: s.years,
      dcaAmountUSD: s.dcaAmountUSD,
      dcaFrequency: s.dcaFrequency,
      growthModel: s.growthModel,
      modelParams: {
        cagr: s.modelParams.cagr,
        cagrDecay: s.modelParams.cagrDecay,
        powerLawSlope: s.modelParams.powerLawSlope,
        sCurveYearsToHalfRemaining: s.modelParams.sCurveYearsToHalfRemaining,
      },
      jitoSOLEnabled: s.jitoSOLEnabled,
      jitoSOLAPR: s.jitoSOLAPR,
    };
    return calculateProjection(input);
  }, [activePlan.settings, currentPrice]);

  // Rough current progress: linear interpolation based on elapsed time
  const elapsedYears = elapsedDays / 365.25;

  // Find the closest year in projections for a rough estimate
  const closestYearIdx = Math.max(0, Math.min(
    projection.projections.length - 1,
    Math.round(elapsedYears) - 1
  ));
  const currentProgressValue = elapsedYears < 1
    ? (activePlan.settings.currentSOL + activePlan.settings.currentJitoSOL) * (currentPrice ?? 150)
    : projection.projections[closestYearIdx]?.portfolioValueUSD ?? 0;
  const progressFraction = Math.min(1, elapsedYears / activePlan.settings.years);

  const canConfirm = confirmText.trim().toUpperCase() === 'CANCEL';

  return (
    <div className="cancel-modal-overlay" onClick={onClose}>
      <div className="cancel-modal" onClick={(e) => e.stopPropagation()}>
        <div className="cancel-modal-header">
          <span className="cancel-modal-icon">Warning</span>
          <h2>Cancel Plan Execution?</h2>
        </div>

        <div className="cancel-modal-body">
          <div className="cancel-stat cancel-stat-warning">
            <span className="cancel-stat-label">Time Invested</span>
            <span className="cancel-stat-value">{elapsedLabel}</span>
          </div>

          <div className="cancel-stats-row">
            <div className="cancel-stat">
              <span className="cancel-stat-label">Projected Final Value</span>
              <span className="cancel-stat-value cancel-stat-green">{formatUSD(projection.finalValueUSD)}</span>
              <span className="cancel-stat-sub">after {activePlan.settings.years} years</span>
            </div>
            <div className="cancel-stat">
              <span className="cancel-stat-label">Rough Progress</span>
              <span className="cancel-stat-value">{formatUSD(currentProgressValue)}</span>
              <span className="cancel-stat-sub">{(progressFraction * 100).toFixed(1)}% of timeline</span>
            </div>
          </div>

          <div className="cancel-warning-message">
            <p>Cancelling will <strong>deactivate your plan</strong> and stop all tracking. Your plan settings will still be available in the Plan tab for editing.</p>
            <p>This action is deliberate. Type <strong>CANCEL</strong> below to confirm.</p>
          </div>

          <div className="cancel-confirm-input">
            <input
              type="text"
              placeholder='Type "CANCEL" to confirm'
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              autoFocus
            />
          </div>
        </div>

        <div className="cancel-modal-footer">
          <button
            type="button"
            className="cancel-modal-keep-btn"
            onClick={onClose}
          >
            Keep Plan Active
          </button>
          <button
            type="button"
            className="cancel-modal-confirm-btn"
            disabled={!canConfirm}
            onClick={onConfirm}
          >
            Cancel Execution
          </button>
        </div>
      </div>
    </div>
  );
}
