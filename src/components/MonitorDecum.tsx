/**
 * MonitorDecum — Decumulation (spend) phase monitoring
 *
 * Shows:
 * 1. Balance status (wallet vs expected remaining balance)
 * 2. Withdrawal schedule (next date, pace tracking)
 * 3. Spend progress
 */

import { formatUSD, formatSOL } from '../utils/calculations';
import { daysSince } from '../utils/dcaSchedule';
import type { ActivePlan } from '../utils/storage';
import './MonitorDecum.css';

export interface MonitorDecumProps {
  activePlan: ActivePlan;
  walletSOL: number | null;
  walletJitoSOL: number | null;
  currentPrice: number | null;
  connected: boolean;
  demoDate?: Date | null;
}

interface WithdrawalScheduleResult {
  totalWithdrawalsDue: number;
  totalWithdrawnUSD: number;
  nextWithdrawalDate: Date;
  monthsElapsed: number;
  expectedRemainingUSD: number;
}

function calculateWithdrawalSchedule(
  activatedAt: string,
  monthlyIncome: number,
  _retirementYears: number,
  startingValueUSD: number,
  now?: Date,
  startPhase?: 'accum' | 'decum',
  accumYears?: number
): WithdrawalScheduleResult | null {
  const currentDate = now ?? new Date();
  const activationDate = new Date(activatedAt);

  // Determine effective start date for withdrawals
  let startDate = activationDate;

  if (startPhase === 'accum') {
    // If in accumulation phase, decumulation starts after accumulation years
    const decumStartDate = new Date(activationDate);
    decumStartDate.setFullYear(decumStartDate.getFullYear() + (accumYears || 0));

    if (currentDate < decumStartDate) {
      return null; // Not in decumulation phase yet
    }
    startDate = decumStartDate;
  }

  // Calculate months elapsed since decumulation start
  const diffMs = currentDate.getTime() - startDate.getTime();
  const monthsElapsed = Math.max(
    0,
    Math.floor(diffMs / (1000 * 60 * 60 * 24 * 30.44))
  );

  const totalWithdrawalsDue = monthsElapsed;
  const totalWithdrawnUSD = totalWithdrawalsDue * monthlyIncome;

  // Simple expected remaining (doesn't account for growth — conservative)
  const expectedRemainingUSD = Math.max(0, startingValueUSD - totalWithdrawnUSD);

  // Next withdrawal: start date + (monthsElapsed + 1) months
  const nextWithdrawalDate = new Date(startDate);
  nextWithdrawalDate.setMonth(
    nextWithdrawalDate.getMonth() + monthsElapsed + 1
  );

  return {
    totalWithdrawalsDue,
    totalWithdrawnUSD,
    nextWithdrawalDate,
    monthsElapsed,
    expectedRemainingUSD,
  };
}

