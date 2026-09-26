import type { BackgroundSelection, CanvasLayout } from '../types/camera';
import { DEFAULT_FILTERS, type CameraFilters } from '../types/filters';
import { DEFAULT_EFFECTS, type CameraEffects } from '../types/effects';

export interface StudioLookSettings {
  background: BackgroundSelection;
  blur: number;
  tint: number;
  filters: CameraFilters;
  effects: CameraEffects;
  layout: CanvasLayout;
}
export interface StudioLook extends StudioLookSettings { id: string; name: string; savedAt: number; version: 1 }
const STORE = 'looks';
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object';
const range = (value: unknown, min: number, max: number) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
export function isStudioLook(value: unknown): value is StudioLook {
  if (!object(value) || value.version !== 1 || typeof value.id !== 'string' || !value.id || typeof value.name !== 'string' || !value.name.trim() || value.name.length > 60 || !range(value.savedAt, 0, Number.MAX_SAFE_INTEGER)) return false;
  if (!['portrait', 'landscape', 'square'].includes(String(value.layout)) || !range(value.blur, 0, 100) || !range(value.tint, 0, 100)) return false;
  const bg = value.background;
  if (!object(bg) || typeof bg.value !== 'string') return false;
  if (bg.kind === 'color') { if (!/^#[\da-f]{6}$/i.test(bg.value)) return false; }
  else if (bg.kind === 'image') {
    if (!bg.value || !(/^(data:image\/(png|jpeg|webp);base64,|https?:\/\/|\/|\.\/|backgrounds\/)/i.test(bg.value))) return false;
  } else if (bg.kind !== 'blur') return false;
  const filters = value.filters, effects = value.effects;
  if (!object(filters) || !object(effects)) return false;
  if (!Object.entries(DEFAULT_FILTERS).every(([key, initial]) => key === 'look' ? ['none', 'natural', 'cinematic', 'warm', 'cool', 'vintage'].includes(String(filters[key])) : typeof initial === 'boolean' ? typeof filters[key] === 'boolean' : range(filters[key], ['brightness', 'whiteBalance', 'saturation', 'contrast'].includes(key) ? -100 : 0, 100))) return false;
  const options: Record<string, string[]> = { sticker: ['none', 'crown', 'heart', 'star'], frame: ['none', 'neon', 'film', 'white'], background: ['none', 'bubbles', 'rain'] };
  return Object.entries(DEFAULT_EFFECTS).every(([key, initial]) => key === 'outlineColor' ? typeof effects[key] === 'string' && /^#[\da-f]{6}$/i.test(effects[key]) : key === 'outlineWidth' ? range(effects[key], 1, 12) : typeof initial === 'boolean' ? typeof effects[key] === 'boolean' : typeof initial === 'number' ? range(effects[key], 0, 100) : options[key].includes(String(effects[key])));
}
export function restoreStudioLook(value: unknown): StudioLook | null {
  if (!object(value) || !object(value.filters) || !object(value.effects)) return null;
  const migrated = { ...value,
    filters: { look: 'none', lookIntensity: 100, sharpen: 0, darkCircles: 0, superBeauty: 0, ...value.filters },
    effects: { vignette: 0, outline: 0, outlineWidth: 4, outlineColor: '#78f5e3', ...value.effects },
  };
  return isStudioLook(migrated) ? migrated : null;
}
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('studio-saved-looks', 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function loadStudioLooks(): Promise<StudioLook[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const request = tx.objectStore(STORE).getAll();
    tx.oncomplete = () => { db.close(); resolve(request.result.map(restoreStudioLook).filter((look): look is StudioLook => look !== null).sort((a, b) => b.savedAt - a.savedAt)); };
    tx.onabort = () => { db.close(); reject(tx.error); };
  });
}
export async function saveStudioLook(name: string, settings: StudioLookSettings): Promise<StudioLook> {
  const look: StudioLook = { ...settings, name: name.trim(), id: crypto.randomUUID(), savedAt: Date.now(), version: 1 };
  if (!isStudioLook(look)) throw new Error('Enter a name of up to 60 characters and valid settings.');
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(look);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onabort = () => { db.close(); reject(tx.error); };
  });
  return look;
}
export async function deleteStudioLook(id: string): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onabort = () => { db.close(); reject(tx.error); };
  });
}
