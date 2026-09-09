import { useEffect, useState } from 'react';
import { BackgroundSelection } from '../types/camera';
import { loadBackgroundPresets, saveBackgroundPreset } from '../storage/backgroundPresets';
import { Modal } from './Modal';
import { Icon } from './Icon';
import styles from './BackgroundPicker.module.css';

export const BACKGROUNDS = [
  { id: 'studio', name: 'Warm studio', src: `${import.meta.env.BASE_URL}backgrounds/studio.svg` },
  { id: 'office', name: 'Modern office', src: `${import.meta.env.BASE_URL}backgrounds/office.svg` },
  { id: 'nature', name: 'Mountain lake', src: `${import.meta.env.BASE_URL}backgrounds/nature.svg` },
];

interface Props {
  selected: BackgroundSelection;
  onSelect: (background: BackgroundSelection) => void;
  blur: number;
  tint: number;
  onBlur: (value: number) => void;
  onTint: (value: number) => void;
}

export function BackgroundPicker({ selected, onSelect, blur, tint, onBlur, onTint }: Props) {
  const [presets, setPresets] = useState(BACKGROUNDS);
  const [savedPresets, setSavedPresets] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [storing, setStoring] = useState(false);
  const [open, setOpen] = useState(false);
  const [editor, setEditor] = useState<number | 'blur' | null>(null);
  const [uploadError, setUploadError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [color, setColor] = useState('#3856d6');
  useEffect(() => {
    let cancelled = false;
    void loadBackgroundPresets().then((saved) => {
      if (cancelled) return;
      setSavedPresets(saved);
      setPresets(BACKGROUNDS.map((preset) => ({ ...preset, src: saved[preset.id] ?? preset.src })));
    }).catch(() => { if (!cancelled) setUploadError('Saved backgrounds could not be loaded.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);
  const persistPreset = async (index: number, restore = false) => {
    const preset = presets[index];
    setStoring(true);
    setUploadError('');
    try {
      await saveBackgroundPreset(preset.id, restore ? null : preset.src);
      setSavedPresets((current) => {
        const next = { ...current };
        if (restore) delete next[preset.id];
        else next[preset.id] = preset.src;
        return next;
      });
      if (restore) {
        const original = BACKGROUNDS[index];
        setPresets((current) => current.map((item, i) => i === index ? original : item));
        onSelect({ kind: 'image', value: original.src });
      }
    } catch { setUploadError('Could not save this preset on your device. Browser storage may be full or unavailable.'); }
    finally { setStoring(false); }
  };
  const locked = uploading || loading || storing;
  const editPreset = (index: number) => {
    onSelect({ kind: 'image', value: presets[index].src });
    setUploadError('');
    setEditor(index);
  };
  const upload = async (file?: File) => {
    if (!file || typeof editor !== 'number') return;
    const index = editor;
    setUploadError('');
    if (!/^image\/(png|jpeg|webp|avif)$/.test(file.type)) { setUploadError('Choose a PNG, JPG, WebP, or AVIF image.'); return; }
    if (file.size > 20 * 1024 * 1024) { setUploadError('Choose an image smaller than 20 MB.'); return; }
    setUploading(true);
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, 2048 / Math.max(image.naturalWidth, image.naturalHeight));
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Image processing unavailable');
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const src = canvas.toDataURL('image/png');
      setPresets((current) => current.map((preset, i) => i === index ? { ...preset, src } : preset));
      onSelect({ kind: 'image', value: src });
    } catch { setUploadError('This image could not be read. Please try another file.'); }
    finally { URL.revokeObjectURL(url); setUploading(false); }
  };
  const sliders = <div className="sliders">
    <label htmlFor="blur">Background blur <output aria-hidden="true">{blur}%</output></label>
    <input id="blur" type="range" min="0" max="100" value={blur} onChange={(event) => onBlur(Number(event.target.value))} />
    <label htmlFor="tint">Darken background <output aria-hidden="true">{tint}%</output></label>
    <input id="tint" type="range" min="0" max="100" value={tint} onChange={(event) => onTint(Number(event.target.value))} />
  </div>;
  return <>
    <button className="icon-button glass" aria-label="Background filters" title="Background filters" aria-haspopup="dialog" onClick={() => {
      setOpen(true);
      setUploadError('');
      const index = presets.findIndex((preset) => selected.kind === 'image' && selected.value === preset.src);
      setEditor(index >= 0 ? index : 'blur');
    }}><Icon name="image" /></button>
    {open && <Modal title="Background" onClose={() => { if (!locked) setOpen(false); }}>
      <div className={styles.modes} role="group" aria-label="Background type">
        <button disabled={locked} aria-pressed={selected.kind === 'blur'} onClick={() => { onSelect({ kind: 'blur', value: '' }); if (selected.kind !== 'blur' && blur === 0) onBlur(35); setEditor('blur'); }}><Icon name="blur" />Blur</button>
        <button disabled={locked} aria-pressed={selected.kind === 'color'} onClick={() => { onSelect({ kind: 'color', value: color }); setEditor('blur'); }}><Icon name="palette" />Color</button>
      </div>
      {selected.kind === 'color' && <label className={styles.colorRow}>Background color
          <input aria-label="Background color" type="color" value={color} onChange={(event) => { setColor(event.target.value); onSelect({ kind: 'color', value: event.target.value }); }} />
      </label>}
        <div className={styles.options}>
          {presets.map((preset, index) => <button key={preset.id} disabled={locked} onClick={() => editPreset(index)} aria-pressed={selected.kind === 'image' && selected.value === preset.src} aria-label={`${preset.name}: select and customize`}>
            <img src={preset.src} alt="" /><span>{preset.name}</span>
          </button>)}
        </div>
      {typeof editor === 'number' && <div className={styles.editActions}>
        <label className={styles.upload} title="Replace preset image"><Icon name="upload" size={20} /><input aria-label="Replace preset image" disabled={locked} type="file" accept="image/png,image/jpeg,image/webp,image/avif" onChange={(event) => { void upload(event.target.files?.[0]); event.target.value = ''; }} /></label>
        {presets[editor].src !== BACKGROUNDS[editor].src && <button className="icon-button" aria-label={savedPresets[presets[editor].id] === presets[editor].src ? 'Preset saved on this device' : 'Save preset on this device'} title={savedPresets[presets[editor].id] === presets[editor].src ? 'Saved on this device' : 'Save preset on this device'} disabled={locked || savedPresets[presets[editor].id] === presets[editor].src} onClick={() => void persistPreset(editor)}><Icon name={savedPresets[presets[editor].id] === presets[editor].src ? 'check' : 'save'} /></button>}
        <button className="icon-button" aria-label="Restore original image" title="Restore original image" disabled={locked} onClick={() => void persistPreset(editor, true)}><Icon name="reset" size={18} /></button>
      </div>}
      {sliders}
      {loading && <p role="status">Loading saved backgrounds…</p>}
      {storing && <p role="status">Saving preset…</p>}
      {uploading && <p role="status">Preparing image…</p>}
      {uploadError && <p role="alert">{uploadError}</p>}
    </Modal>}
  </>;
}
