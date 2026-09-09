import React, { lazy, Suspense } from 'react';
import ReactDOM from 'react-dom/client';
const App = lazy(() => import('./App'));
const VideoEditor = lazy(() => import('./editor/VideoEditor'));
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Suspense fallback={<p role="status" style={{ padding: 24 }}>Loading studio…</p>}>
    {window.location.pathname.replace(/\/$/, '') === '/editor' ? <VideoEditor /> : <App />}
    </Suspense>
  </React.StrictMode>,
);
