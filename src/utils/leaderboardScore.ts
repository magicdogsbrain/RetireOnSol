/**
 * Leaderboard Score Calculator
 *
 * Computes a "Commitment Score" (0–1000) based on:
 *   - DCA Streak (40%, max 400) — consecutive completed DCAs, capped at 52
 *   - Plan Duration (25%, max 250) — days since plan activation, capped at 365
 *   - DCA Completion Rate (20%, max 200) — completedCount / totalDueCount
 *   - Plan Funded (15%, 150 bonus) — wallet balance >= plan target
 *
 * Points are awarded for streaks and duration, not monetary value.
 * No amounts are ever included in the payload.
 */

import { daysSince } from './dcaSchedule';
import type { ActivePlan } from './storage';

export interface ScoreBreakdown {
  dcaStreak: number;          // consecutive completed DCAs
  streakPoints: number;       // 0–400
  daysActive: number;         // days since activation
  durationPoints: number;     // 0–250
  dcaCompletionRate: number;  // 0.0–1.0
  completionPoints: number;   // 0–200
  planFunded: boolean;        // wallet >= target
  fundedPoints: number;       // 0 or 150
  totalScore: number;         // 0–1000
}

export interface ScorePayload {
  totalScore: number;
  dcaStreak: number;
  daysActive: number;
  dcaCompletionRate: number;
  planFunded: boolean;
  timestamp: number;
  appVersion: string;
}

/**
 * Calculate the longest streak of consecutive completed DCAs from the end
 * (most recent first). A "streak" means no gaps — every due DCA from the
 * most recent one backwards was completed.
 */
export function calculateDCAStreak(
  allDueDates: Date[],
  completedDCAs: Set<string>
): number {
  if (allDueDates.length === 0) return 0;

  let streak = 0;
  // Walk backwards from most recent due date
  for (let i = allDueDates.length - 1; i >= 0; i--) {
    if (completedDCAs.has(allDueDates[i].toISOString())) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

/**
 * Calculate the full commitment score breakdown.
 */
export function calculateCommitmentScore(
  activePlan: ActivePlan,
  allDueDates: Date[],
  completedDCAs: Set<string>,
  totalDueCount: number,
  walletSOL: number,
  walletJitoSOL: number,
): ScoreBreakdown {
  // DCA Streak — max at 52 (one year of weekly DCAs)
  const dcaStreak = calculateDCAStreak(allDueDates, completedDCAs);
  const streakPoints = Math.round(Math.min(dcaStreak / 52, 1) * 400);

  // Plan Duration — max at 365 days
  const daysActive = daysSince(activePlan.activatedAt);
  const durationPoints = Math.round(Math.min(daysActive / 365, 1) * 250);

  // DCA Completion Rate
  const completedCount = totalDueCount > 0
    ? allDueDates.filter(d => completedDCAs.has(d.toISOString())).length
    : 0;
  const dcaCompletionRate = totalDueCount > 0 ? completedCount / totalDueCount : 1;
  const completionPoints = Math.round(dcaCompletionRate * 200);

  // Plan Funded — wallet balance meets or exceeds plan targets
  const targetSOL = activePlan.settings.currentSOL;
  const targetJitoSOL = activePlan.settings.currentJitoSOL;
  const planFunded = walletSOL >= targetSOL && walletJitoSOL >= targetJitoSOL;
  const fundedPoints = planFunded ? 150 : 0;

  const totalScore = streakPoints + durationPoints + completionPoints + fundedPoints;

  return {
    dcaStreak,
    streakPoints,
    daysActive,
    durationPoints,
    dcaCompletionRate,
    completionPoints,
    planFunded,
    fundedPoints,
    totalScore,
  };
}

/**
 * Build the score payload to send to the worker.
 */
export function buildScorePayload(
  _seekerName: string,
  score: ScoreBreakdown,
  appVersion: string
): ScorePayload {
  return {
    totalScore: score.totalScore,
    dcaStreak: score.dcaStreak,
    daysActive: score.daysActive,
    dcaCompletionRate: Math.round(score.dcaCompletionRate * 100) / 100,
    planFunded: score.planFunded,
    timestamp: Date.now(),
    appVersion,
  };
}

// localStorage key for leaderboard opt-in
export const LEADERBOARD_OPTIN_KEY = 'retireonsol_leaderboard_optin';

export function isLeaderboardOptedIn(): boolean {
  try {
    return localStorage.getItem(LEADERBOARD_OPTIN_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setLeaderboardOptIn(value: boolean): void {
  try {
    if (value) {
      localStorage.setItem(LEADERBOARD_OPTIN_KEY, 'true');
    } else {
      localStorage.removeItem(LEADERBOARD_OPTIN_KEY);
    }
  } catch {
    // ignore
  }
}

// localStorage keys for cached Seeker identity
const SEEKER_WALLET_KEY = 'retireonsol_leaderboard_seeker_id';  // base58 wallet address (for signing)
const SEEKER_NAME_KEY = 'retireonsol_leaderboard_seeker_name';  // .skr display name

/** Get the cached wallet address (base58) used for signing */
export function getSeekerID(): string | null {
  try {
    return localStorage.getItem(SEEKER_WALLET_KEY);
  } catch {
    return null;
  }
}

/** Store or clear the wallet address */
export function setSeekerID(address: string | null): void {
  try {
    if (address) {
      localStorage.setItem(SEEKER_WALLET_KEY, address);
    } else {
      localStorage.removeItem(SEEKER_WALLET_KEY);
      localStorage.removeItem(SEEKER_NAME_KEY);
    }
  } catch {
    // ignore
  }
}

/** Get the cached .skr display name (e.g. "magicspider.skr") */
export function getSeekerName(): string | null {
  try {
    return localStorage.getItem(SEEKER_NAME_KEY);
  } catch {
    return null;
  }
}

/** Store or clear the .skr display name */
export function setSeekerName(name: string | null): void {
  try {
    if (name) {
      localStorage.setItem(SEEKER_NAME_KEY, name);
    } else {
      localStorage.removeItem(SEEKER_NAME_KEY);
    }
  } catch {
    // ignore
  }
}

// ── Submit timing ─────────────────────────────────────────────────────
const LAST_SUBMIT_KEY = 'retireonsol_leaderboard_last_submit';

/** Get the last submit timestamp (ms since epoch), or 0 if never submitted */
export function getLastSubmitTime(): number {
  try {
    const val = localStorage.getItem(LAST_SUBMIT_KEY);
    return val ? parseInt(val, 10) : 0;
  } catch {
    return 0;
  }
}

/** Store the current time as last submit */
export function setLastSubmitTime(): void {
  try {
    localStorage.setItem(LAST_SUBMIT_KEY, String(Date.now()));
  } catch {
    // ignore
  }
}

/** Whether at least 1 hour has passed since last submit */
export function canSubmitNow(): boolean {
  return Date.now() - getLastSubmitTime() > 60 * 60 * 1000;
}
