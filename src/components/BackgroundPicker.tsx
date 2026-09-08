import { useState } from 'react';
import { BackgroundSelection } from '../types/camera';
import { Modal } from './Modal';
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
  const [editor, setEditor] = useState<number | 'blur' | null>(null);
  const [uploadError, setUploadError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [color, setColor] = useState('#3856d6');
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
    <label htmlFor="blur">Background blur <output>{blur}%</output></label>
    <input id="blur" type="range" min="0" max="100" value={blur} onChange={(event) => onBlur(Number(event.target.value))} />
    <label htmlFor="tint">Black tint opacity <output>{tint}%</output></label>
    <input id="tint" type="range" min="0" max="100" value={tint} onChange={(event) => onTint(Number(event.target.value))} />
  </div>;
  return <>
    <details className={styles.dropdown}>
      <summary>✦ Background filters <span>⌄</span></summary>
      <div className={styles.panel}>
        <p className={styles.caption}>MAKE IT YOUR SPACE</p>
        <button className={styles.effect} aria-pressed={selected.kind === 'blur'} onClick={() => { onSelect({ kind: 'blur', value: '' }); if (selected.kind !== 'blur' && blur === 0) onBlur(35); setEditor('blur'); }}>◉ Blur & tint <span>Adjust →</span></button>
        <div className={styles.colorRow}>
          <button aria-pressed={selected.kind === 'color'} onClick={() => onSelect({ kind: 'color', value: color })}>Solid color</button>
          <input aria-label="Background color" type="color" value={color} onChange={(event) => { setColor(event.target.value); onSelect({ kind: 'color', value: event.target.value }); }} />
        </div>
        <div className={styles.options}>
          {presets.map((preset, index) => <button key={preset.id} onClick={() => editPreset(index)} aria-pressed={selected.kind === 'image' && selected.value === preset.src} aria-label={`${preset.name}: select and customize`}>
            <img src={preset.src} alt="" /><span>{preset.name}</span><small>Edit image ↗</small>
          </button>)}
        </div>
        <button className={styles.effect} onClick={() => setEditor('blur')}>Adjust current background <span>→</span></button>
      </div>
    </details>
    {editor !== null && <Modal title={typeof editor === 'number' ? presets[editor].name : 'Background blur & tint'} onClose={() => { if (!uploading) setEditor(null); }}>
      {typeof editor === 'number' && <>
        <img className="preset-preview" src={presets[editor].src} alt="Selected background" />
        <label className="upload-label">Replace this preset<input disabled={uploading} type="file" accept="image/png,image/jpeg,image/webp,image/avif" onChange={(event) => { void upload(event.target.files?.[0]); event.target.value = ''; }} /></label>
        <button disabled={uploading} onClick={() => {
          const preset = BACKGROUNDS[editor];
          setPresets((current) => current.map((item, i) => i === editor ? preset : item));
          onSelect({ kind: 'image', value: preset.src });
        }}>Restore original image</button>
        <p className="muted">PNG, JPG, WebP or AVIF · Up to 20 MB · Kept for this session</p>
      </>}
      {sliders}
      {uploading && <p role="status">Preparing image…</p>}
      {uploadError && <p role="alert">{uploadError}</p>}
      <button className="primary" disabled={uploading} onClick={() => setEditor(null)}>Done</button>
    </Modal>}
  </>;
}
