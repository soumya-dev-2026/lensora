import { useEffect } from 'react';

// Mounted inside Suspense so the splash stays until the requested page is ready.
export function StartupSplash() {
  useEffect(() => {
    const splash = document.getElementById('startup-splash');
    if (!splash) return;
    const poster = splash.querySelector('img');
    let holdTimer: number | undefined;
    let removeTimer: number | undefined;
    let leaving = false;
    const dismiss = () => {
      if (leaving) return;
      leaving = true;
      splash.classList.add('leaving');
      removeTimer = window.setTimeout(() => {
        splash.remove();
        const root = document.getElementById('root');
        root?.removeAttribute('inert');
        root?.removeAttribute('aria-hidden');
      }, 300);
    };
    const showPoster = () => {
      window.clearTimeout(holdTimer);
      holdTimer = window.setTimeout(dismiss, 1800);
    };
    if (poster?.complete) showPoster();
    else {
      poster?.addEventListener('load', showPoster);
      poster?.addEventListener('error', dismiss);
    }
    // A missing or slow poster must never prevent access to the ready app.
    const fallbackTimer = window.setTimeout(dismiss, 4000);
    return () => {
      window.clearTimeout(holdTimer);
      window.clearTimeout(removeTimer);
      window.clearTimeout(fallbackTimer);
      poster?.removeEventListener('load', showPoster);
      poster?.removeEventListener('error', dismiss);
      splash.classList.remove('leaving');
    };
  }, []);
  return null;
}
