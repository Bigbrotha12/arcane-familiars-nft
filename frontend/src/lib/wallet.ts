import { getProvider } from '@/lib/immutable';

const PASSPORT_WALLET_KEY = 'af_passport_wallet';

export function storeBoundWallet(address: string): void {
  try {
    sessionStorage.setItem(PASSPORT_WALLET_KEY, address);
  } catch {
    // ignore storage failures
  }
}

export function readBoundWallet(): string | null {
  try {
    return sessionStorage.getItem(PASSPORT_WALLET_KEY);
  } catch {
    return null;
  }
}

export function clearBoundWallet(): void {
  try {
    sessionStorage.removeItem(PASSPORT_WALLET_KEY);
  } catch {
    // ignore storage failures
  }
}

export interface WalletBindResult {
  bound: boolean;
  walletAddress?: string;
  error?: string;
}

/**
 * Request a server-issued nonce challenge, sign it with the wallet via
 * EIP-1193 `personal_sign`, then POST the signed result to the backend
 * for wallet binding. Non-blocking on failure — if binding fails the player
 * can still play (they just won't sync NFTs).
 */
export async function bindWallet(walletAddress: string, idToken: string): Promise<WalletBindResult> {
  const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8787';

  try {
    // Step 1: request a fresh challenge from the server.
    const challengeRes = await fetch(`${backendUrl}/api/auth/wallet-challenge`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ walletAddress }),
    });

    if (!challengeRes.ok) {
      console.info('Wallet challenge request failed — proceeding without sync.');
      return { bound: false, error: 'Challenge request failed' };
    }

    const { message, nonce } = (await challengeRes.json()) as {
      nonce: string;
      message: string;
      expiresAt: string;
    };

    // Step 2: sign the exact server-provided message.
    const provider = await getProvider();
    const signature = await provider.request({
      method: 'personal_sign',
      params: [message, walletAddress],
    });

    // Step 3: POST the signed challenge to bind the wallet.
    const res = await fetch(`${backendUrl}/api/auth/wallet`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ walletAddress, message, signature, nonce }),
    });

    if (res.ok) {
      const data = (await res.json()) as { bound: boolean; walletAddress: string };
      if (data.bound) {
        storeBoundWallet(data.walletAddress);
        return { bound: true, walletAddress: data.walletAddress };
      }
    }

    if (res.status === 409) {
      console.info('Wallet already bound to another account — proceeding without sync.');
      return { bound: false, error: 'Wallet already bound to another account' };
    }

    if (res.status === 400) {
      console.info('Wallet binding rejected (bad signature/format) — proceeding without sync.');
      return { bound: false, error: 'Wallet binding rejected' };
    }

    return { bound: false, error: `Unexpected status ${res.status}` };
  } catch (err) {
    console.warn('Wallet binding failed (non-blocking):', err);
    return { bound: false, error: (err as Error).message };
  }
}

export interface AdoptGuestGameResult {
  adopted: boolean;
  reason?: string;
}

/**
 * Migrate a guest's persisted demo progress to the signed-in Passport account
 * (`POST /api/auth/adopt`). Reads the guest UUID from localStorage
 * (`af_anonymous_id`). Non-blocking on failure — if adoption fails the player
 * can still play with their account save.
 */
export async function adoptGuestGame(idToken: string): Promise<AdoptGuestGameResult> {
  const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8787';

  let anonymousId: string | null;
  try {
    anonymousId = localStorage.getItem('af_anonymous_id');
  } catch {
    return { adopted: false };
  }
  if (!anonymousId) return { adopted: false };

  try {
    const res = await fetch(`${backendUrl}/api/auth/adopt`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ anonymousId }),
    });

    if (!res.ok) return { adopted: false, reason: `http-${res.status}` };

    const data = (await res.json()) as { adopted: boolean; reason?: string };
    return { adopted: data.adopted === true, reason: data.reason };
  } catch (err) {
    console.warn('Guest game adoption failed (non-blocking):', err);
    return { adopted: false };
  }
}
