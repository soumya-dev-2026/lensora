import { useState } from 'react';
import { BackgroundSelection } from '../types/camera';
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
  const [open, setOpen] = useState(false);
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
    {open && <Modal title="Background" onClose={() => { if (!uploading) setOpen(false); }}>
      <div className={styles.modes} role="group" aria-label="Background type">
        <button disabled={uploading} aria-pressed={selected.kind === 'blur'} onClick={() => { onSelect({ kind: 'blur', value: '' }); if (selected.kind !== 'blur' && blur === 0) onBlur(35); setEditor('blur'); }}><Icon name="blur" />Blur</button>
        <button disabled={uploading} aria-pressed={selected.kind === 'color'} onClick={() => { onSelect({ kind: 'color', value: color }); setEditor('blur'); }}><Icon name="palette" />Color</button>
      </div>
      {selected.kind === 'color' && <label className={styles.colorRow}>Background color
          <input aria-label="Background color" type="color" value={color} onChange={(event) => { setColor(event.target.value); onSelect({ kind: 'color', value: event.target.value }); }} />
      </label>}
        <div className={styles.options}>
          {presets.map((preset, index) => <button key={preset.id} disabled={uploading} onClick={() => editPreset(index)} aria-pressed={selected.kind === 'image' && selected.value === preset.src} aria-label={`${preset.name}: select and customize`}>
            <img src={preset.src} alt="" /><span>{preset.name}</span>
          </button>)}
        </div>
      {typeof editor === 'number' && <div className={styles.editActions}>
        <label className={styles.upload}><Icon name="upload" size={17} /><span>Replace image</span><input aria-label="Replace preset image" disabled={uploading} type="file" accept="image/png,image/jpeg,image/webp,image/avif" onChange={(event) => { void upload(event.target.files?.[0]); event.target.value = ''; }} /></label>
        <button className="icon-button" aria-label="Restore original image" title="Restore original image" disabled={uploading} onClick={() => {
          const preset = BACKGROUNDS[editor];
          setPresets((current) => current.map((item, i) => i === editor ? preset : item));
          onSelect({ kind: 'image', value: preset.src });
        }}><Icon name="reset" size={18} /></button>
      </div>}
      {sliders}
      {uploading && <p role="status">Preparing image…</p>}
      {uploadError && <p role="alert">{uploadError}</p>}
    </Modal>}
  </>;
}
