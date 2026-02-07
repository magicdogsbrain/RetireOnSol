import { useState, useEffect, useRef } from 'react';
import { useWallet } from '../contexts/WalletProvider';
import { useConnection } from '@solana/wallet-adapter-react';
import {
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import { fetchSOLPrice } from '../utils/solPrice';

const TIP_ADDRESS = import.meta.env.VITE_TIP_ADDRESS || '';
const COFFEE_USD = 5; // ~$5 coffee

type TipState = 'idle' | 'connecting' | 'confirm' | 'sending' | 'sent' | 'error';

function calcCoffeeSOL(solPrice: number): number {
  if (!solPrice || solPrice <= 0) return 0.02; // fallback
  return Math.round((COFFEE_USD / solPrice) * 1000) / 1000;
}

export function TipFooter() {
  const { connected, connect, sendTransaction, publicKey } = useWallet();
  const { connection } = useConnection();
  const [state, setState] = useState<TipState>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [tipSOL, setTipSOL] = useState(0.02);
  const [solPrice, setSolPrice] = useState(0);
  const waitingForConnect = useRef(false);
  const tipRef = useRef<HTMLDivElement>(null);

  // Fetch SOL price to calculate coffee amount
  useEffect(() => {
    fetchSOLPrice().then((data) => {
      setSolPrice(data.price);
      setTipSOL(calcCoffeeSOL(data.price));
    }).catch(() => {});
  }, []);

  // Auto-open if launched from tip notification
  useEffect(() => {
    try {
      const flag = localStorage.getItem('retireonsol_tip_open');
      if (flag) {
        localStorage.removeItem('retireonsol_tip_open');
        // Small delay to let the page render, then open and scroll
        setTimeout(() => {
          if (connected) {
            setState('confirm');
          } else {
            // Show the button prominently — user will tap to connect
            setState('idle');
          }
          tipRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 500);
      }
    } catch { /* ignore */ }
  }, [connected]);

  // When wallet connects after user tapped tip, auto-show confirm
  useEffect(() => {
    if (connected && waitingForConnect.current) {
      waitingForConnect.current = false;
      setState('confirm');
    }
  }, [connected]);

  if (!TIP_ADDRESS) return null;

  const handleClick = () => {
    if (!connected) {
      waitingForConnect.current = true;
      setState('connecting');
      connect();
      return;
    }
    setState('confirm');
  };

  const handleSend = async () => {
    if (!publicKey || !sendTransaction || !connection) {
      setErrorMsg('Wallet not ready');
      setState('error');
      return;
    }

    setState('sending');
    try {
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();

      // Build as VersionedTransaction — MWA serializes before signing,
      // and legacy Transaction.serialize() rejects unsigned txs.
      const messageV0 = new TransactionMessage({
        payerKey: publicKey,
        recentBlockhash: blockhash,
        instructions: [
          SystemProgram.transfer({
            fromPubkey: publicKey,
            toPubkey: new PublicKey(TIP_ADDRESS),
            lamports: Math.round(tipSOL * LAMPORTS_PER_SOL),
          }),
        ],
      }).compileToV0Message();

      const transaction = new VersionedTransaction(messageV0);

      // Timeout guard: if sendTransaction hangs (e.g. user dismisses wallet
      // without explicitly rejecting), reset after 60s
      const sendPromise = sendTransaction(transaction);
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Timed out waiting for wallet')), 10000)
      );

      const signature = await Promise.race([sendPromise, timeoutPromise]);
      await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');

      setState('sent');
      setTimeout(() => setState('idle'), 3000);
    } catch (e: any) {
      // Any failure (rejection, timeout, dismiss) just resets to idle
      const msg = e?.message || String(e);
      console.log('[TipFooter] send error:', msg);
      setState('idle');
    }
  };

  const handleCancel = () => {
    waitingForConnect.current = false;
    setState('idle');
  };

  const usdLabel = solPrice > 0 ? ` (~$${(tipSOL * solPrice).toFixed(2)})` : '';

  // Confirmation card
  if (state === 'confirm') {
    return (
      <div ref={tipRef} style={{
        textAlign: 'center',
        padding: '16px',
        margin: '8px 16px 24px',
        background: 'rgba(153, 69, 255, 0.08)',
        border: '1px solid rgba(153, 69, 255, 0.2)',
        borderRadius: '12px',
      }}>
        <div style={{ color: '#ccc', fontSize: '0.8rem', marginBottom: '8px' }}>
          Send {tipSOL} SOL{usdLabel} to the developer?
        </div>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
          <button
            onClick={handleSend}
            style={{
              background: 'linear-gradient(135deg, #9945FF, #14F195)',
              border: 'none', borderRadius: '8px',
              color: '#fff', fontWeight: 600, fontSize: '0.75rem',
              padding: '8px 20px', cursor: 'pointer',
            }}
          >
            Send {tipSOL} SOL
          </button>
          <button
            onClick={handleCancel}
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid #444', borderRadius: '8px',
              color: '#999', fontSize: '0.75rem',
              padding: '8px 16px', cursor: 'pointer',
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div ref={tipRef} style={{
      textAlign: 'center',
      padding: '24px 16px 40px',
      opacity: state === 'idle' ? 0.4 : 0.9,
      transition: 'opacity 0.2s',
    }}>
      <button
        onClick={handleClick}
        disabled={state === 'sending'}
        style={{
          background: 'none',
          border: 'none',
          color: state === 'sent' ? '#14F195' : state === 'error' ? '#ff6b6b' : '#888',
          fontSize: '0.7rem',
          cursor: state === 'sending' ? 'wait' : 'pointer',
          padding: '6px 12px',
          letterSpacing: '0.02em',
        }}
      >
        {state === 'sending' && 'Sending...'}
        {state === 'sent' && 'Thanks for the coffee!'}
        {state === 'error' && errorMsg}
        {state === 'connecting' && 'Connecting wallet...'}
        {state === 'idle' && (connected
          ? 'Buy the dev a coffee'
          : 'Buy the dev a coffee (connect wallet)'
        )}
      </button>
    </div>
  );
}