export function MonitorDecum({
  activePlan,
  walletSOL,
  walletJitoSOL,
  currentPrice,
  connected,
  demoDate,
}: MonitorDecumProps) {
  const { settings, activatedAt } = activePlan;
  const monthlyIncome = settings.spendMonthlyIncome;
  const retirementYears = settings.spendRetirementYears;

  const solBalance = walletSOL ?? 0;
  const jitoBalance = walletJitoSOL ?? 0;
  const totalBalance = solBalance + jitoBalance;
  const walletValueUSD = currentPrice ? totalBalance * currentPrice : null;

  // Estimate starting value from plan settings
  const startingSOL = settings.currentSOL + settings.currentJitoSOL;
  const startingValueUSD = currentPrice ? startingSOL * currentPrice : 0;

  const schedule = calculateWithdrawalSchedule(
    activatedAt,
    monthlyIncome,
    retirementYears,
    startingValueUSD,
    demoDate || undefined,
    activePlan.startPhase,
    settings.years
  );

  if (!schedule) {
    const accumEndDate = new Date(activatedAt);
    accumEndDate.setFullYear(accumEndDate.getFullYear() + settings.years);

    return (
      <div className="monitor-decum">
        <div className="monitor-decum-section">
          <h3>⏳ Accumulation Phase Active</h3>
          <p style={{ textAlign: 'center', color: '#888', margin: '20px 0' }}>
            Decumulation is scheduled to start on<br />
            <strong style={{ color: '#F5A623', fontSize: '1.1rem' }}>
              {accumEndDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
            </strong>
          </p>
          <div style={{ padding: '12px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '8px', textAlign: 'center' }}>
            <p style={{ margin: '0 0 8px 0', fontSize: '0.9rem' }}>Projected Starting Balance</p>
            <strong style={{ fontSize: '1.2rem', color: '#14F195' }}>{formatUSD(startingValueUSD)}</strong>
          </div>
        </div>
      </div>
    );
  }

  const daysActive = daysSince(activatedAt, demoDate || undefined);
  const totalRetirementMonths = retirementYears * 12;
  const monthsRemaining = Math.max(
    0,
    totalRetirementMonths - schedule.monthsElapsed
  );

  // Pace analysis
  let paceStatus: 'on-track' | 'too-fast' | 'too-slow' | 'unknown' = 'unknown';
  if (connected && walletValueUSD !== null && currentPrice) {
    const expectedRemaining = schedule.expectedRemainingUSD;
    const ratio = walletValueUSD / (expectedRemaining || 1);
    if (ratio > 1.1) paceStatus = 'too-slow'; // more than expected = withdrawing slower
    else if (ratio < 0.9) paceStatus = 'too-fast'; // less than expected = withdrawing faster
    else paceStatus = 'on-track';
  }

  return (
    <div className="monitor-decum">
      {/* ── Balance Status ── */}
      <div className="monitor-decum-section">
        <h3>💰 Balance Status</h3>
        {!connected ? (
          <p className="decum-note">
            Connect your wallet to compare your balance against the plan
          </p>
        ) : (
          <div className="balance-comparison">
            {walletValueUSD !== null && (
              <div className="balance-row">
                <span className="balance-label">Wallet value:</span>
                <span className="balance-value highlight">
                  {formatUSD(walletValueUSD)}
                </span>
                <span className="balance-detail">
                  ({formatSOL(totalBalance)} SOL)
                </span>
              </div>
            )}
            {currentPrice !== null && (
              <div className="balance-row">
                <span className="balance-label">Expected remaining:</span>
                <span className="balance-value">
                  {formatUSD(schedule.expectedRemainingUSD)}
                </span>
              </div>
            )}

            {paceStatus === 'on-track' && (
              <div className="pace-indicator pace-on-track">
                ✅ You&apos;re on track with your withdrawal plan
              </div>
            )}
            {paceStatus === 'too-fast' && (
              <div className="pace-indicator pace-too-fast">
                ⚠️ You&apos;re withdrawing faster than planned — balance is lower
                than expected
              </div>
            )}
            {paceStatus === 'too-slow' && (
              <div className="pace-indicator pace-too-slow">
                💪 You have more than expected — you could increase withdrawals or
                you&apos;re ahead of plan
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Withdrawal Schedule ── */}
      <div className="monitor-decum-section">
        <h3>📅 Withdrawal Schedule</h3>
        <div className="withdrawal-info">
          <div className="withdrawal-row">
            <span className="withdrawal-label">Monthly withdrawal:</span>
            <span className="withdrawal-value">
              {formatUSD(monthlyIncome)}
            </span>
          </div>
          <div className="withdrawal-row">
            <span className="withdrawal-label">Next withdrawal:</span>
            <span className="withdrawal-value">
              {schedule.nextWithdrawalDate.toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}
            </span>
          </div>
          <div className="withdrawal-row">
            <span className="withdrawal-label">Withdrawals made:</span>
            <span className="withdrawal-value">
              {schedule.totalWithdrawalsDue} of {totalRetirementMonths} total
            </span>
          </div>
          <div className="withdrawal-row">
            <span className="withdrawal-label">Total withdrawn (est.):</span>
            <span className="withdrawal-value">
              {formatUSD(schedule.totalWithdrawnUSD)}
            </span>
          </div>
        </div>
      </div>

      {/* ── Spend Progress ── */}
      <div className="monitor-decum-section">
        <h3>📈 Spend Progress</h3>
        <div className="spend-stats">
          <div className="spend-stat">
            <span className="spend-stat-label">Days in retirement</span>
            <span className="spend-stat-value">{daysActive}</span>
          </div>
          <div className="spend-stat">
            <span className="spend-stat-label">Months elapsed</span>
            <span className="spend-stat-value">{schedule.monthsElapsed}</span>
          </div>
          <div className="spend-stat">
            <span className="spend-stat-label">Months remaining</span>
            <span className="spend-stat-value">{monthsRemaining}</span>
          </div>
          <div className="spend-stat">
            <span className="spend-stat-label">Retirement plan</span>
            <span className="spend-stat-value">{retirementYears} years</span>
          </div>
        </div>
      </div>
    </div>
  );
}
