import { useEffect, useState } from 'react';

export function RecordingCountdown({ onComplete, onCancel }: { onComplete: () => void; onCancel: () => void }) {
  const [remaining, setRemaining] = useState(3);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (remaining === 1) onComplete();
      else setRemaining(remaining - 1);
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [remaining, onComplete]);
  useEffect(() => {
    const cancelWhenHidden = () => { if (document.visibilityState === 'hidden') onCancel(); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') onCancel(); };
    document.addEventListener('visibilitychange', cancelWhenHidden);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('visibilitychange', cancelWhenHidden);
      document.removeEventListener('keydown', escape);
    };
  }, [onCancel]);
  return <div className="recording-countdown">
    <div className="countdown-number" role="status" aria-live="assertive" aria-atomic="true"><span className="sr-only">Recording in </span>{remaining}</div>
    <p>Get ready to record</p>
    <div><button type="button" onClick={onComplete}>Skip countdown</button><button type="button" onClick={onCancel}>Cancel recording</button></div>
  </div>;
}
