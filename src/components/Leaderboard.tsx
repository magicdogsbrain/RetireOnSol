/**
 * Leaderboard Display Component
 *
 * Seeker-only leaderboard with auto-submit.
 * - Phantom users see "Seeker wallet required" message
 * - Seeker users can opt in/out
 * - Score auto-submits every hour when opted in
 * - No manual submit button, no auth tokens
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useWallet } from '../contexts/WalletProvider';
import {
  type ScoreBreakdown,
  calculateCommitmentScore,
  buildScorePayload,
  isLeaderboardOptedIn,
  setLeaderboardOptIn,
  getSeekerName,
  canSubmitNow,
  setLastSubmitTime,
} from '../utils/leaderboardScore';
import { calculateDCASchedule } from '../utils/dcaSchedule';
import {
  submitScore,
  fetchLeaderboard,
  isLeaderboardConfigured,
  cleanupLegacyAuth,
  type LeaderboardEntry,
} from '../services/leaderboardService';
import type { ActivePlan } from '../utils/storage';
import { version as APP_VERSION } from '../../package.json';
import './Leaderboard.css';

interface LeaderboardProps {
  activePlan: ActivePlan;
  walletSOL: number;
  walletJitoSOL: number;
  completedDCAs: Set<string>;
}

export function Leaderboard({ activePlan, walletSOL, walletJitoSOL, completedDCAs }: LeaderboardProps) {
  const { accountLabel, connect, connected } = useWallet();

  const [score, setScore] = useState<ScoreBreakdown | null>(null);
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [userRank, setUserRank] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [triedConnect, setTriedConnect] = useState(false);

  const configured = isLeaderboardConfigured();
  const [optedIn, setOptedInState] = useState(isLeaderboardOptedIn);

  // Seeker detection: accountLabel ends with .skr, or cached .skr name from previous session
  const seekerName = accountLabel?.endsWith('.skr') ? accountLabel : getSeekerName();
  const isSeeker = !!seekerName;

  // Connect wallet from leaderboard page
  const handleConnect = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      await connect();
      setTriedConnect(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Connection failed: ${msg}`);
    } finally {
      setConnecting(false);
    }
  }, [connect]);

  // Clean up legacy auth token from V3.5
  useEffect(() => { cleanupLegacyAuth(); }, []);

  // Calculate local score
  useEffect(() => {
    if (!activePlan) return;
    const dcaSchedule = calculateDCASchedule(
      activePlan.activatedAt,
      activePlan.settings.dcaFrequency,
      activePlan.settings.dcaAmountUSD
    );
    const breakdown = calculateCommitmentScore(
      activePlan,
      dcaSchedule.allDueDates,
      completedDCAs,
      dcaSchedule.totalDueCount,
      walletSOL,
      walletJitoSOL,
    );
    setScore(breakdown);
  }, [activePlan, completedDCAs, walletSOL, walletJitoSOL]);

  // Fetch leaderboard
  const loadLeaderboard = useCallback(async () => {
    if (!configured) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchLeaderboard(50);
      setEntries(data.entries);
      setTotalUsers(data.totalUsers);
      if (seekerName) {
        const idx = data.entries.findIndex(e => e.seekerID === seekerName);
        setUserRank(idx >= 0 ? idx + 1 : null);
      }
    } catch (err) {
      setError('Could not load leaderboard');
      console.warn('Leaderboard fetch failed:', err);
    } finally {
      setLoading(false);
    }
  }, [configured, seekerName]);

  // Load leaderboard when opted in
  useEffect(() => {
    if (optedIn && isSeeker) {
      loadLeaderboard();
    }
  }, [optedIn, isSeeker, loadLeaderboard]);

  // Auto-submit score every hour
  const autoSubmitRef = useRef(false);
  useEffect(() => {
    if (!optedIn || !isSeeker || !seekerName || !score || !configured) return;
    if (!canSubmitNow()) return;
    if (autoSubmitRef.current) return; // prevent double-submit in strict mode
    autoSubmitRef.current = true;

    const payload = buildScorePayload(seekerName, score, APP_VERSION);
    submitScore(seekerName, payload)
      .then((data) => {
        setEntries(data.entries);
        setTotalUsers(data.totalUsers);
        const idx = data.entries.findIndex(e => e.seekerID === seekerName);
        setUserRank(idx >= 0 ? idx + 1 : null);
        setLastSubmitTime();
        console.log('[Leaderboard] Auto-submitted score');
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes('429')) {
          console.warn('[Leaderboard] Auto-submit failed:', err);
        }
      })
      .finally(() => {
        autoSubmitRef.current = false;
      });
  }, [optedIn, isSeeker, seekerName, score, configured]);

  // Also auto-submit on tab focus if an hour has passed
  useEffect(() => {
    if (!optedIn || !isSeeker || !seekerName || !configured) return;

    const handleFocus = () => {
      if (!canSubmitNow() || !score) return;

      const payload = buildScorePayload(seekerName, score, APP_VERSION);
      submitScore(seekerName, payload)
        .then((data) => {
          setEntries(data.entries);
          setTotalUsers(data.totalUsers);
          const idx = data.entries.findIndex(e => e.seekerID === seekerName);
          setUserRank(idx >= 0 ? idx + 1 : null);
          setLastSubmitTime();
        })
        .catch(() => {});
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') handleFocus();
    });

    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }, [optedIn, isSeeker, seekerName, score, configured]);

  // Join — immediate submit, bypasses canSubmitNow(), then always fetch leaderboard
  const handleJoin = useCallback(async () => {
    setLeaderboardOptIn(true);
    setOptedInState(true);
    if (seekerName && score && configured) {
      try {
        const payload = buildScorePayload(seekerName, score, APP_VERSION);
        const data = await submitScore(seekerName, payload);
        setEntries(data.entries);
        setTotalUsers(data.totalUsers);
        const idx = data.entries.findIndex(e => e.seekerID === seekerName);
        setUserRank(idx >= 0 ? idx + 1 : null);
        setLastSubmitTime();
        console.log('[Leaderboard] Submitted on join');
        return; // submit returned full leaderboard, done
      } catch (err) {
        console.warn('[Leaderboard] Join submit failed:', err);
      }
    }
    // If submit failed or wasn't possible, fetch leaderboard via GET
    if (configured) {
      try {
        const data = await fetchLeaderboard(50);
        setEntries(data.entries);
        setTotalUsers(data.totalUsers);
        if (seekerName) {
          const idx = data.entries.findIndex(e => e.seekerID === seekerName);
          setUserRank(idx >= 0 ? idx + 1 : null);
        }
      } catch {}
    }
  }, [seekerName, score, configured]);

  // Opt out
  const handleOptOut = useCallback(() => {
    setLeaderboardOptIn(false);
    setOptedInState(false);
    setEntries([]);
    setUserRank(null);
  }, []);

  // ── Not Seeker: show connect or rejection ──
  if (!isSeeker) {
    // They connected but got a non-.skr wallet (Phantom)
    const isPhantom = triedConnect && connected && !isSeeker;

    return (
      <div className="leaderboard">
        <div className="leaderboard-section" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>🏆</div>
          <h3 style={{ color: 'var(--sol-purple)', marginBottom: '0.5rem' }}>Leaderboard</h3>
          {isPhantom ? (
            <>
              <p style={{ color: '#ff6b6b', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                Seeker wallet required for the leaderboard.
              </p>
              <p style={{ color: '#666', fontSize: '0.8rem', marginBottom: '1rem' }}>
                You connected with a non-Seeker wallet. Please use a Seeker Vault (.skr) wallet.
              </p>
              <button
                type="button"
                className="seeker-connect-btn"
                onClick={handleConnect}
                disabled={connecting}
              >
                {connecting ? 'Connecting...' : 'Try Again'}
              </button>
            </>
          ) : (
            <>
              <p style={{ color: '#888', fontSize: '0.9rem', marginBottom: '1rem' }}>
                Connect your Seeker Vault wallet to join the leaderboard.
              </p>
              <button
                type="button"
                className="seeker-connect-btn"
                onClick={handleConnect}
                disabled={connecting}
              >
                {connecting ? 'Connecting...' : 'Connect Seeker Wallet'}
              </button>
              <p style={{ color: '#666', fontSize: '0.75rem', marginTop: '8px' }}>
                Choose Seed Vault when prompted
              </p>
            </>
          )}
          {error && (
            <p style={{ color: '#ff6b6b', fontSize: '0.8rem', marginTop: '8px' }}>{error}</p>
          )}
        </div>
      </div>
    );
  }

  // ── Seeker + not opted in ──
  if (!optedIn) {
    return (
      <div className="leaderboard">
        <div className="leaderboard-section" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>🏆</div>
          <h3 style={{ color: 'var(--sol-purple)', marginBottom: '0.5rem' }}>Leaderboard</h3>
          <p style={{ color: '#888', fontSize: '0.9rem', marginBottom: '1rem' }}>
            Track your commitment score and compete with the community.
          </p>
          <button
            type="button"
            className="seeker-connect-btn"
            onClick={handleJoin}
          >
            Join Leaderboard
          </button>
          <p style={{ color: '#666', fontSize: '0.75rem', marginTop: '8px' }}>
            Your score will auto-update every hour as {seekerName}
          </p>
        </div>
      </div>
    );
  }

  // ── Seeker + opted in ──
  return (
    <div className="leaderboard">
      {/* Seeker ID badge */}
      <div className="leaderboard-section">
        <div className="wallet-badge-group">
          <div className="wallet-badge">
            <span className="wallet-dot"></span>
            <span>{seekerName}</span>
          </div>
        </div>
      </div>

      {/* Your Score */}
      {score && (
        <div className="leaderboard-section">
          <h3>Your Score</h3>
          <div className="score-total">
            <span className="score-total-number">{score.totalScore}</span>
            <span className="score-total-max">/ 1000</span>
          </div>
          {userRank && (
            <div className="score-rank">
              Rank #{userRank} of {totalUsers}
            </div>
          )}

          <div className="score-breakdown">
            <ScoreBar label="DCA Streak" value={score.streakPoints} max={400}
              detail={`${score.dcaStreak} consecutive`} icon="🔥" />
            <ScoreBar label="Plan Duration" value={score.durationPoints} max={250}
              detail={`${score.daysActive} days`} icon="📅" />
            <ScoreBar label="Completion Rate" value={score.completionPoints} max={200}
              detail={`${Math.round(score.dcaCompletionRate * 100)}%`} icon="✅" />
            <ScoreBar label="Plan Funded" value={score.fundedPoints} max={150}
              detail={score.planFunded ? 'Yes' : 'Not yet'} icon="💰" />
          </div>

          <p className="score-note" style={{ textAlign: 'center', marginTop: '8px' }}>
            Score auto-updates every hour
          </p>
        </div>
      )}

      {/* Leaderboard Table */}
      {entries.length > 0 && (
        <div className="leaderboard-section">
          <h3>Top {entries.length}</h3>
          <div className="leaderboard-table-wrap">
            <table className="leaderboard-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Seeker</th>
                  <th>Score</th>
                  <th>Streak</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => {
                  const isYou = entry.seekerID === seekerName;
                  return (
                    <tr key={entry.rank} className={isYou ? 'leaderboard-row-you' : ''}>
                      <td className="leaderboard-rank">{entry.rank}</td>
                      <td className="leaderboard-wallet">
                        {entry.seekerID}
                        {isYou && <span className="leaderboard-you-badge">YOU</span>}
                      </td>
                      <td className="leaderboard-score">{entry.totalScore}</td>
                      <td className="leaderboard-streak">{entry.dcaStreak}w</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && entries.length === 0 && (
        <div className="leaderboard-section" style={{ textAlign: 'center', color: '#888' }}>
          No entries yet. Your score will appear shortly.
        </div>
      )}

      {loading && (
        <div className="leaderboard-section" style={{ textAlign: 'center', color: '#888' }}>
          Loading leaderboard...
        </div>
      )}

      {error && (
        <div className="leaderboard-section" style={{ textAlign: 'center', color: '#ff6b6b' }}>
          {error}
        </div>
      )}

      {/* Opt out */}
      <div className="leaderboard-section leaderboard-opt-out">
        <button
          type="button"
          className="leaderboard-opt-out-btn"
          onClick={handleOptOut}
        >
          Leave Leaderboard
        </button>
      </div>
    </div>
  );
}

function ScoreBar({ label, value, max, detail, icon }: {
  label: string; value: number; max: number; detail: string; icon: string;
}) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="score-bar-row">
      <div className="score-bar-label">
        <span className="score-bar-icon">{icon}</span>
        <span>{label}</span>
      </div>
      <div className="score-bar-track">
        <div className="score-bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="score-bar-detail">
        <span className="score-bar-points">{value}</span>
        <span className="score-bar-sub">/{max}</span>
        <span className="score-bar-info">{detail}</span>
      </div>
    </div>
  );
}
