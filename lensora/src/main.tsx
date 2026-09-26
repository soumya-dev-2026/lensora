import React, { lazy, Suspense } from 'react';
import ReactDOM from 'react-dom/client';
const App = lazy(() => import('./App'));
const VideoEditor = lazy(() => import('./editor/VideoEditor'));
import './index.css';
import { readPreference } from './storage/uiPreferences';
import { StartupSplash } from './components/StartupSplash';
import { installNativeDownloads } from './nativeDownloads';

installNativeDownloads();

document.documentElement.dataset.motion = readPreference('animations') ? 'on' : 'off';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Suspense fallback={<p role="status" style={{ padding: 24 }}>Loading studio…</p>}>
    {window.location.pathname.replace(/\/$/, '') === '/editor' ? <VideoEditor /> : <App />}
    <StartupSplash />
    </Suspense>
  </React.StrictMode>,
);
