import { useCallback, useEffect, useState } from 'react';
import Button from '@/components/ui/Button';
import { login, logout, isLoggedIn, getIdToken, getWalletAddress } from '@/lib/immutable';
import { storeIdToken, clearIdToken } from '@/lib/token';
import { bindWallet, clearBoundWallet, adoptGuestGame } from '@/lib/wallet';

interface PassportLoginProps {
  onAuthChange?: (signedIn: boolean) => void;
}

function truncateAddress(address: string): string {
  if (address.length <= 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export default function PassportLogin({ onAuthChange }: PassportLoginProps) {
  const [signedIn, setSignedIn] = useState<boolean>(false);
  const [address, setAddress] = useState<string>('');
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [adoptNotice, setAdoptNotice] = useState<string | null>(null);

  const handleAuthState = useCallback(
    (next: boolean) => {
      setSignedIn(next);
      onAuthChange?.(next);
    },
    [onAuthChange]
  );

  const refreshSession = useCallback(async () => {
    try {
      const loggedIn = await isLoggedIn();
      handleAuthState(loggedIn);
      if (loggedIn) {
        const token = await getIdToken();
        if (token) storeIdToken(token);
        const wallet = await getWalletAddress();
        if (wallet) setAddress(wallet);
      } else {
        clearIdToken();
        clearBoundWallet();
        setAddress('');
        setAdoptNotice(null);
      }
    } catch {
      clearIdToken();
      clearBoundWallet();
      handleAuthState(false);
      setAddress('');
      setAdoptNotice(null);
    }
  }, [handleAuthState]);

  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  const handleLogin = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const user = await login();
      if (user) {
        const token = await getIdToken();
        if (token) storeIdToken(token);
        const wallet = await getWalletAddress();
        if (wallet) setAddress(wallet);
        handleAuthState(true);

        // Attempt wallet binding and guest-game adoption in parallel — both
        // are non-blocking, and a failure in either must never block play.
        if (token) {
          const walletPromise = wallet ? bindWallet(wallet, token) : Promise.resolve(null);
          const adoptPromise = adoptGuestGame(token);
          const [walletResult, adoptResult] = await Promise.all([walletPromise, adoptPromise]);

          if (walletResult && !walletResult.bound && walletResult.error) {
            setError(`Wallet binding skipped: ${walletResult.error}`);
          }

          if (adoptResult.adopted) {
            setAdoptNotice('Your guest progress was saved to your account.');
          }
        }
      }
    } catch (e) {
      console.error('Passport login failed:', e);
      setError('Sign-in failed. Please try again.');
      handleAuthState(false);
    } finally {
      setBusy(false);
    }
  }, [handleAuthState]);

  const handleLogout = useCallback(async () => {
    setBusy(true);
    try {
      clearIdToken();
      clearBoundWallet();
      await logout();
      setAddress('');
      setAdoptNotice(null);
      handleAuthState(false);
    } catch (e) {
      console.error('Passport logout failed:', e);
    } finally {
      setBusy(false);
    }
  }, [handleAuthState]);

  if (signedIn) {
    return (
      <div className="flex items-center gap-3">
        {adoptNotice && (
          <span className="hidden sm:inline-flex items-center gap-2 rounded-full bg-accent-light px-3 py-1.5 font-mono text-sm text-accent">
            {adoptNotice}
          </span>
        )}
        {address && (
          <span className="hidden sm:inline-flex items-center gap-2 rounded-full bg-accent-light px-3 py-1.5 font-mono text-sm text-accent">
            {truncateAddress(address)}
          </span>
        )}
        <Button variant="secondary" size="sm" onClick={handleLogout} disabled={busy}>
          Sign out
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <Button size="md" onClick={handleLogin} disabled={busy}>
        {busy ? 'Signing in...' : 'Sign in with Immutable Passport'}
      </Button>
      {error && <p className="text-sm text-error font-body">{error}</p>}
    </div>
  );
}
