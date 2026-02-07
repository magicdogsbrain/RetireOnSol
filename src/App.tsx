import { useState, useMemo, useEffect, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { WalletProvider, useWallet } from './contexts/WalletProvider';
import { Header } from './components/Header';
import { Calculator } from './components/Calculator';
import { Results } from './components/Results';
import { AdvancedMode } from './components/AdvancedMode';
import { calculateRetirement } from './utils/calculationsBasic';
import { fetchSOLPrice } from './utils/solPrice';
import { TipFooter } from './components/TipFooter';
import { useNotifications } from './hooks/useNotifications';
import { useBiometricLock, markAppUsed, clearAppUsed } from './hooks/useBiometricLock';
import { version as APP_VERSION } from '../package.json';
import './App.css';

type Mode = 'basic' | 'advanced';

function AppContent() {
  // Initialize notifications and price monitor on native
  useNotifications();

  // Biometric lock on app resume (native only)
  const { isLocked, authenticate } = useBiometricLock();

  // Wallet context (for reset)
  const { disconnect } = useWallet();

  // Set up edge-to-edge status bar on native
  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      document.documentElement.style.setProperty('--safe-area-top', '48px');
      document.documentElement.style.setProperty('--safe-area-bottom', '16px');

      StatusBar.setOverlaysWebView({ overlay: true });
      StatusBar.setStyle({ style: Style.Dark });
      StatusBar.setBackgroundColor({ color: '#00000000' });
    }
  }, []);

  // Mode toggle - persisted to localStorage
  const [mode, setMode] = useState<Mode>(() => {
    try {
      const saved = localStorage.getItem('retireonsol_mode');
      if (saved === 'basic' || saved === 'advanced') return saved;
    } catch { /* ignore */ }
    return 'basic';
  });

  useEffect(() => {
    try { localStorage.setItem('retireonsol_mode', mode); } catch { /* ignore */ }
  }, [mode]);

  // Live SOL price for Basic mode
  const [solPrice, setSolPrice] = useState<number | null>(null);
  useEffect(() => {
    fetchSOLPrice().then(data => setSolPrice(data.price)).catch(() => {});
  }, []);

  // Core inputs - shared between modes
  const [currentSOL, setCurrentSOL] = useState(100);
  const [dcaMonthly, setDcaMonthly] = useState(500);
  const [years, setYears] = useState(10);
  const [withdrawalMonthly, setWithdrawalMonthly] = useState(3000);

  // Mark app as used when any Basic mode input changes from default
  useEffect(() => {
    if (currentSOL !== 100 || dcaMonthly !== 500 || years !== 10 || withdrawalMonthly !== 3000) {
      markAppUsed();
    }
  }, [currentSOL, dcaMonthly, years, withdrawalMonthly]);

  // Reset all settings (Basic mode)
  const resetSettings = useCallback(async () => {
    if (window.confirm('Reset everything to defaults? This will disconnect your wallet, clear all data, and cannot be undone.')) {
      await disconnect();
      clearAppUsed();

      // Clear all retireonsol_ localStorage keys
      try {
        const keys = Object.keys(localStorage).filter(k => k.startsWith('retireonsol_'));
        keys.forEach(k => localStorage.removeItem(k));
      } catch { /* ignore */ }

      // Clear MWA wallet keys (not prefixed with retireonsol_)
      try {
        localStorage.removeItem('mwa_address');
        localStorage.removeItem('mwa_auth_token');
        localStorage.removeItem('mwa_account_label');
      } catch { /* ignore */ }

      // Reset inputs to defaults
      setCurrentSOL(100);
      setDcaMonthly(500);
      setYears(10);
      setWithdrawalMonthly(3000);
      setMode('basic');
    }
  }, [disconnect]);

  // Calculate projection with fixed parameters (Basic mode)
  const projection = useMemo(() => {
    return calculateRetirement({
      currentSOL,
      dcaMonthly,
      years,
      withdrawalMonthly,
      solPrice: solPrice || undefined,
    });
  }, [currentSOL, dcaMonthly, years, withdrawalMonthly, solPrice]);

  return (
    <>
      {isLocked && (
        <div
          className="biometric-lock"
          onClick={authenticate}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 99999,
            background: '#0D0D0D',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '20px',
            cursor: 'pointer',
          }}
        >
          <div style={{
            width: 80, height: 80,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #9945FF, #14F195)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '36px',
          }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          </div>
          <div style={{ color: '#fff', fontSize: '18px', fontWeight: 600 }}>
            RetireOnSol is Locked
          </div>
          <div style={{ color: '#888', fontSize: '14px' }}>
            Tap to unlock with biometrics
          </div>
        </div>
      )}
      <div className="app">
        <Header />

        {/* Mode Toggle */}
        <div className="mode-toggle-container">
          <div className={`mode-toggle ${mode === 'advanced' ? 'advanced' : ''}`}>
            <button
              className={`mode-btn ${mode === 'basic' ? 'active' : ''}`}
              onClick={() => setMode('basic')}
            >
              Basic
            </button>
            <button
              className={`mode-btn ${mode === 'advanced' ? 'active' : ''}`}
              onClick={() => { setMode('advanced'); markAppUsed(); }}
            >
              Advanced
            </button>
          </div>
        </div>

        <main className="container">
          {mode === 'basic' ? (
            <>
              <Calculator
                currentSOL={currentSOL}
                dcaMonthly={dcaMonthly}
                years={years}
                withdrawalMonthly={withdrawalMonthly}
                onCurrentSOLChange={setCurrentSOL}
                onDcaMonthlyChange={setDcaMonthly}
                onYearsChange={setYears}
                onWithdrawalMonthlyChange={setWithdrawalMonthly}
              />
              <Results
                projection={projection}
                years={years}
                currentSOL={currentSOL}
                dcaMonthly={dcaMonthly}
              />

              {/* Footer */}
              <footer style={{
                marginTop: '3rem', padding: '2rem 1rem', borderTop: '1px solid rgba(255,255,255,0.1)',
                textAlign: 'center', fontSize: '0.8rem', opacity: 0.6,
              }}>
                <div style={{ marginBottom: '8px' }}>
                  <a href={`${import.meta.env.BASE_URL}privacy`} style={{ color: 'inherit', textDecoration: 'none' }}>Privacy Policy</a>
                  <span style={{ margin: '0 8px' }}>|</span>
                  <a href={`${import.meta.env.BASE_URL}terms`} style={{ color: 'inherit', textDecoration: 'none' }}>Terms of Service</a>
                  <span style={{ margin: '0 8px' }}>|</span>
                  <button
                    type="button"
                    onClick={resetSettings}
                    style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', textDecoration: 'underline', fontSize: 'inherit' }}
                  >
                    Reset Settings
                  </button>
                </div>
                <div style={{ marginBottom: '8px', lineHeight: 1.5 }}>
                  <p style={{ margin: '2px 0' }}>For educational and entertainment purposes only.</p>
                  <p style={{ margin: '2px 0' }}>Not financial advice. Projections are hypothetical and do not guarantee future results.</p>
                  <p style={{ margin: '2px 0' }}>Past performance does not indicate future returns. Always do your own research.</p>
                </div>
                <p style={{ margin: '4px 0' }}>&copy; {new Date().getFullYear()} RetireOnSol. All rights reserved.</p>
                <p style={{ margin: '4px 0' }}>v{APP_VERSION}</p>
              </footer>

              <TipFooter />
            </>
          ) : (
            <AdvancedMode
              initialSOL={currentSOL}
              initialDCA={dcaMonthly}
              initialYears={years}
            />
          )}
        </main>
      </div>
    </>
  );
}

function App() {
  return (
    <WalletProvider>
      <AppContent />
    </WalletProvider>
  );
}

export default App;
