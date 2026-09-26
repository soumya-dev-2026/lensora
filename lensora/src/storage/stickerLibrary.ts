export interface StickerPreset { id: string; name: string; src: string }
export interface SavedStickerOverlay extends StickerPreset { x: number; y: number; size: number; opacity: number; enabled: boolean }
export interface StickerLibrary { stickers: StickerPreset[]; overlays: SavedStickerOverlay[] }
export const STICKER_PRESETS: StickerPreset[] = [
  { id: 'live', name: 'Live', src: '/stickers/live.svg' },
  { id: 'wow', name: 'Wow', src: '/stickers/wow.svg' },
  { id: 'love', name: 'Love', src: '/stickers/love.svg' },
  { id: 'subscribe', name: 'Subscribe', src: '/stickers/subscribe.svg' },
];
const openDatabase = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
  const request = indexedDB.open('studio-sticker-library', 1);
  request.onupgradeneeded = () => request.result.createObjectStore('library');
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});
const validPreset = (item: unknown): item is StickerPreset => {
  if (!item || typeof item !== 'object') return false;
  const value = item as StickerPreset;
  return typeof value.id === 'string' && typeof value.name === 'string' && typeof value.src === 'string' &&
    (value.src.startsWith('data:image/png;base64,') || STICKER_PRESETS.some((preset) => preset.src === value.src));
};
export async function loadStickerLibrary(): Promise<StickerLibrary> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('library', 'readonly');
    const request = tx.objectStore('library').get('current');
    tx.oncomplete = () => {
      db.close(); const saved = request.result;
      resolve({ stickers: Array.isArray(saved?.stickers) ? saved.stickers.filter(validPreset) : [],
        overlays: Array.isArray(saved?.overlays) ? saved.overlays.filter((item: SavedStickerOverlay) => validPreset(item) && typeof item.enabled === 'boolean' && ['x', 'y', 'size', 'opacity'].every((key) => { const n = item[key as 'x']; return Number.isFinite(n) && n >= 0 && n <= 100; })) : [] });
    };
    tx.onabort = () => { db.close(); reject(tx.error); };
  });
}
let writes: Promise<void> = Promise.resolve();
export function saveStickerLibrary(value: StickerLibrary): Promise<void> {
  const write = writes.catch(() => {}).then(async () => {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('library', 'readwrite');
      tx.objectStore('library').put(value, 'current');
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onabort = () => { db.close(); reject(tx.error); };
    });
  });
  writes = write; return write;
}
