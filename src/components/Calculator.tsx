import { useState, useEffect, useRef } from 'react';
import { useWallet } from '../contexts/WalletProvider';
import './Calculator.css';

interface CalculatorProps {
  currentSOL: number;
  dcaMonthly: number;
  years: number;
  withdrawalMonthly: number;
  onCurrentSOLChange: (value: number) => void;
  onDcaMonthlyChange: (value: number) => void;
  onYearsChange: (value: number) => void;
  onWithdrawalMonthlyChange: (value: number) => void;
}

export function Calculator({
  currentSOL,
  dcaMonthly,
  years,
  withdrawalMonthly,
  onCurrentSOLChange,
  onDcaMonthlyChange,
  onYearsChange,
  onWithdrawalMonthlyChange
}: CalculatorProps) {
  const { connected, balance, address, connect, disconnect, isRefreshing, refreshBalance, accountLabel } = useWallet();
  const [pendingImport, setPendingImport] = useState(false);
  const [imported, setImported] = useState(false);
  const importTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // When wallet connects and we have a pending import, do the import
  useEffect(() => {
    if (pendingImport && connected && !isRefreshing) {
      if (balance !== null) {
        onCurrentSOLChange(balance);
        setPendingImport(false);
        setImported(true);
        if (importTimerRef.current) clearTimeout(importTimerRef.current);
        importTimerRef.current = setTimeout(() => setImported(false), 3000);
      }
    }
  }, [pendingImport, connected, isRefreshing, balance, onCurrentSOLChange]);

  const handleImportWallet = async () => {
    if (!connected) {
      setPendingImport(true);
      connect();
      return;
    }

    // Already connected — refresh balance first, then import
    try {
      await refreshBalance();
    } catch { /* ignore */ }

    // Balance should now be available from context via re-render + pendingImport effect
    // But also try to import directly from the latest balance
    setPendingImport(true);
  };

  return (
    <>
    {/* Wallet card */}
    <div className="card" style={{ padding: '0.75rem 1rem', marginBottom: '1rem' }}>
      <div className="wallet-badge-group">
        {connected && address ? (
          <>
            <div className="wallet-badge">
              <span className="wallet-dot"></span>
              <span>{accountLabel || `${address.slice(0, 4)}...${address.slice(-4)}`}</span>
            </div>
            <button className="link-btn" onClick={handleImportWallet} disabled={isRefreshing}
              style={{ padding: '0 8px', fontSize: '0.7rem', height: '100%' }}>
              {isRefreshing ? 'Loading...' : 'Import Balance'}
            </button>
            <button className="disconnect-btn" onClick={disconnect} title="Disconnect Wallet">×</button>
          </>
        ) : (
          <button className="link-btn" onClick={() => connect()} disabled={isRefreshing}
            style={{ padding: '0 8px', fontSize: '0.7rem', height: '100%', width: '100%', textAlign: 'center' }}>
            {isRefreshing ? 'Connecting...' : 'Connect Wallet'}
          </button>
        )}
      </div>
    </div>

    {imported && (
      <div className="wallet-imported-notice">✓ Balance imported</div>
    )}

    <div className="calculator card">
      <h2>Your Plan</h2>
      <div className="input-group">
        <div className="label-row">
          <label>Current SOL Holdings</label>
        </div>
        <input
          type="number"
          className="input-lg"
          value={currentSOL || ''}
          onChange={(e) => onCurrentSOLChange(e.target.value === '' ? 0 : Number(e.target.value))}
          onBlur={(e) => { if (e.target.value === '') onCurrentSOLChange(0); }}
          min="0"
          step="10"
          placeholder="0"
        />
        <input
          type="range"
          min="0"
          max="1000"
          step="10"
          value={Math.min(currentSOL, 1000)}
          onChange={(e) => onCurrentSOLChange(Number(e.target.value))}
          className="slider"
        />
      </div>

      <div className="input-group">
        <label>Monthly DCA (USD)</label>
        <input
          type="number"
          className="input-lg"
          value={dcaMonthly}
          onChange={(e) => onDcaMonthlyChange(e.target.value === '' ? 0 : Number(e.target.value))}
          onFocus={(e) => { if (Number(e.target.value) === 0) e.target.value = ''; }}
          onBlur={(e) => { if (e.target.value === '') onDcaMonthlyChange(0); }}
          min="0"
          step="50"
        />
        <input
          type="range"
          min="0"
          max="5000"
          step="50"
          value={Math.min(dcaMonthly, 5000)}
          onChange={(e) => onDcaMonthlyChange(Number(e.target.value))}
          className="slider"
        />
      </div>

      <div className="input-group">
        <label>Years Until Retirement</label>
        <input
          type="number"
          className="input-lg"
          value={years}
          onChange={(e) => onYearsChange(e.target.value === '' ? 1 : Number(e.target.value))}
          onFocus={(e) => { if (Number(e.target.value) <= 1) e.target.value = ''; }}
          onBlur={(e) => { if (e.target.value === '') onYearsChange(1); }}
          min="1"
          max="40"
        />
        <input
          type="range"
          min="1"
          max="40"
          value={years}
          onChange={(e) => onYearsChange(Number(e.target.value))}
          className="slider"
        />
      </div>

      <div className="input-group">
        <label>Monthly Income in Retirement (in today's money)</label>
        <div className="input-with-prefix">
          <span className="prefix">$</span>
          <input
            type="number"
            className="input-lg"
            value={withdrawalMonthly}
            onChange={(e) => onWithdrawalMonthlyChange(e.target.value === '' ? 0 : Number(e.target.value))}
            onFocus={(e) => { if (Number(e.target.value) === 0) e.target.value = ''; }}
            onBlur={(e) => { if (e.target.value === '') onWithdrawalMonthlyChange(0); }}
            min="0"
            step="100"
          />
        </div>
        <input
          type="range"
          min="0"
          max="10000"
          step="100"
          value={Math.min(withdrawalMonthly, 10000)}
          onChange={(e) => onWithdrawalMonthlyChange(Number(e.target.value))}
          className="slider"
        />
      </div>
    </div>
    </>
  );
}
