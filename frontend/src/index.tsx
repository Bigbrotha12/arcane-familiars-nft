import { createRoot, Root } from 'react-dom/client';
import { Provider } from 'react-redux';
import { appStore } from './state/Context';
import "./styles.css";
import App from "./App";
import ErrorBoundary from './components/Common/ErrorBoundary';

const container: HTMLElement = document.getElementById("root")!
const root: Root = createRoot(container);

root.render(
    <ErrorBoundary>
        <Provider store={appStore}>
            <App />
        </Provider>
    </ErrorBoundary>
);