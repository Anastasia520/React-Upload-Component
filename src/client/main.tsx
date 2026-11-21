import './index.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import { createChunkedHttpTransport } from './transport/chunked-http/chunkedHttpTransport';

const rootElement = document.getElementById('root');
if (!rootElement) {
    throw new Error('Could not find root element to mount to.');
}

// The adapter for the demo API. Another backend only needs another transport here.
const transport = createChunkedHttpTransport();

createRoot(rootElement).render(
    <StrictMode>
        <App transport={transport} />
    </StrictMode>
);
