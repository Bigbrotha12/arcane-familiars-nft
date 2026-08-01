import { StrictMode } from 'react';
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom';
import Layout from '@/components/layout/Layout';
import PlayLayout from '@/components/layout/PlayLayout';
import ComingSoon from '@/components/common/ComingSoon';
import LandingPage from '@/components/layout/LandingPage';
import GamePage from '@/components/game/GamePage';

const router = createBrowserRouter([
  {
    path: '/',
    element: <LandingPage />,
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
])

export default function App(): JSX.Element {
  return (
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>
  )
}
