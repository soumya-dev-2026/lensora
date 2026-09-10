import { useEffect } from 'react';
import { Icon } from './Icon';

export function CompareButton({ onChange }: { onChange: (held: boolean) => void }) {
  useEffect(() => {
    const release = () => onChange(false);
    window.addEventListener('blur', release);
    document.addEventListener('visibilitychange', release);
    return () => { window.removeEventListener('blur', release); document.removeEventListener('visibilitychange', release); release(); };
  }, [onChange]);
  return <button type="button" className="compare-button glass text-icon" aria-label="Hold to compare with original camera" onPointerDown={(event) => {
    if (event.button !== 0) return;
    event.preventDefault(); event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId); onChange(true);
  }} onPointerUp={(event) => { onChange(false); if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }} onPointerCancel={() => onChange(false)} onLostPointerCapture={() => onChange(false)} onBlur={() => onChange(false)} onKeyDown={(event) => {
    if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); onChange(true); }
    if (event.key === 'Escape') onChange(false);
  }} onKeyUp={(event) => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); onChange(false); } }}>
    <Icon name="contrast" size={17} />Hold to compare
  </button>;
}
