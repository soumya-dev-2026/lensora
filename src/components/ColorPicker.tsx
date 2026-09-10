import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { clampColor, hexToHsv, hsvToHex, wheelColor, type HSV } from '../utils/color';
import './ColorPicker.css';

const PRESETS = [
  ['White', '#ffffff'], ['Black', '#000000'], ['Aqua', '#78f5e3'], ['Red', '#ff416d'],
  ['Orange', '#ff963f'], ['Yellow', '#ffdc58'], ['Green', '#57db83'], ['Blue', '#4b9cff'],
  ['Purple', '#a478ff'], ['Pink', '#ff87ca'], ['Gray', '#8899aa'], ['Navy', '#122b40'],
] as const;
export function ColorPicker({ label, value, onChange, opacity, onOpacityChange, disabled = false }: {
  label: string; value: string; onChange: (value: string) => void; opacity?: number; onOpacityChange?: (value: number) => void; disabled?: boolean;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [hsv, setHsv] = useState(() => hexToHsv(value));
  const [hex, setHex] = useState(value);
  const [error, setError] = useState('');
  const pointer = useRef<number | null>(null);
  useEffect(() => { setHsv((current) => hsvToHex(current) === value.toLowerCase() ? current : hexToHsv(value)); setHex(value); setError(''); }, [value]);
  const change = (next: HSV) => { setHsv(next); const color = hsvToHex(next); setHex(color); setError(''); onChange(color); };
  const point = (event: React.PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    change(wheelColor(event.clientX - bounds.left - bounds.width / 2, event.clientY - bounds.top - bounds.height / 2, bounds.width / 2, hsv));
  };
  const commitHex = () => {
    const normalized = hex.startsWith('#') ? hex : `#${hex}`;
    const expanded = /^#[\da-f]{3}$/i.test(normalized) ? '#' + normalized.slice(1).split('').map((c) => c + c).join('') : normalized;
    if (!/^#[\da-f]{6}$/i.test(expanded)) { setError('Enter a hex color, such as #78F5E3.'); return; }
    change(hexToHsv(expanded));
  };
  const angle = hsv.h * Math.PI / 180;
  return <fieldset className="custom-color-picker" disabled={disabled}>
    <button type="button" className="color-picker-trigger" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}><span>{label}</span><span className="color-picker-chip" style={{ background: value }} /><span className="color-picker-code">{value.toUpperCase()}</span><span aria-hidden="true">{open ? '−' : '+'}</span></button>
    {open && <div id={id} className="color-picker-panel" role="group" aria-label={`${label} picker`}>
      <div className="color-picker-presets" role="group" aria-label={`${label} presets`}>{PRESETS.map(([name, color]) => <button key={name} type="button" aria-label={`${label}: ${name}`} title={name} aria-pressed={value.toLowerCase() === color} style={{ '--swatch': color } as CSSProperties} onClick={() => change(hexToHsv(color))}><span /></button>)}</div>
      <div className="color-picker-wheel" role="slider" tabIndex={disabled ? -1 : 0} aria-label={`${label} color wheel`} aria-valuemin={0} aria-valuemax={360} aria-valuenow={Math.round(hsv.h)} aria-valuetext={`Hue ${Math.round(hsv.h)} degrees, saturation ${Math.round(hsv.s)} percent`} aria-description="Drag to choose color. Left and right arrows change hue; up and down arrows change saturation. Shift makes larger changes." style={{ '--shade': 1 - hsv.v / 100 } as CSSProperties}
        onPointerDown={(event) => { if (disabled || event.currentTarget.closest('fieldset:disabled') || event.button !== 0 || pointer.current !== null) return; event.preventDefault(); event.currentTarget.focus(); pointer.current = event.pointerId; event.currentTarget.setPointerCapture(event.pointerId); point(event); }}
        onPointerMove={(event) => { if (!disabled && !event.currentTarget.closest('fieldset:disabled') && pointer.current === event.pointerId) point(event); }}
        onPointerUp={(event) => { pointer.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }} onPointerCancel={() => { pointer.current = null; }} onLostPointerCapture={() => { pointer.current = null; }}
        onKeyDown={(event) => { if (disabled || event.currentTarget.closest('fieldset:disabled') || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return; event.preventDefault(); const step = event.shiftKey ? 10 : 1; change({ ...hsv, h: (hsv.h + (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0) + 360) % 360, s: clampColor(hsv.s + (event.key === 'ArrowUp' ? step : event.key === 'ArrowDown' ? -step : 0)) }); }}>
        <span className="color-wheel-marker" style={{ left: `${50 + Math.cos(angle) * hsv.s / 2}%`, top: `${50 - Math.sin(angle) * hsv.s / 2}%`, background: value }} />
      </div>
      <label className="color-picker-range"><span>Brightness<output>{Math.round(hsv.v)}%</output></span><input type="range" aria-label={`${label} brightness`} min={0} max={100} value={hsv.v} style={{ '--range-color': hsvToHex({ ...hsv, v: 100 }) } as CSSProperties} onChange={(event) => change({ ...hsv, v: Number(event.target.value) })} /></label>
      {onOpacityChange && opacity !== undefined && <label className="color-picker-range"><span>Opacity<output>{Math.round(opacity)}%</output></span><input className="color-opacity-range" type="range" aria-label={`${label} opacity`} min={0} max={100} value={opacity} style={{ '--range-color': value } as CSSProperties} onChange={(event) => onOpacityChange(Number(event.target.value))} /></label>}
      <label className="color-picker-hex">Hex<input type="text" aria-label={`${label} hex`} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined} value={hex} maxLength={7} spellCheck={false} onChange={(event) => { setHex(event.target.value); setError(''); }} onBlur={commitHex} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); commitHex(); } }} /></label>
      {error && <p id={`${id}-error`} role="alert" className="color-picker-error">{error}</p>}
      <button type="button" className="color-picker-done" onClick={() => setOpen(false)}>Done</button>
    </div>}
  </fieldset>;
}
