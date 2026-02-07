/**
 * Leaderboard Opt-In Modal
 *
 * Shown after Execute Plan confirmation and from Monitor tab.
 * Explains the leaderboard and gets consent. Wallet connection
 * happens separately on the Board tab (Seed Vault / MWA only).
 */

interface LeaderboardOptInProps {
  onJoin: () => void;
  onDismiss: () => void;
}

export function LeaderboardOptIn({ onJoin, onDismiss }: LeaderboardOptInProps) {
  return (
    <div
      className="cancel-modal-overlay"
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center',
        justifyContent: 'center', zIndex: 1001, padding: '1rem',
      }}
      onClick={onDismiss}
    >
      <div
        className="cancel-modal"
        style={{
          background: '#1a1a2e', border: '1px solid var(--sol-purple, #9945FF)',
          borderRadius: '12px', maxWidth: '420px', width: '100%',
          boxShadow: '0 8px 40px rgba(153, 69, 255, 0.2)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          padding: '16px', textAlign: 'center',
          background: 'rgba(153, 69, 255, 0.1)',
          borderBottom: '1px solid rgba(153, 69, 255, 0.2)',
          borderRadius: '12px 12px 0 0',
        }}>
          <div style={{ fontSize: '2rem' }}>🏆</div>
          <h2 style={{ color: 'var(--sol-purple, #9945FF)', margin: '8px 0 0', fontSize: '1.2rem' }}>
            Join the Leaderboard?
          </h2>
        </div>

        {/* Body */}
        <div style={{ padding: '20px' }}>
          <p style={{
            fontSize: '0.95rem', color: '#ccc', textAlign: 'center',
            margin: '0 0 12px', lineHeight: 1.5,
          }}>
            Points are awarded for <strong style={{ color: '#fff' }}>DCA streaks</strong> and{' '}
            <strong style={{ color: '#fff' }}>plan duration</strong> — not monetary value.
            No amounts are ever shared.
          </p>

          <p style={{
            fontSize: '0.85rem', color: '#999', textAlign: 'center',
            margin: '0 0 12px', fontStyle: 'italic',
          }}>
            This is optional — just for fun!
          </p>

          <p style={{
            fontSize: '0.8rem', color: '#888', textAlign: 'center',
            margin: '0 0 20px',
          }}>
            You'll connect your Seeker ID on the Board tab.
          </p>

          {/* What's tracked */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px',
            marginBottom: '20px',
          }}>
            {[
              { label: 'DCA Streak', icon: '🔥' },
              { label: 'Plan Duration', icon: '📅' },
              { label: 'Completion Rate', icon: '✅' },
              { label: 'Plan Funded', icon: '💰' },
            ].map(({ label, icon }) => (
              <div key={label} style={{
                padding: '8px', background: 'rgba(255,255,255,0.03)',
                borderRadius: '6px', textAlign: 'center', fontSize: '0.8rem',
              }}>
                <div style={{ fontSize: '1.1rem', marginBottom: '2px' }}>{icon}</div>
                <div style={{ color: '#aaa' }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Buttons */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <button
              type="button"
              onClick={onDismiss}
              style={{
                padding: '12px', background: 'transparent', border: '1px solid #555',
                borderRadius: '8px', color: '#ccc', cursor: 'pointer', fontWeight: '600',
              }}
            >
              No thanks
            </button>
            <button
              type="button"
              onClick={onJoin}
              style={{
                padding: '12px',
                background: 'linear-gradient(135deg, var(--sol-purple, #9945FF), var(--sol-green, #14F195))',
                border: 'none', borderRadius: '8px', color: '#fff',
                fontWeight: 'bold', cursor: 'pointer',
              }}
            >
              Join Leaderboard
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
