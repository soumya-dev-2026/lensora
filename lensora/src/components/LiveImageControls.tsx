import { EmojiPicker } from './EmojiPicker';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Icon } from './Icon';
import type { LiveImage } from '../rendering/liveImages';
import './LiveImages.css';
import { loadStickerLibrary, saveStickerLibrary, STICKER_PRESETS, type StickerPreset } from '../storage/stickerLibrary';

export function LiveImageControls({ value, onChange, canPosition, onPosition }: { value: LiveImage[]; onChange: (value: LiveImage[]) => void; canPosition: boolean; onPosition: () => void }) {
  const [stickers, setStickers] = useState<StickerPreset[]>([]);
  const [restored, setRestored] = useState(false);
  const [saveState, setSaveState] = useState('Loading saved stickers…');
  const onChangeRef = useRef(onChange); onChangeRef.current = onChange;
  const [selected, setSelected] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const urls = useRef(new Set<string>());
  const current = useRef(value); current.current = value;
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; const owned = urls.current; return () => { mounted.current = false; owned.forEach((url) => URL.revokeObjectURL(url)); owned.clear(); }; }, []);
  useEffect(() => {
    let cancelled = false;
    void loadStickerLibrary().then(async (saved) => {
      const decoded = await Promise.allSettled(saved.overlays.map(async (item) => {
        const image = new Image(); image.src = item.src; await image.decode();
        return { ...item, image };
      }));
      if (cancelled) return;
      setStickers(saved.stickers);
      if (!current.current.length) onChangeRef.current(decoded.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []));
      if (decoded.some((result) => result.status === 'rejected')) setError('Some saved images could not be restored. Add them again from your library.');
      setRestored(true);
    }).catch(() => { if (!cancelled) setSaveState('Sticker storage is unavailable. New changes cannot be remembered.'); });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (!restored) return;
    let cancelled = false;
    setSaveState('Saving…');
    void saveStickerLibrary({ stickers, overlays: value.map(({ image: _decoded, ...item }) => item) }).then(() => {
      if (!cancelled) setSaveState('Saved on this device');
    }).catch(() => { if (!cancelled) setSaveState('Could not save stickers. Browser storage may be full.'); });
    return () => { cancelled = true; };
  }, [value, stickers, restored]);
  const image = value.find((item) => item.id === selected) ?? value[value.length - 1];
  const update = (patch: Partial<LiveImage>) => onChange(value.map((item) => item.id === image?.id ? { ...item, ...patch } : item));
  const addImage = async (src: string, name: string, size = 30, remember = false) => {
    setError(''); setLoading(true);
    try {
      const decoded = new Image(); decoded.src = src; await decoded.decode();
      if (!mounted.current) return;
      if (!decoded.naturalWidth || !decoded.naturalHeight) throw new Error('Invalid image');
      if (remember) {
        const canvas = document.createElement('canvas');
        const scale = Math.min(1, 1536 / Math.max(decoded.naturalWidth, decoded.naturalHeight));
        canvas.width = Math.max(1, Math.round(decoded.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(decoded.naturalHeight * scale));
        const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Canvas unavailable');
        ctx.drawImage(decoded, 0, 0, canvas.width, canvas.height);
        const original = src; src = canvas.toDataURL('image/png');
        if (urls.current.delete(original)) URL.revokeObjectURL(original);
        setStickers((items) => [...items, { id: crypto.randomUUID(), name, src }]);
      }
      const item: LiveImage = { id: crypto.randomUUID(), name, src, image: decoded, x: 50, y: 50, size, opacity: 100, enabled: true };
      onChange([...current.current, item]); setSelected(item.id);
    } catch { if (urls.current.delete(src)) URL.revokeObjectURL(src); if (mounted.current) setError('Could not open this image. Try PNG, JPG, or WebP.'); }
    finally { if (mounted.current) setLoading(false); }
  };
  const upload = (file?: File) => {
    if (!file) return;
    const src = URL.createObjectURL(file); urls.current.add(src);
    return addImage(src, file.name, 30, true);
  };
  const addEmoji = (emoji: string, name: string) => {
    try {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas unavailable');
      ctx.font = '192px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(emoji, 128, 140);
      void addImage(canvas.toDataURL('image/png'), `${emoji} ${name}`, 18);
    } catch { setError('Could not add this emoji. Please try again.'); }
  };
  return <div className="live-image-controls">
    <input ref={input} type="file" className="sr-only" tabIndex={-1} aria-label="Upload overlay image" accept="image/png,image/jpeg,image/webp,image/avif" disabled={loading || !restored} onChange={(event) => { void upload(event.target.files?.[0]); event.target.value = ''; }} />
    <button type="button" className="primary" disabled={loading || !restored} onClick={() => input.current?.click()}><Icon name="image" size={18} />{loading ? 'Adding sticker…' : 'Upload sticker'}</button>
    <p className="live-text-hint" role="status">{saveState}</p>
    <div className="sticker-library" role="group" aria-label="Sticker presets">{[...STICKER_PRESETS, ...stickers].map((sticker) => <div className="sticker-preset" key={sticker.id}><button type="button" title={`Add ${sticker.name}`} aria-label={`Add ${sticker.name} sticker`} disabled={loading || !restored} onClick={() => void addImage(sticker.src, sticker.name)}><img src={sticker.src} alt="" /><span>{sticker.name}</span></button>{stickers.some((item) => item.id === sticker.id) && <button type="button" className="sticker-delete" title="Delete from library" aria-label={`Delete ${sticker.name} from library`} onClick={() => setStickers((items) => items.filter((item) => item.id !== sticker.id))}><Icon name="close" size={12} /></button>}</div>)}</div>
    <EmojiPicker disabled={loading || !restored} onSelect={addEmoji} />
    {error && <p role="alert">{error}</p>}
    {!image && <p className="live-text-hint">Add a photo, logo, or emoji to your video.</p>}
    {value.length > 0 && <div className="live-image-list" role="group" aria-label="Image overlays">{value.map((item) => <button key={item.id} type="button" aria-pressed={item.id === image?.id} onClick={() => setSelected(item.id)}><img src={item.src} alt="" /><span>{item.name}</span></button>)}</div>}
    {image && <>
      <label className="filter-toggle"><input type="checkbox" role="switch" checked={image.enabled} onChange={(event) => update({ enabled: event.target.checked })} />Show image on video</label>
      {([{ label: 'Image opacity', key: 'opacity', min: 0 }, { label: 'Image size', key: 'size', min: 5 }, { label: 'Horizontal position', key: 'x', min: 0 }, { label: 'Vertical position', key: 'y', min: 0 }] as const).map(({ label, key, min }) => <label className="live-image-slider" key={key}><span>{label}<output>{Math.round(image[key])}%</output></span><input type="range" aria-label={label} min={min} max={100} value={image[key]} style={{ '--fill': `${(image[key] - min) / (100 - min) * 100}%` } as CSSProperties} onChange={(event) => update({ [key]: Number(event.target.value) })} /></label>)}
      <p className="live-text-hint">Images appear in your recording. Close this panel to drag them on the video.</p>
      <button type="button" disabled={!canPosition} onClick={() => { update({ enabled: true }); onPosition(); }}>{canPosition ? 'Position on video' : 'Start camera to position image'}</button>
      <div className="live-image-actions"><button type="button" onClick={() => update({ x: 50, y: 50 })}>Center</button><button type="button" onClick={() => { onChange(value.filter((item) => item.id !== image.id)); if (urls.current.delete(image.src)) URL.revokeObjectURL(image.src); }}>Remove image</button></div>
    </>}
  </div>;
}
