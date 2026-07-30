import { StrictMode } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/layout/Layout';
import PlayLayout from './components/layout/PlayLayout';
import ComingSoon from './components/Common/ComingSoon';
import LandingPage from './components/layout/LandingPage';

export default function App(): JSX.Element {
  return (
    <StrictMode>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/app" element={<Layout />}>
            <Route index element={<ComingSoon />} />
            <Route path="game" element={<Navigate to="/play/game" replace />} />
            <Route path="collection" element={<ComingSoon />} />
            <Route path="marketplace" element={<ComingSoon />} />
            <Route path="minter" element={<ComingSoon />} />
            <Route path="bridge" element={<ComingSoon />} />
            <Route path="other" element={<ComingSoon />} />
            <Route path="*" element={<ComingSoon />} />
          </Route>
          <Route path="/play" element={<PlayLayout />}>
            <Route index element={<Navigate to="/play/game" replace />} />
            <Route path="game" element={<ComingSoon />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </StrictMode>
  )
}
