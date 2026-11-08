import { useCallback, useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import Nav from '@/components/layout/Nav';
import AuthForm from '@/components/auth/AuthForm';

export default function PlayLayout() {
  const [signedIn, setSignedIn] = useState(false);

  const handleAuthChange = useCallback((next: boolean) => {
    setSignedIn(next);
  }, []);

  useEffect(() => {
    const onExpired = () => setSignedIn(false);
    window.addEventListener('af:auth-expired', onExpired);
    return () => window.removeEventListener('af:auth-expired', onExpired);
  }, []);

  return (
    <div className="h-screen flex flex-col bg-surface-primary overflow-hidden">
      <Nav />
      <main className="flex-1 flex flex-col min-h-0">
        <Outlet />
      </main>

      <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2">
        <div className="flex items-center gap-3 rounded-lg border border-border bg-surface-card/95 px-4 py-2 shadow-card backdrop-blur-md">
          {!signedIn && (
            <>
              <span className="font-body text-xs text-text-secondary">
                Playing as guest — progress is saved on this browser
              </span>
              <span className="text-text-muted">·</span>
            </>
          )}
          <AuthForm compact onAuthChange={handleAuthChange} />
        </div>
      </div>
    </div>
  );
}
