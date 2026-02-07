import { useState } from 'react';
import { useDemoMode } from '../contexts/DemoContext';
import { useNotifications } from '../hooks/useNotifications';

export function DemoPanel() {
  const {
    enabled,
    solBalance,
    jitoSolBalance,
    demoDate,
    completedDCAs,
    setSolBalance,
    setJitoSolBalance,
    advanceTime,
    resetDemoDate,
    setEnabled
  } = useDemoMode();
  const [collapsed, setCollapsed] = useState(false);
  const { isNative, isAvailable, sendTestNotification } = useNotifications();

  if (!enabled) return null;

  const currentDate = demoDate || new Date();
  const dateStr = currentDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });

  return (
    <div className="demo-panel" style={{
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      zIndex: 9999,
      background: 'rgba(30, 25, 10, 0.95)',
      border: '2px solid #F5A623',
      borderRadius: '12px',
      padding: collapsed ? '8px 14px' : '16px',
      minWidth: collapsed ? 'auto' : '260px',
      maxWidth: '320px',
      backdropFilter: 'blur(10px)',
      boxShadow: '0 4px 20px rgba(245, 166, 35, 0.3)',
      fontFamily: 'system-ui, sans-serif',
      color: '#fff',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        cursor: 'pointer',
        gap: '8px',
      }} onClick={() => setCollapsed(!collapsed)}>
        <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#F5A623' }}>
          DEMO Mode
        </span>
        <span style={{ fontSize: '12px', color: '#999' }}>
          {collapsed ? '\u25B2' : '\u25BC'}
        </span>
      </div>

      {!collapsed && (
        <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* SOL Balance */}
          <div>
            <label style={{ fontSize: '12px', color: '#aaa', display: 'block', marginBottom: '4px' }}>
              SOL Balance: <span style={{ color: '#14F195', fontWeight: 'bold' }}>{solBalance}</span>
            </label>
            <input
              type="range"
              min="0"
              max="1000"
              step="1"
              value={solBalance}
              onChange={(e) => setSolBalance(Number(e.target.value))}
              style={{ width: '100%', accentColor: '#14F195' }}
            />
            <input
              type="number"
              min="0"
              max="1000"
              value={solBalance}
              onChange={(e) => setSolBalance(Math.min(1000, Math.max(0, Number(e.target.value) || 0)))}
              style={{
                width: '70px',
                marginTop: '4px',
                padding: '4px 8px',
                background: 'rgba(255,255,255,0.1)',
                border: '1px solid #555',
                borderRadius: '6px',
                color: '#fff',
                fontSize: '12px',
              }}
            />
          </div>

          {/* JitoSOL Balance */}
          <div>
            <label style={{ fontSize: '12px', color: '#aaa', display: 'block', marginBottom: '4px' }}>
              JitoSOL Balance: <span style={{ color: '#14F195', fontWeight: 'bold' }}>{jitoSolBalance}</span>
            </label>
            <input
              type="range"
              min="0"
              max="1000"
              step="1"
              value={jitoSolBalance}
              onChange={(e) => setJitoSolBalance(Number(e.target.value))}
              style={{ width: '100%', accentColor: '#14F195' }}
            />
            <input
              type="number"
              min="0"
              max="1000"
              value={jitoSolBalance}
              onChange={(e) => setJitoSolBalance(Math.min(1000, Math.max(0, Number(e.target.value) || 0)))}
              style={{
                width: '70px',
                marginTop: '4px',
                padding: '4px 8px',
                background: 'rgba(255,255,255,0.1)',
                border: '1px solid #555',
                borderRadius: '6px',
                color: '#fff',
                fontSize: '12px',
              }}
            />
          </div>

          {/* Time Controls */}
          <div>
            <label style={{ fontSize: '12px', color: '#aaa', display: 'block', marginBottom: '8px' }}>
              Demo Date: <span style={{ color: '#F5A623', fontWeight: 'bold' }}>{dateStr}</span>
              {completedDCAs.size > 0 && (
                <span style={{ fontSize: '10px', color: '#14F195', marginLeft: '8px' }}>
                  ({completedDCAs.size} DCA{completedDCAs.size > 1 ? 's' : ''} completed)
                </span>
              )}
            </label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => advanceTime(1)}
                style={{
                  flex: 1,
                  padding: '6px 12px',
                  background: 'rgba(20, 241, 149, 0.1)',
                  border: '1px solid #14F195',
                  borderRadius: '6px',
                  color: '#14F195',
                  cursor: 'pointer',
                  fontSize: '11px',
                  fontWeight: 'bold',
                }}
              >
                +1 Day
              </button>
              <button
                type="button"
                onClick={() => advanceTime(7)}
                style={{
                  flex: 1,
                  padding: '6px 12px',
                  background: 'rgba(20, 241, 149, 0.1)',
                  border: '1px solid #14F195',
                  borderRadius: '6px',
                  color: '#14F195',
                  cursor: 'pointer',
                  fontSize: '11px',
                  fontWeight: 'bold',
                }}
              >
                +1 Week
              </button>
              <button
                type="button"
                onClick={() => advanceTime(30)}
                style={{
                  flex: 1,
                  padding: '6px 12px',
                  background: 'rgba(20, 241, 149, 0.1)',
                  border: '1px solid #14F195',
                  borderRadius: '6px',
                  color: '#14F195',
                  cursor: 'pointer',
                  fontSize: '11px',
                  fontWeight: 'bold',
                }}
              >
                +1 Month
              </button>
              <button
                type="button"
                onClick={resetDemoDate}
                style={{
                  flex: 1,
                  padding: '6px 12px',
                  background: 'transparent',
                  border: '1px solid #777',
                  borderRadius: '6px',
                  color: '#999',
                  cursor: 'pointer',
                  fontSize: '11px',
                }}
              >
                Reset
              </button>
            </div>
          </div>

          {/* Notification Test (only on native) */}
          {isNative && (
            <button
              type="button"
              onClick={sendTestNotification}
              disabled={!isAvailable}
              style={{
                padding: '8px 16px',
                background: isAvailable ? 'rgba(20, 241, 149, 0.1)' : 'rgba(100, 100, 100, 0.1)',
                border: isAvailable ? '1px solid #14F195' : '1px solid #666',
                borderRadius: '8px',
                color: isAvailable ? '#14F195' : '#666',
                cursor: isAvailable ? 'pointer' : 'not-allowed',
                fontSize: '13px',
                fontWeight: 'bold',
                transition: 'all 0.2s',
              }}
            >
              Test Notification
            </button>
          )}

          {/* Exit Button */}
          <button
            type="button"
            onClick={() => setEnabled(false)}
            style={{
              padding: '8px 16px',
              background: 'transparent',
              border: '1px solid #F5A623',
              borderRadius: '8px',
              color: '#F5A623',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 'bold',
              transition: 'all 0.2s',
            }}
          >
            Exit Demo
          </button>

          <div style={{ fontSize: '10px', color: '#777', textAlign: 'center' }}>
            Fake balances for testing — not real
          </div>
        </div>
      )}
    </div>
  );
}
