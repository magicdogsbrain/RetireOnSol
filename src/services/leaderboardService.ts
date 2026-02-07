/**
 * Leaderboard API Service
 *
 * Communicates with the Cloudflare Worker backend for score submission
 * and leaderboard retrieval.
 *
 * Auth model: NONE — just seekerID (.skr name) and scores.
 */

const BASE_URL = import.meta.env.VITE_LEADERBOARD_URL as string | undefined;

export interface LeaderboardEntry {
  seekerID: string;
  totalScore: number;
  dcaStreak: number;
  daysActive: number;
  dcaCompletionRate: number;
  planFunded: boolean;
  timestamp: number;
  rank: number;
}

export interface LeaderboardResponse {
  entries: LeaderboardEntry[];
  totalUsers: number;
}

export interface RankResponse {
  rank: number;
  totalUsers: number;
  entry: LeaderboardEntry | null;
}

function getBaseUrl(): string {
  if (!BASE_URL) {
    throw new Error('VITE_LEADERBOARD_URL not configured');
  }
  return BASE_URL.replace(/\/$/, '');
}

// ── API calls ──────────────────────────────────────────────────────────

/**
 * Submit a score. No auth — just seekerID and score payload.
 */
export async function submitScore(
  seekerID: string,
  score: {
    totalScore: number;
    dcaStreak: number;
    daysActive: number;
    dcaCompletionRate: number;
    planFunded: boolean;
    timestamp: number;
    appVersion: string;
  }
): Promise<LeaderboardResponse> {
  const res = await fetch(`${getBaseUrl()}/api/score`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ seekerID, score }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => 'Unknown error');
    throw new Error(`Submit failed (${res.status}): ${text}`);
  }

  return res.json();
}

/**
 * Fetch the top leaderboard entries.
 */
export async function fetchLeaderboard(limit = 50): Promise<LeaderboardResponse> {
  const res = await fetch(`${getBaseUrl()}/api/leaderboard?limit=${limit}`);

  if (!res.ok) {
    throw new Error(`Fetch leaderboard failed (${res.status})`);
  }

  return res.json();
}

/**
 * Fetch a specific seeker's rank.
 */
export async function fetchRank(seekerID: string): Promise<RankResponse> {
  const res = await fetch(`${getBaseUrl()}/api/rank/${encodeURIComponent(seekerID)}`);

  if (!res.ok) {
    throw new Error(`Fetch rank failed (${res.status})`);
  }

  return res.json();
}

/**
 * Check if the leaderboard service is configured and available.
 */
export function isLeaderboardConfigured(): boolean {
  return !!BASE_URL;
}

/**
 * Clean up old auth token from localStorage (migration from V3.5).
 */
export function cleanupLegacyAuth(): void {
  try {
    localStorage.removeItem('retireonsol_leaderboard_auth_token');
  } catch {
    // ignore
  }
}
