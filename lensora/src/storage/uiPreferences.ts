export function readPreference(key: string, fallback = true): boolean {
  try { const value = localStorage.getItem(`studio-${key}`); return value === null ? fallback : value !== 'off'; }
  catch { return fallback; }
}
export function writePreference(key: string, enabled: boolean): void {
  try { localStorage.setItem(`studio-${key}`, enabled ? 'on' : 'off'); } catch { /* Session controls still work if storage is unavailable. */ }
}
