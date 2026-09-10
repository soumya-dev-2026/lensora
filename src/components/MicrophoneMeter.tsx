import { useEffect, useState } from 'react';
import type { RecordingAudio } from '../recording/RecordingAudio';

export function MicrophoneMeter({ audio, active, muted, pending }: { audio: RecordingAudio; active: boolean; muted: boolean; pending: boolean }) {
  const [level, setLevel] = useState<number | null>(0);
  useEffect(() => {
    setLevel(0);
    if (!active || muted || pending) return;
    const timer = window.setInterval(() => setLevel(audio.level()), 100);
    return () => window.clearInterval(timer);
  }, [audio, active, muted, pending]);
  if (!active) return null;
  const value = muted || pending ? 0 : level ?? 0;
  return <div className="microphone-meter">
    <meter min={0} max={1} value={value} aria-label="Microphone input level" />
    <span>{pending ? 'Connecting mic…' : muted ? 'Mic muted' : level === null ? 'Meter unavailable' : value > .9 ? 'Mic is loud' : 'Mic level'}</span>
  </div>;
}
