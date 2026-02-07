import { createContext, useContext, useState, useCallback, useMemo, useEffect, useRef, type FC, type ReactNode } from 'react';
import {
  ConnectionProvider,
  WalletProvider as SolanaWalletProvider,
  useWallet as useSolanaWallet,
  useConnection
} from '@solana/wallet-adapter-react';
import { WalletModalProvider, useWalletModal } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
import { Capacitor } from '@capacitor/core';
import { Connection, LAMPORTS_PER_SOL, PublicKey, type VersionedTransaction } from '@solana/web3.js';
import { setSeekerName } from '../utils/leaderboardScore';
import SolanaMWA from '../plugins/SolanaMWA';

// Import wallet adapter CSS
import '@solana/wallet-adapter-react-ui/styles.css';

// JitoSOL mint address on mainnet
const JITOSOL_MINT = new PublicKey('J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn');

const IS_NATIVE = Capacitor.isNativePlatform();

interface WalletContextType {
  connected: boolean;
  balance: number | null;
  jitoBalance: number | null;
  address: string | null;
  connectionMode: 'none' | 'native' | 'adapter';
  connect: () => void;
  disconnect: () => Promise<void>;
  refreshBalance: () => Promise<void>;
  isRefreshing: boolean;
  signMessage: (message: Uint8Array) => Promise<Uint8Array>;
  sendTransaction: (transaction: VersionedTransaction) => Promise<string>;
  publicKey: PublicKey | null;
  accountLabel: string | null;
}

const noop = () => { throw new Error('Wallet not connected'); };

const WalletContext = createContext<WalletContextType>({
  connected: false,
  balance: null,
  jitoBalance: null,
  address: null,
  connectionMode: 'none',
  connect: () => {},
  disconnect: async () => {},
  refreshBalance: async () => {},
  isRefreshing: false,
  signMessage: noop as any,
  sendTransaction: noop as any,
  publicKey: null,
  accountLabel: null,
});

export const useWallet = () => useContext(WalletContext);

// ─── Shared RPC endpoint ─────────────────────────────────────────────────
const RPC_ENDPOINT = import.meta.env.VITE_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

// ─── MWA Connecting Overlay ────────────────────────────────────────────────
const MWAConnectingOverlay: FC<{
  visible: boolean;
  error: string | null;
  onDismiss: () => void;
}> = ({ visible, error, onDismiss }) => {
  if (!visible) return null;

  return (
    <div
      onClick={error ? onDismiss : undefined}
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0,0,0,0.8)', zIndex: 10000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '20px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#1A1A1A', borderRadius: '16px', padding: '24px',
          width: '100%', maxWidth: '340px',
          border: `1px solid ${error ? '#ff4444' : '#333'}`,
          textAlign: 'center',
        }}
      >
        {error ? (
          <>
            <p style={{ color: '#ff6b6b', fontSize: '0.95rem', margin: '0 0 12px 0', fontWeight: '600' }}>
              Connection Failed
            </p>
            <p style={{ color: '#999', fontSize: '0.8rem', margin: '0 0 16px 0' }}>
              {error}
            </p>
            <button
              onClick={onDismiss}
              style={{
                width: '100%', padding: '12px', background: 'rgba(255,255,255,0.05)',
                border: '1px solid #555', borderRadius: '8px', color: '#fff',
                cursor: 'pointer', fontSize: '0.9rem',
              }}
            >
              OK
            </button>
          </>
        ) : (
          <>
            <div style={{
              width: '40px', height: '40px', border: '3px solid #333',
              borderTopColor: '#9945FF', borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
              margin: '0 auto 16px',
            }} />
            <p style={{ color: '#fff', fontSize: '0.95rem', margin: '0 0 8px 0' }}>
              Connecting to Wallet...
            </p>
            <p style={{ color: '#999', fontSize: '0.8rem', margin: '0' }}>
              Choose your wallet and approve the connection
            </p>
          </>
        )}
      </div>
    </div>
  );
};

