import { lazy, StrictMode, Suspense } from 'react';
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom';
import Layout from '@/components/layout/Layout';
import ComingSoon from '@/components/common/ComingSoon';
import LandingPage from '@/components/layout/LandingPage';
import PrivacyPolicy from '@/components/legal/PrivacyPolicy';
import TermsOfService from '@/components/legal/TermsOfService';
const FamiliarStatusPreview = lazy(() => import('@/components/game/hud/FamiliarStatusPreview'));

// Route-level code splitting keeps the game shell and HUD out of the initial
// landing-page bundle.
const PlayLayout = lazy(() => import('@/components/layout/PlayLayout'));
const GamePage = lazy(() => import('@/components/game/GamePage'));
const CollectionPage = lazy(() => import('@/components/collection/CollectionPage'));

function RouteLoading(): JSX.Element {
  return (
    <div className="flex min-h-[40vh] items-center justify-center bg-surface-primary">
      <p className="font-body text-sm text-text-secondary">Loading…</p>
    </div>
  );
}

const router = createBrowserRouter([
  {
    path: '/',
    element: <LandingPage />,
  },
  {
    path: '/privacy',
    element: <Layout />,
    children: [{ index: true, element: <PrivacyPolicy /> }],
  },
  {
    path: '/terms',
    element: <Layout />,
    children: [{ index: true, element: <TermsOfService /> }],
  },
  {
    path: '/app',
    element: <Layout />,
    children: [
      { index: true, element: <ComingSoon /> },
      { path: 'game', element: <Navigate to="/play/game" replace /> },
      {
        path: 'collection',
        element: (
          <Suspense fallback={<RouteLoading />}>
            <CollectionPage />
          </Suspense>
        ),
      },
      { path: 'other', element: <ComingSoon /> },
      { path: '*', element: <ComingSoon /> },
    ],
  },
  {
    path: '/play',
    element: (
      <Suspense fallback={<RouteLoading />}>
        <PlayLayout />
      </Suspense>
    ),
    children: [
      { index: true, element: <Navigate to="/play/game" replace /> },
      { path: 'game', element: <GamePage /> },
    ],
  },
  {
    path: '/preview',
    element: (
      <Suspense fallback={<RouteLoading />}>
        <FamiliarStatusPreview />
      </Suspense>
    ),
  },
]);

export default function App(): JSX.Element {
  return (
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>
  );
}
