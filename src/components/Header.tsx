import { useDemoMode } from '../contexts/DemoContext';
import { Capacitor } from '@capacitor/core';
import './Header.css';

export function Header() {
  const demo = useDemoMode();
  const isNative = Capacitor.isNativePlatform();

  return (
    <header className="header" style={isNative ? { paddingTop: 'calc(1rem + 48px)' } : undefined}>
      <div className="header-brand" onClick={demo.handleLogoClick} style={{ cursor: 'pointer' }}>
        <img
          src={`${import.meta.env.BASE_URL}icons/icon.svg`}
          alt="RetireOnSol"
          className="header-logo"
        />
        <div className="header-title-group">
          <h1>RetireOnSol</h1>
          <p className="tagline">Plan your SOL accumulation journey</p>
        </div>
        {demo.enabled && (
          <span className="demo-badge">🧪 DEMO</span>
        )}
        {isNative && !demo.enabled && (
          <span className="seeker-badge">Built for Seeker</span>
        )}
      </div>
    </header>
  );
}
