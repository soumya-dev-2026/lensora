/** Cache only pinned public model assets; camera frames never enter this cache. */
export async function loadModel(url: string): Promise<Uint8Array> {
  let cache: Cache | undefined;
  try {
    cache = await caches.open('lensora-models-v1');
    const cached = await cache.match(url);
    if (cached) return new Uint8Array(await cached.arrayBuffer());
  } catch { /* Private browsing and storage quotas must not disable effects. */ }
  const response = await fetch(url, { cache: 'force-cache' });
  if (!response.ok) throw new Error(`Could not download camera model (${response.status}). Check your connection and retry.`);
  if (cache) {
    try { await cache.put(url, response.clone()); } catch { /* HTTP cache remains available. */ }
  }
  return new Uint8Array(await response.arrayBuffer());
}
