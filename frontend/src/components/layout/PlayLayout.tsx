import { useCallback, useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import Nav from '@/components/layout/Nav';

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

  // The guest/auth pill lives in the game toolbar (beside Save), not floating
  // over the play area, so it can never cover the canvas controls.
  return (
    <div className="h-screen flex flex-col bg-surface-primary overflow-hidden">
      <Nav />
      <main className="flex-1 flex flex-col min-h-0">
        <Outlet context={{ signedIn, onAuthChange: handleAuthChange }} />
      </main>
    </div>
  );
}
