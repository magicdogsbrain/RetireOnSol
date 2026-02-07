import { useWallet } from '@solana/wallet-adapter-react';
import { LAMPORTS_PER_SOL, Connection, PublicKey } from '@solana/web3.js';
import { useState, useEffect, useCallback } from 'react';

export interface WalletBalanceResult {
  balance: number | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

// Extend window for Phantom
declare global {
  interface Window {
    solana?: {
      isPhantom?: boolean;
      request: (args: { method: string; params?: unknown }) => Promise<unknown>;
    };
    solflare?: {
      isSolflare?: boolean;
      request: (args: { method: string; params?: unknown }) => Promise<unknown>;
    };
  }
}

async function getBalanceFromPhantom(publicKeyStr: string): Promise<number> {
  // Phantom exposes a connection through window.solana that uses their RPC
  if (window.solana?.isPhantom) {
    try {
      // Use Phantom's internal connection (they have their own RPC)
      const result = await window.solana.request({
        method: 'getBalance',
        params: { publicKey: publicKeyStr },
      });
      if (typeof result === 'number') {
        return result / LAMPORTS_PER_SOL;
      }
    } catch {
      // Fall through to alternative method
    }
  }
  throw new Error('Phantom balance request not available');
}

async function getBalanceFromDirectRPC(publicKeyStr: string): Promise<number> {
  // Phantom's public RPC first (most reliable), then fallbacks
  const endpoints = [
    'https://solana-mainnet.phantom.app/YBPpkkN4g91xDiAnTE9r0RcMkjg0sKUIWvAfoFVJ',
  ];

  const connection = new Connection(endpoints[0], 'confirmed');
  const pubkey = new PublicKey(publicKeyStr);
  const balance = await connection.getBalance(pubkey);
  return balance / LAMPORTS_PER_SOL;
}

export function useWalletBalance(): WalletBalanceResult {
  const { publicKey, connected } = useWallet();
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBalance = useCallback(async () => {
    if (!publicKey || !connected) {
      setBalance(null);
      return;
    }

    const pubKeyStr = publicKey.toBase58();

    try {
      setLoading(true);
      setError(null);

      let sol: number;

      // Try Phantom's internal method first
      try {
        sol = await getBalanceFromPhantom(pubKeyStr);
      } catch {
        // Fallback to direct RPC
        sol = await getBalanceFromDirectRPC(pubKeyStr);
      }

      setBalance(Math.round(sol * 100) / 100);
    } catch (err) {
      console.error('Failed to fetch balance:', err);
      setError('Could not fetch balance');
      setBalance(null);
    } finally {
      setLoading(false);
    }
  }, [publicKey, connected]);

  useEffect(() => {
    if (connected && publicKey) {
      fetchBalance();
    } else {
      setBalance(null);
      setError(null);
    }
  }, [connected, publicKey, fetchBalance]);

  return { balance, loading, error, refetch: fetchBalance };
}
