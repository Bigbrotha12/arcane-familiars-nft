import { useCallback, useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import Nav from '@/components/layout/Nav';
import PassportLogin from '@/components/auth/PassportLogin';
import { getIdToken, isLoggedIn } from '@/lib/immutable';
import { installAuthBridge } from '@/lib/authBridge';
import { readIdToken, clearIdToken, storeIdToken } from '@/lib/token';

export default function PlayLayout() {
  const [signedIn, setSignedIn] = useState<boolean>(() => readIdToken() !== null);

  const refreshAuth = useCallback(async () => {
    const tokenPresent = readIdToken() !== null;
    if (tokenPresent) {
      try {
        const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8787';
        const res = await fetch(`${backendUrl}/api/auth/me`, {
          headers: { Authorization: `Bearer ${readIdToken()}` },
        });
        const data = (await res.json()) as { authenticated: boolean };
        if (!data.authenticated) {
          clearIdToken();
          setSignedIn(false);
          return;
        }
      } catch {
        // Network error — treat as demo mode, don't block play
      }
      setSignedIn(true);
      return;
    }
    try {
      const loggedIn = await isLoggedIn();
      setSignedIn(loggedIn);
      // Re-hydrate the session token so the game client (which reads
      // sessionStorage) sends the same identity this shell reports.
      if (loggedIn) {
        const token = await getIdToken();
        if (token) storeIdToken(token);
      }
    } catch {
      setSignedIn(false);
    }
  }, []);

  useEffect(() => {
    installAuthBridge();
    refreshAuth();
  }, [refreshAuth]);

  // The game client fires this when it exhausted its token refresh attempt, so
  // the signed-in chrome updates (the guest bar appears) instead of the player
  // silently continuing on a different account key.
  useEffect(() => {
    const onExpired = () => {
      void refreshAuth();
    };
    window.addEventListener('af:auth-expired', onExpired);
    return () => window.removeEventListener('af:auth-expired', onExpired);
  }, [refreshAuth]);

  return (
    <div className="h-screen flex flex-col bg-surface-primary overflow-hidden">
      <Nav />
      <main className="flex-1 flex flex-col min-h-0">
        <Outlet />
      </main>
      {!signedIn && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50">
          <div className="flex items-center gap-3 rounded-lg bg-surface-card/95 backdrop-blur-md px-4 py-2 shadow-card border border-border">
            <span className="font-body text-xs text-text-secondary">
              Playing as guest — progress is saved on this browser for 24 hours
            </span>
            <span className="text-text-muted">·</span>
            <PassportLogin onAuthChange={refreshAuth} />
          </div>
        </div>
      )}
    </div>
  );
}
