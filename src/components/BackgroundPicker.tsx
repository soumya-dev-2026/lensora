import { ChangeEvent, useRef } from 'react';
import { BackgroundSelection } from '../types/camera';
import styles from './BackgroundPicker.module.css';

export const BACKGROUNDS = [
  { id: 'studio', name: 'Warm studio', src: '/backgrounds/studio.svg' },
  { id: 'office', name: 'Modern office', src: '/backgrounds/office.svg' },
  { id: 'nature', name: 'Mountain lake', src: '/backgrounds/nature.svg' },
];

interface Props {
  selected: BackgroundSelection;
  onSelect: (background: BackgroundSelection) => void;
}

export function BackgroundPicker({ selected, onSelect }: Props) {
  const uploadRef = useRef<HTMLInputElement>(null);
  const handleUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    onSelect({ kind: 'image', value: URL.createObjectURL(file) });
    event.target.value = '';
  };

  return (
    <section className={styles.panel} aria-label="Choose a background">
      <div>
        <h2>Choose a scene</h2>
        <p>AI keeps you in focus while WebGL replaces the room behind you.</p>
      </div>
      <div className={styles.options}>
        <label className={`${styles.colorOption} ${selected.kind === 'color' ? styles.selected : ''}`}>
          <input
            type="color"
            value={selected.kind === 'color' ? selected.value : '#3856d6'}
            onInput={(event) => onSelect({ kind: 'color', value: event.currentTarget.value })}
            onChange={(event) => onSelect({ kind: 'color', value: event.currentTarget.value })}
          />
          <span>Solid color</span>
        </label>
        {BACKGROUNDS.map((background) => (
          <button
            key={background.id}
            className={selected.kind === 'image' && selected.value === background.src ? styles.selected : ''}
            onClick={() => onSelect({ kind: 'image', value: background.src })}
            aria-pressed={selected.kind === 'image' && selected.value === background.src}
          >
            <img src={background.src} alt="" />
            <span>{background.name}</span>
          </button>
        ))}
        <button className={styles.upload} onClick={() => uploadRef.current?.click()}>
          <span className={styles.uploadIcon}>＋</span>
          <span>Upload image</span>
        </button>
        <input
          ref={uploadRef}
          className={styles.fileInput}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/avif"
          onChange={handleUpload}
        />
      </div>
    </section>
  );
}
