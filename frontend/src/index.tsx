import { createRoot, Root } from 'react-dom/client';
import "./styles.css";
import App from "./App";
import ErrorBoundary from './components/Common/ErrorBoundary';

window.addEventListener('error', (event) => {
  console.error('Uncaught error:', event.error);
  const errorDiv = document.createElement('div');
  errorDiv.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#f44336;color:white;padding:20px;font-family:monospace;z-index:9999;max-height:50vh;overflow:auto;';
  errorDiv.innerHTML = `<strong>Uncaught Error:</strong><br/><pre style="margin:10px 0;white-space:pre-wrap;">${event.error?.message || event.message}</pre><pre style="font-size:12px;opacity:0.8;">${event.error?.stack || ''}</pre>`;
  document.body.appendChild(errorDiv);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
  const errorDiv = document.createElement('div');
  errorDiv.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#ff9800;color:white;padding:20px;font-family:monospace;z-index:9999;max-height:50vh;overflow:auto;';
  errorDiv.innerHTML = `<strong>Unhandled Promise Rejection:</strong><br/><pre style="margin:10px 0;white-space:pre-wrap;">${event.reason?.message || String(event.reason)}</pre><pre style="font-size:12px;opacity:0.8;">${event.reason?.stack || ''}</pre>`;
  document.body.appendChild(errorDiv);
});

const container: HTMLElement = document.getElementById("root")!
const root: Root = createRoot(container);

try {
  root.render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
} catch (error) {
  console.error('Render failed:', error);
  container.innerHTML = `<div style="padding:40px;font-family:monospace;color:#f44336;"><h2>React failed to render</h2><pre>${(error as Error).message}</pre><pre style="font-size:12px;">${(error as Error).stack}</pre></div>`;
}
