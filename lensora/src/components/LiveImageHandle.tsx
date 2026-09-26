import { useRef } from 'react';
import { liveImageLayout, type LiveImage } from '../rendering/liveImages';
import './LiveText.css';

export function LiveImageHandle({ value, width, height, onChange }: { value: LiveImage; width: number; height: number; onChange: (value: LiveImage) => void }) {
  const drag = useRef<{ id: number; x: number; y: number; centerX: number; centerY: number } | null>(null);
  const box = liveImageLayout(value, width, height);
  const move = (x: number, y: number) => onChange({ ...value,
    x: Math.max(box.width / width * 50, Math.min(100 - box.width / width * 50, x)),
    y: Math.max(box.height / height * 50, Math.min(100 - box.height / height * 50, y)),
  });
  if (!value.enabled) return null;
  return <div className="live-text-handle" role="button" tabIndex={0} aria-label={`Move image ${value.name}`} aria-description="Drag to position image. Use arrow keys for fine adjustment, or Shift with arrow keys for larger steps." style={{ left: `${box.x / width * 100}%`, top: `${box.y / height * 100}%`, width: `${box.width / width * 100}%`, height: `${box.height / height * 100}%` }}
    onPointerDown={(event) => {
      if (event.button !== 0) return;
      event.preventDefault(); event.currentTarget.focus();
      drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, centerX: box.x / width * 100, centerY: box.y / height * 100 };
      event.currentTarget.setPointerCapture(event.pointerId);
    }} onPointerMove={(event) => {
      const start = drag.current;
      if (!start || start.id !== event.pointerId) return;
      const bounds = event.currentTarget.parentElement!.getBoundingClientRect();
      move(start.centerX + (event.clientX - start.x) / bounds.width * 100, start.centerY + (event.clientY - start.y) / bounds.height * 100);
    }} onPointerUp={(event) => {
      drag.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    }} onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}
    onKeyDown={(event) => {
      const step = event.shiftKey ? 5 : 1;
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      move(box.x / width * 100 + (event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0), box.y / height * 100 + (event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0));
    }}><span>Drag image</span></div>;
}
