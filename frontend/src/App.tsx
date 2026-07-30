import { StrictMode } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/layout/Layout';
import ComingSoon from './components/Common/ComingSoon';
import LandingPage from './components/layout/LandingPage';
import GameCanvas from './components/Game/GameCanvas';

export default function App(): JSX.Element {
  return (
    <StrictMode>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/app" element={<Layout />}>
            <Route index element={<ComingSoon />} />
            <Route path="game" element={<GameCanvas />} />
            <Route path="collection" element={<ComingSoon />} />
            <Route path="marketplace" element={<ComingSoon />} />
            <Route path="minter" element={<ComingSoon />} />
            <Route path="bridge" element={<ComingSoon />} />
            <Route path="other" element={<ComingSoon />} />
            <Route path="*" element={<ComingSoon />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </StrictMode>
  )
}
