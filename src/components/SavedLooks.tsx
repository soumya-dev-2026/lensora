import { useEffect, useState } from 'react';
import { Icon } from './Icon';
import { deleteStudioLook, loadStudioLooks, saveStudioLook, type StudioLook, type StudioLookSettings } from '../storage/studioLooks';

export function SavedLooks({ settings, onApply, busy }: { settings: StudioLookSettings; onApply: (look: StudioLookSettings) => void; busy: boolean }) {
  const [looks, setLooks] = useState<StudioLook[]>([]);
  const [name, setName] = useState('');
  const [selected, setSelected] = useState('');
  const [pending, setPending] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    void loadStudioLooks().then((saved) => { if (!cancelled) setLooks(saved); })
      .catch(() => { if (!cancelled) setError('Saved looks could not be loaded. Check browser storage access.'); })
      .finally(() => { if (!cancelled) setPending(false); });
    return () => { cancelled = true; };
  }, []);
  const save = async () => {
    if (pending || busy || !name.trim()) return;
    if (looks.some((look) => look.name.toLowerCase() === name.trim().toLowerCase())) { setError('A look with this name exists. Choose a different name.'); return; }
    setPending(true); setError(''); setMessage('');
    try {
      const look = await saveStudioLook(name, settings);
      setLooks((current) => [look, ...current]); setSelected(look.id); setName(''); setMessage(`Saved “${look.name}” on this device.`);
    } catch { setError('Could not save this look. Browser storage may be full or unavailable.'); }
    finally { setPending(false); }
  };
  const remove = async () => {
    if (pending || !selected) return;
    setPending(true); setError(''); setMessage('');
    try { await deleteStudioLook(selected); setLooks((current) => current.filter((look) => look.id !== selected)); setSelected(''); setMessage('Look deleted. Current settings are unchanged.'); }
    catch { setError('Could not delete the saved look. Please try again.'); }
    finally { setPending(false); }
  };
  return <details className="studio-utility-panel saved-looks-panel" open>
    <summary><span className="utility-heading-icon"><Icon name="bookmark" size={23} /></span><span className="utility-heading-copy"><strong>Saved looks</strong><small>Save your background, filters, effects, and orientation together on this device.</small></span></summary>
    <div className="utility-panel-body">
    <label className="utility-field">Look name<span className="look-name-input"><Icon name="edit" size={19} /><input value={name} maxLength={60} placeholder="e.g. Warm interview" onChange={(event) => setName(event.target.value)} /></span></label>
    <button type="button" className="primary save-look-button" disabled={pending || busy || !name.trim()} onClick={() => void save()}><Icon name="bookmark" size={19} />Save current look</button>
    {looks.length > 0 && <>
      <label className="utility-field">Saved looks<span className="glass-select"><select value={selected} disabled={pending} onChange={(event) => setSelected(event.target.value)}><option value="">Choose a look</option>{looks.map((look) => <option key={look.id} value={look.id}>{look.name}</option>)}</select></span></label>
      <div className="utility-actions"><button type="button" disabled={pending || busy || !selected} onClick={() => { const look = looks.find((item) => item.id === selected); if (look) { onApply(look); setMessage(`Applied “${look.name}”.`); } }}>Apply look</button><button type="button" disabled={pending || !selected} onClick={() => void remove()}>Delete look</button></div>
    </>}
    {pending && <p role="status">Updating saved looks…</p>}
    {message && <p role="status">{message}</p>}
    {error && <p role="alert">{error}</p>}
    </div>
  </details>;
}
