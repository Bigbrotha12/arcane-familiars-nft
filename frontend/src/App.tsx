import { StrictMode } from 'react';
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom';
import Layout from '@/components/layout/Layout';
import PlayLayout from '@/components/layout/PlayLayout';
import ComingSoon from '@/components/common/ComingSoon';
import LandingPage from '@/components/layout/LandingPage';
import GamePage from '@/components/game/GamePage';
import FamiliarStatusPreview from '@/components/game/hud/FamiliarStatusPreview';

/**
 * Minimal callback page for the Immutable Passport OAuth redirect. The SDK's
 * popup login flow redirects to `${origin}/callback` after authentication; the
 * SPA must be routable here so the `@imtbl/auth` SDK can load, exchange the
 * authorization code for tokens, and postMessage the result back to the opener.
 */
function CallbackHandler() {
  return (
    <div className="h-screen flex items-center justify-center bg-surface-primary">
      <p className="font-body text-sm text-text-secondary">Completing sign-in…</p>
    </div>
  );
}

const router = createBrowserRouter([
  {
    path: '/',
    element: <LandingPage />,
  },
  {
    path: '/callback',
    element: <CallbackHandler />,
  },
  {
    path: '/app',
    element: <Layout />,
    children: [
      { index: true, element: <ComingSoon /> },
      { path: 'game', element: <Navigate to="/play/game" replace /> },
      { path: 'collection', element: <ComingSoon /> },
      { path: 'marketplace', element: <ComingSoon /> },
      { path: 'minter', element: <ComingSoon /> },
      { path: 'bridge', element: <ComingSoon /> },
      { path: 'other', element: <ComingSoon /> },
      { path: '*', element: <ComingSoon /> },
    ],
  },
  {
    path: '/play',
    element: <PlayLayout />,
    children: [
      { index: true, element: <Navigate to="/play/game" replace /> },
      { path: 'game', element: <GamePage /> },
    ],
  },
  {
    path: '/preview',
    element: <FamiliarStatusPreview />,
  },
])

export default function App(): JSX.Element {
  return (
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>
  )
}
