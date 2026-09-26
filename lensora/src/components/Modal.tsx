import { ReactNode, useEffect, useId, useRef } from 'react';
import { Icon, IconName } from './Icon';

export function Modal({ title, subtitle, children, onClose, icon, variant = 'sidebar', open = true }: { title: string; subtitle?: string; children: ReactNode; onClose: () => void; icon?: IconName; variant?: 'sidebar' | 'dialog'; open?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current!;
    if (!open) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.showModal();
    return () => {
      dialog.close();
      if (opener?.isConnected) opener.focus();
    };
  }, [open]);
  return <dialog ref={ref} className={`modal${variant === 'sidebar' ? ' sidebar' : ''}`} aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); event.stopPropagation(); onClose(); }} onClick={(event) => {
    if (event.target !== event.currentTarget) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
  }}>
    <div className="modal-heading"><div className="modal-title"><h2 id={titleId}>{icon && <Icon name={icon} size={21} />}{title}</h2>{subtitle && <p>{subtitle}</p>}</div><div className="modal-heading-actions"><button className="icon-button" aria-label="Close dialog" title="Close" onClick={onClose}><Icon name="close" /></button></div></div>
    {variant === 'sidebar' ? <div className="sidebar-content">{children}</div> : children}
  </dialog>;
}
