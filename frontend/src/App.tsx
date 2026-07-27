import { StrictMode } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/00_Layout/Layout';
import ComingSoon from './components/Common/ComingSoon';
import LandingPage from './components/00_Layout/LandingPage';

export default function App(): JSX.Element {
  return (
    <StrictMode>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/app" element={<Layout />}>
            <Route index element={<ComingSoon />} />
            <Route path="game" element={<ComingSoon />} />
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
