import { createRoot, Root } from 'react-dom/client';
import "@/styles.css";
import App from "@/App";
import ErrorBoundary from '@/components/common/ErrorBoundary';

function appendErrorOverlay({
  title,
  message,
  stack,
  background,
}: {
  title: string
  message: string
  stack?: string
  background: string
}) {
  const errorDiv = document.createElement('div');
  errorDiv.style.cssText = `position:fixed;top:0;left:0;right:0;background:${background};color:white;padding:20px;font-family:monospace;z-index:9999;max-height:50vh;overflow:auto;`;

  const heading = document.createElement('strong');
  heading.textContent = title;
  errorDiv.appendChild(heading);

  const messagePre = document.createElement('pre');
  messagePre.style.cssText = 'margin:10px 0;white-space:pre-wrap;';
  messagePre.textContent = message;
  errorDiv.appendChild(messagePre);

  if (stack) {
    const stackPre = document.createElement('pre');
    stackPre.style.cssText = 'font-size:12px;opacity:0.8;';
    stackPre.textContent = stack;
    errorDiv.appendChild(stackPre);
  }

  document.body.appendChild(errorDiv);
}

window.addEventListener('error', (event) => {
  console.error('Uncaught error:', event.error);
  appendErrorOverlay({
    title: 'Uncaught Error:',
    message: event.error?.message || event.message,
    stack: event.error?.stack || '',
    background: '#f44336',
  });
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
  appendErrorOverlay({
    title: 'Unhandled Promise Rejection:',
    message: event.reason?.message || String(event.reason),
    stack: event.reason?.stack || '',
    background: '#ff9800',
  });
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
  const err = error as Error;
  const renderErrorDiv = document.createElement('div');
  renderErrorDiv.style.cssText = 'padding:40px;font-family:monospace;color:#f44336;';

  const heading = document.createElement('h2');
  heading.textContent = 'React failed to render';
  renderErrorDiv.appendChild(heading);

  const messagePre = document.createElement('pre');
  messagePre.textContent = err.message;
  renderErrorDiv.appendChild(messagePre);

  const stackPre = document.createElement('pre');
  stackPre.style.cssText = 'font-size:12px;';
  stackPre.textContent = err.stack || '';
  renderErrorDiv.appendChild(stackPre);

  container.appendChild(renderErrorDiv);
}
