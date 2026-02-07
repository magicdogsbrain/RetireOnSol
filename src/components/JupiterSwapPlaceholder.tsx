/**
 * JupiterSwapPlaceholder — Jupiter Plugin integration
 *
 * Jupiter Plugin (replacement for deprecated Terminal)
 * 1. Script tag: <script src="https://plugin.jup.ag/plugin-v1.js" />
 * 2. Calls window.Jupiter.init({ ... }) with config
 * 3. Embeds plugin in modal overlay
 * 4. Uses Ultra mode (RPC-less, handles everything server-side)
 */

import { useState } from 'react';
import './JupiterSwapPlaceholder.css';
import { JupiterTerminal } from './JupiterTerminal';

interface JupiterSwapPlaceholderProps {
  fromToken?: string;
  toToken?: string;
}

export function JupiterSwapPlaceholder({
  fromToken = 'SOL',
  toToken = 'JitoSOL',
}: JupiterSwapPlaceholderProps) {
  const [showTerminal, setShowTerminal] = useState(false);

  return (
    <>
      <div className="jupiter-swap-placeholder">
        <div className="jupiter-swap-header">
          <span className="jupiter-icon">⚡</span>
          <span className="jupiter-title">Jupiter Swap</span>
        </div>
        <p className="jupiter-description">
          Swap directly in-app via Jupiter.
        </p>
        <button
          type="button"
          className="jupiter-swap-btn"
          onClick={() => setShowTerminal(true)}
        >
          Swap {fromToken} → {toToken}
        </button>
      </div>
      {showTerminal && <JupiterTerminal onClose={() => setShowTerminal(false)} />}
    </>
  );
}
