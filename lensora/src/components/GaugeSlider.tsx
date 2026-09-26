import { useId, useRef } from 'react';
import { Icon, type IconName } from './Icon';
import './GaugeSlider.css';

export function gaugeValue(x: number, y: number, min: number, max: number, step: number): number {
  const angle = (Math.atan2(y, x) * 180 / Math.PI - 135 + 360) % 360;
  const sweep = angle > 270 ? (angle > 315 ? 0 : 270) : angle;
  const raw = min + sweep / 270 * (max - min);
  return Number(Math.max(min, Math.min(max, min + Math.round((raw - min) / step) * step)).toFixed(6));
}

export function GaugeSlider({ id, label, icon = 'sliders', value, min = 0, max = 100, step = 1, suffix = '%', disabled = false, preview, onChange }: {
  id?: string; label: string; icon?: IconName; value: number; min?: number; max?: number; step?: number; suffix?: string; disabled?: boolean; preview?: { src: string; filter?: string }; onChange: (value: number) => void;
}) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const input = useRef<HTMLInputElement>(null);
  const dragging = useRef<number | null>(null);
  const bounded = Math.max(min, Math.min(max, value));
  const fraction = max > min ? (bounded - min) / (max - min) : 0;
  const rotation = 135 + fraction * 270;
  const inactive = disabled || max <= min;
  const display = Number(bounded.toFixed(2));
  const change = (next: number) => onChange(Number(Math.max(min, Math.min(max, next)).toFixed(6)));
  const point = (event: React.PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - bounds.left - bounds.width / 2;
    const y = event.clientY - bounds.top - bounds.height / 2;
    // The center is a value display, not an angular target.
    if (Math.hypot(x, y) < bounds.width * 0.12) return;
    onChange(gaugeValue(x, y, min, max, step));
  };
  return <div className="gauge-control" data-disabled={inactive || undefined}>
    <div className="gauge-caption">
      {preview && <div className="gauge-preview" aria-hidden="true"><img src={preview.src} alt="" style={{ filter: preview.filter }} /><Icon name={icon} size={18} /></div>}
      <label htmlFor={inputId}><Icon name={icon} size={21} /><span>{label}</span></label>
      <span className="gauge-hint" id={`${inputId}-hint`}>Turn the knob to adjust</span>
      <div className="gauge-step-buttons">
        <button type="button" aria-label={`Decrease ${label}`} disabled={inactive || bounded <= min} onClick={() => change(bounded - step)}><Icon name="minus" size={16} /></button>
        <button type="button" aria-label={`Increase ${label}`} disabled={inactive || bounded >= max} onClick={() => change(bounded + step)}><Icon name="plus" size={16} /></button>
      </div>
    </div>
    <div className="gauge-dial" onPointerDown={(event) => {
      if (event.button !== 0 || dragging.current !== null || inactive || input.current?.matches(':disabled')) return;
      event.preventDefault(); input.current?.focus(); dragging.current = event.pointerId;
      event.currentTarget.setPointerCapture(event.pointerId); point(event);
    }} onPointerMove={(event) => { if (dragging.current === event.pointerId && !inactive && !input.current?.matches(':disabled')) point(event); }} onPointerUp={(event) => {
      if (dragging.current !== event.pointerId) return;
      dragging.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    }} onPointerCancel={() => { dragging.current = null; }} onLostPointerCapture={() => { dragging.current = null; }}>
      <input ref={input} className="gauge-input" id={inputId} aria-label={label} aria-describedby={`${inputId}-hint`} aria-valuetext={`${display}${suffix}`} type="range" min={min} max={max} step={step} value={bounded} disabled={inactive} onChange={(event) => change(Number(event.target.value))} />
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <defs>
          <linearGradient id={`${generatedId}-bevel`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#44849a" /><stop offset="35%" stopColor="#163f55" /><stop offset="70%" stopColor="#041521" /><stop offset="100%" stopColor="#285b73" />
          </linearGradient>
          <linearGradient id={`${generatedId}-surface`} x1="0" y1="0" x2="0.8" y2="1">
            <stop offset="0%" stopColor="#204c62" /><stop offset="55%" stopColor="#102e42" /><stop offset="100%" stopColor="#071a28" />
          </linearGradient>
        </defs>
        <circle className="gauge-track" cx="60" cy="60" r="48" pathLength="100" strokeDasharray="75 25" transform="rotate(135 60 60)" />
        <circle className="gauge-fill" cx="60" cy="60" r="48" pathLength="100" strokeDasharray={`${fraction * 75} 100`} transform="rotate(135 60 60)" />
        {Array.from({ length: 11 }, (_, index) => {
          const a = (135 + index * 27) * Math.PI / 180;
          return <line key={index} className={index / 10 <= fraction ? 'gauge-tick active' : 'gauge-tick'} x1={60 + 53 * Math.cos(a)} y1={60 + 53 * Math.sin(a)} x2={60 + 56 * Math.cos(a)} y2={60 + 56 * Math.sin(a)} />;
        })}
        <circle className="knob-shadow" cx="60" cy="63" r="41" />
        <circle className="knob-bevel" cx="60" cy="60" r="41" fill={`url(#${generatedId}-bevel)`} />
        <circle className="knob-surface" cx="60" cy="60" r="37" fill={`url(#${generatedId}-surface)`} />
        <g className="knob-rotor" style={{ transform: `rotate(${rotation}deg)` }}>
          {Array.from({ length: 32 }, (_, index) => {
            const a = index * Math.PI / 16;
            return <line key={index} className="knob-grip" x1={60 + 33 * Math.cos(a)} y1={60 + 33 * Math.sin(a)} x2={60 + 35 * Math.cos(a)} y2={60 + 35 * Math.sin(a)} />;
          })}
          <line className="knob-indicator-glow" x1="88" y1="60" x2="95" y2="60" />
          <line className="knob-indicator" x1="88" y1="60" x2="95" y2="60" />
        </g>
        <circle className="knob-center" cx="60" cy="60" r="24" />
        <text className="gauge-number" x="60" y="60" textAnchor="middle" dominantBaseline="central">{display}<tspan className="gauge-unit" dominantBaseline="central">{suffix}</tspan></text>
        <text className="gauge-limit" x="21" y="111" textAnchor="middle">{min}</text>
        <text className="gauge-limit" x="99" y="111" textAnchor="middle">{max}</text>
      </svg>
    </div>
  </div>;
}
