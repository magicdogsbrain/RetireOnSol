import { registerPlugin } from '@capacitor/core';

export interface AuthorizeResult {
  publicKey: string;       // base64 encoded
  authToken: string;
  accountLabel?: string;   // e.g. Seed Vault .skr label
  walletUriBase?: string;
}

export interface SignMessageResult {
  signature: string;  // base64
}

export interface SignAndSendTransactionResult {
  signature: string;  // base58
}

interface SolanaMWAPlugin {
  authorize(): Promise<AuthorizeResult>;
  signMessage(options: {
    message: string;     // base64
    authToken: string;
  }): Promise<SignMessageResult>;
  signAndSendTransaction(options: {
    transaction: string; // base64 serialized VersionedTransaction
    authToken: string;
  }): Promise<SignAndSendTransactionResult>;
  disconnect(options?: { authToken?: string }): Promise<void>;
}

const SolanaMWA = registerPlugin<SolanaMWAPlugin>('SolanaMWA');

export default SolanaMWA;
