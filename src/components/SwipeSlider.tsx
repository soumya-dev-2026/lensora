import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Icon } from './Icon';
import './SwipeSlider.css';

/** Native touch scrolling, with mouse dragging and keyboard/arrow navigation. */
export function SwipeSlider({ label, className = '', selectedKey, children }: {
  label: string; className?: string; selectedKey?: string | number; children: ReactNode;
}) {
  const id = useId();
  const track = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; x: number; y: number; left: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const [edges, setEdges] = useState({ start: true, end: true });
  const measure = () => {
    const el = track.current;
    if (el) setEdges({ start: el.scrollLeft <= 2, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 2 });
  };
  const behavior = (): ScrollBehavior => document.documentElement.dataset.motion === 'off' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
  const reveal = (item: HTMLElement) => {
    const el = track.current;
    if (!el) return;
    const bounds = el.getBoundingClientRect(), child = item.getBoundingClientRect();
    const delta = child.left < bounds.left + 6 ? child.left - bounds.left - 6 : child.right > bounds.right - 6 ? child.right - bounds.right + 6 : 0;
    if (delta) el.scrollBy({ left: delta, behavior: behavior() });
  };
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    measure();
    let width = el.clientWidth;
    const observer = new ResizeObserver(() => {
      measure();
      if (el.clientWidth !== width) {
        width = el.clientWidth;
        const selected = selectedKey === undefined ? null : el.querySelector<HTMLElement>('[aria-pressed="true"]');
        if (selected) reveal(selected);
      }
    });
    observer.observe(el);
    Array.from(el.children).forEach((child) => observer.observe(child));
    return () => observer.disconnect();
  }, [children, selectedKey]);
  useEffect(() => {
    if (selectedKey === undefined) return;
    const selected = track.current?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (selected) reveal(selected);
  }, [selectedKey]);
  const finish = () => {
    const state = drag.current;
    if (state && track.current?.hasPointerCapture(state.id)) track.current.releasePointerCapture(state.id);
    drag.current = null;
    track.current?.removeAttribute('data-dragging');
    if (state?.moved && track.current) {
      const el = track.current;
      const nearest = Array.from(el.children).reduce<HTMLElement | null>((best, child) => {
        const item = child as HTMLElement;
        return !best || Math.abs(item.offsetLeft - el.scrollLeft - 6) < Math.abs(best.offsetLeft - el.scrollLeft - 6) ? item : best;
      }, null);
      if (nearest) el.scrollTo({ left: nearest.offsetLeft - 6, behavior: behavior() });
    }
  };
  const overflow = !edges.start || !edges.end;
  return <div className="swipe-slider" role="group" aria-label={label}>
    <div id={id} ref={track} className={`swipe-slider-track ${className}`} onScroll={measure}
      onDragStart={(event) => event.preventDefault()}
      onFocusCapture={(event) => reveal(event.target)}
      onKeyDown={(event) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
        const index = items.indexOf(event.target as HTMLButtonElement);
        if (index < 0) return;
        event.preventDefault();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : Math.max(0, Math.min(items.length - 1, index + (event.key === 'ArrowRight' ? 1 : -1)));
        items[next]?.focus({ preventScroll: true });
      }}
      onPointerDown={(event) => {
        suppressClick.current = false;
        if (event.pointerType !== 'mouse' || event.button !== 0) return;
        drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, left: event.currentTarget.scrollLeft, moved: false };
      }}
      onPointerMove={(event) => {
        const state = drag.current;
        if (!state || state.id !== event.pointerId) return;
        const dx = event.clientX - state.x;
        if (!state.moved && Math.abs(dx) > 6 && Math.abs(dx) > Math.abs(event.clientY - state.y)) {
          state.moved = true; suppressClick.current = true;
          event.currentTarget.setPointerCapture(event.pointerId);
          event.currentTarget.dataset.dragging = 'true';
        }
        if (state.moved) { event.preventDefault(); event.currentTarget.scrollLeft = state.left - dx; }
      }}
      onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={() => { drag.current = null; track.current?.removeAttribute('data-dragging'); }}
      onPointerLeave={() => { if (!drag.current?.moved) drag.current = null; }}
      onClickCapture={(event) => { if (suppressClick.current && event.detail !== 0) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false; } }}>
      {children}
    </div>
    {overflow && <>
      <button type="button" className="swipe-slider-arrow swipe-slider-prev" aria-label={`Previous ${label}`} aria-controls={id} disabled={edges.start} onClick={() => track.current?.scrollBy({ left: -track.current.clientWidth * .75, behavior: behavior() })}><Icon name="back" size={16} /></button>
      <button type="button" className="swipe-slider-arrow swipe-slider-next" aria-label={`Next ${label}`} aria-controls={id} disabled={edges.end} onClick={() => track.current?.scrollBy({ left: track.current.clientWidth * .75, behavior: behavior() })}><Icon name="back" size={16} /></button>
      <span className="swipe-slider-hint">Swipe to explore</span>
    </>}
  </div>;
}
