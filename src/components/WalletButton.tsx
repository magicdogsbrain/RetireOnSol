import { useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { useWalletBalance } from '../hooks/useWalletBalance';

interface WalletButtonProps {
  onBalanceLoaded?: (balance: number) => void;
}

export function WalletButton({ onBalanceLoaded }: WalletButtonProps) {
  const { connected, disconnect, publicKey } = useWallet();
  const { setVisible } = useWalletModal();
  const { balance, loading } = useWalletBalance();

  // Notify parent when balance is loaded
  useEffect(() => {
    if (balance !== null && onBalanceLoaded) {
      onBalanceLoaded(balance);
    }
  }, [balance, onBalanceLoaded]);

  const handleClick = () => {
    if (connected) {
      disconnect();
    } else {
      setVisible(true);
    }
  };

  const shortAddress = publicKey
    ? `${publicKey.toBase58().slice(0, 4)}...${publicKey.toBase58().slice(-4)}`
    : '';

  return (
    <button
      type="button"
      className={`wallet-btn ${connected ? 'connected' : ''}`}
      onClick={handleClick}
    >
      {connected ? (
        <>
          <span className="wallet-address">{shortAddress}</span>
          {loading ? (
            <span className="wallet-balance">Loading...</span>
          ) : balance !== null ? (
            <span className="wallet-balance">{balance} SOL</span>
          ) : null}
        </>
      ) : (
        'Connect Wallet'
      )}
    </button>
  );
}