// ─── Native Wallet Content (Kotlin MWA bridge via Capacitor plugin) ─────────
const NativeWalletContent: FC<{ children: ReactNode }> = ({ children }) => {
  const connection = useMemo(() => new Connection(RPC_ENDPOINT), []);

  const [nativePublicKey, setNativePublicKey] = useState<PublicKey | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(() => {
    try { return localStorage.getItem('mwa_auth_token'); } catch { return null; }
  });
  const [nativeAccountLabel, setNativeAccountLabel] = useState<string | null>(() => {
    try {
      const stored = localStorage.getItem('mwa_account_label');
      return stored?.endsWith('.skr') ? stored : null;
    } catch { return null; }
  });
  const [balance, setBalance] = useState<number | null>(null);
  const [jitoBalance, setJitoBalance] = useState<number | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [mwaConnecting, setMwaConnecting] = useState(false);
  const [mwaError, setMwaError] = useState<string | null>(null);

  // Restore persisted address on mount (ref so disconnect can clear it)
  const restoredAddressRef = useRef<string | null>(
    (() => { try { return localStorage.getItem('mwa_address'); } catch { return null; } })()
  );

  useEffect(() => {
    const addr = restoredAddressRef.current;
    if (addr && !nativePublicKey) {
      try {
        setNativePublicKey(new PublicKey(addr));
      } catch { /* invalid stored key */ }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // mount only

  const connected = nativePublicKey !== null;
  const address = useMemo(() => nativePublicKey?.toBase58() || null, [nativePublicKey]);

  // Fetch balances via RPC (works fine from WebView)
  const fetchBalances = useCallback(async (pk?: PublicKey) => {
    const key = pk || nativePublicKey;
    if (!key) return;

    setIsRefreshing(true);
    try {
      const solBalance = await connection.getBalance(key);
      setBalance(solBalance / LAMPORTS_PER_SOL);

      try {
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(key, {
          mint: JITOSOL_MINT
        });
        if (tokenAccounts.value.length > 0) {
          const jitoAmount = tokenAccounts.value[0].account.data.parsed?.info?.tokenAmount?.uiAmount || 0;
          setJitoBalance(jitoAmount);
        } else {
          setJitoBalance(0);
        }
      } catch {
        setJitoBalance(0);
      }
    } catch (error) {
      console.error('Failed to fetch balance:', error);
      setBalance(null);
      setJitoBalance(null);
    } finally {
      setIsRefreshing(false);
    }
  }, [nativePublicKey, connection]);

  // Auto-fetch balances when connected
  useEffect(() => {
    if (connected) {
      fetchBalances();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);

  // Connect via native Kotlin MWA bridge
  const connect = useCallback(async () => {
    setMwaError(null);
    setMwaConnecting(true);

    try {
      const result = await SolanaMWA.authorize();
      console.log('[MWA Native] authorize success:', result.publicKey);

      // Decode base64 public key
      const pkBytes = Uint8Array.from(atob(result.publicKey), c => c.charCodeAt(0));
      const pk = new PublicKey(pkBytes);

      setNativePublicKey(pk);
      setAuthToken(result.authToken);
      setMwaConnecting(false);

      // Persist for session restoration
      try {
        localStorage.setItem('mwa_address', pk.toBase58());
        localStorage.setItem('mwa_auth_token', result.authToken);
      } catch {}

      // Capture account label — only use .skr names (Seed Vault).
      // Phantom returns "phantom-wallet" which isn't useful as an identifier.
      const label = result.accountLabel;
      if (label && label.endsWith('.skr')) {
        setNativeAccountLabel(label);
        setSeekerName(label);
        try { localStorage.setItem('mwa_account_label', label); } catch {}
      } else {
        setNativeAccountLabel(null);
        setSeekerName(null);
        try { localStorage.removeItem('mwa_account_label'); } catch {}
      }

      fetchBalances(pk);
    } catch (err) {
      setMwaConnecting(false);
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[MWA Native] authorize error:', msg);
      setMwaError(`Connection failed: ${msg}`);
    }
  }, [fetchBalances]);

  const dismissMwaOverlay = useCallback(() => {
    setMwaConnecting(false);
    setMwaError(null);
  }, []);

  const disconnect = useCallback(async () => {
    // Clear React state immediately — no MWA deauthorize call needed
    // (auth tokens expire on their own, and deauthorize opens the wallet chooser)
    restoredAddressRef.current = null; // prevent mount-restore from re-connecting
    setNativePublicKey(null);
    setAuthToken(null);
    setNativeAccountLabel(null);
    setBalance(null);
    setJitoBalance(null);
    try {
      localStorage.removeItem('mwa_address');
      localStorage.removeItem('mwa_auth_token');
      localStorage.removeItem('mwa_account_label');
    } catch {}
  }, []);

  const signMessage = useCallback(async (message: Uint8Array): Promise<Uint8Array> => {
    if (!authToken) throw new Error('Not connected — no auth token');
    const messageBase64 = btoa(String.fromCharCode(...message));
    const result = await SolanaMWA.signMessage({ message: messageBase64, authToken });
    return Uint8Array.from(atob(result.signature), c => c.charCodeAt(0));
  }, [authToken]);

  const sendTransaction = useCallback(async (transaction: VersionedTransaction): Promise<string> => {
    if (!authToken) throw new Error('Not connected — no auth token');
    const txBytes = transaction.serialize();
    const txBase64 = btoa(String.fromCharCode(...txBytes));
    const result = await SolanaMWA.signAndSendTransaction({ transaction: txBase64, authToken });
    return result.signature;
  }, [authToken]);

  const value: WalletContextType = {
    connected,
    balance,
    jitoBalance,
    address,
    connectionMode: connected ? 'native' : 'none',
    connect,
    disconnect,
    refreshBalance: fetchBalances,
    isRefreshing,
    signMessage,
    sendTransaction,
    publicKey: nativePublicKey,
    accountLabel: nativeAccountLabel,
  };

  return (
    <WalletContext.Provider value={value}>
      {children}
      <MWAConnectingOverlay
        visible={mwaConnecting}
        error={mwaError}
        onDismiss={dismissMwaOverlay}
      />
    </WalletContext.Provider>
  );
};

// ─── Web Wallet Content (Standard Solana Wallet Adapter) ───────────────────
const WebWalletContent: FC<{ children: ReactNode }> = ({ children }) => {
  const { connected, publicKey, disconnect: walletDisconnect, wallet, signMessage: adapterSignMessage } = useSolanaWallet();
  const { sendTransaction: adapterSendTransaction } = useSolanaWallet();
  const { setVisible } = useWalletModal();
  const { connection } = useConnection();
  const [balance, setBalance] = useState<number | null>(null);
  const [jitoBalance, setJitoBalance] = useState<number | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const address = useMemo(() => publicKey?.toBase58() || null, [publicKey]);

  // Fetch SOL and JitoSOL balance
  const refreshBalance = useCallback(async () => {
    if (!publicKey || !connection) {
      setBalance(null);
      setJitoBalance(null);
      return;
    }

    setIsRefreshing(true);
    try {
      const solBalance = await connection.getBalance(publicKey);
      setBalance(solBalance / LAMPORTS_PER_SOL);

      try {
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(publicKey, {
          mint: JITOSOL_MINT
        });

        if (tokenAccounts.value.length > 0) {
          const jitoAccount = tokenAccounts.value[0];
          const jitoAmount = jitoAccount.account.data.parsed?.info?.tokenAmount?.uiAmount || 0;
          setJitoBalance(jitoAmount);
        } else {
          setJitoBalance(0);
        }
      } catch {
        setJitoBalance(0);
      }
    } catch (error) {
      console.error('Failed to fetch balance:', error);

      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('403') || errorMessage.includes('forbidden')) {
        console.error('RPC rate limit hit. Consider configuring VITE_SOLANA_RPC_URL in .env');
      }

      setBalance(null);
      setJitoBalance(null);
    } finally {
      setIsRefreshing(false);
    }
  }, [publicKey, connection]);

  // Fetch balance when wallet connects
  useEffect(() => {
    if (connected && publicKey) {
      refreshBalance();
    } else {
      setBalance(null);
      setJitoBalance(null);
    }
  }, [connected, publicKey, refreshBalance]);

  const connect = useCallback(() => {
    if (!wallet) {
      setVisible(true);
    }
  }, [wallet, setVisible]);

  const disconnect = useCallback(async () => {
    await walletDisconnect();
    setBalance(null);
    setJitoBalance(null);
  }, [walletDisconnect]);

  const signMessage = useCallback(async (message: Uint8Array): Promise<Uint8Array> => {
    if (!adapterSignMessage) throw new Error('Wallet does not support signMessage');
    return adapterSignMessage(message);
  }, [adapterSignMessage]);

  const sendTransaction = useCallback(async (transaction: VersionedTransaction): Promise<string> => {
    return adapterSendTransaction(transaction, connection);
  }, [adapterSendTransaction, connection]);

  const value: WalletContextType = {
    connected,
    balance,
    jitoBalance,
    address,
    connectionMode: connected ? 'adapter' : 'none',
    connect,
    disconnect,
    refreshBalance,
    isRefreshing,
    signMessage,
    sendTransaction,
    publicKey,
    accountLabel: null,
  };

  return (
    <WalletContext.Provider value={value}>
      {children}
    </WalletContext.Provider>
  );
};

// ─── Top-Level Provider ────────────────────────────────────────────────────
export const WalletProvider: FC<{ children: ReactNode }> = ({ children }) => {
  return <WalletAdapterWrapper>{children}</WalletAdapterWrapper>;
};

const WalletAdapterWrapper: FC<{ children: ReactNode }> = ({ children }) => {
  const endpoint = useMemo(() => RPC_ENDPOINT, []);

  // On web: standard adapters. On native: same adapters registered but MWA
  // handled by Kotlin plugin — the SolanaWalletProvider wrapper is kept so
  // components like JupiterTerminal that import useSolanaWallet() don't crash.
  const wallets = useMemo(() => [
    new PhantomWalletAdapter(),
    new SolflareWalletAdapter(),
  ], []);

  if (IS_NATIVE) {
    return (
      <ConnectionProvider endpoint={endpoint}>
        <SolanaWalletProvider wallets={wallets} autoConnect={false}>
          <NativeWalletContent>{children}</NativeWalletContent>
        </SolanaWalletProvider>
      </ConnectionProvider>
    );
  }

  return (
    <ConnectionProvider endpoint={endpoint}>
      <SolanaWalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <WebWalletContent>{children}</WebWalletContent>
        </WalletModalProvider>
      </SolanaWalletProvider>
    </ConnectionProvider>
  );
};
