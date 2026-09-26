import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

// WebView does not handle blob download links. Share a native cached file instead.
export function installNativeDownloads() {
  if (!Capacitor.isNativePlatform()) return;
  let busy = false;
  document.addEventListener('click', (event) => {
    const link = event.target instanceof Element ? event.target.closest('a[download]') : null;
    if (!(link instanceof HTMLAnchorElement) || !link.href.startsWith('blob:')) return;
    event.preventDefault();
    if (busy) return;
    busy = true;
    const url = link.href;
    const name = link.download.replace(/[^a-zA-Z0-9._-]/g, '_') || 'video.mp4';
    void (async () => {
      const blob = await (await fetch(url)).blob();
      const path = `exports/${Date.now()}/${name}`;
      const chunkSize = 1024 * 1024;
      for (let offset = 0; offset < blob.size; offset += chunkSize) {
        const data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).split(',')[1]);
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(blob.slice(offset, offset + chunkSize));
        });
        if (offset === 0) await Filesystem.writeFile({ path, data, directory: Directory.Cache, recursive: true });
        else await Filesystem.appendFile({ path, data, directory: Directory.Cache });
      }
      const { uri } = await Filesystem.getUri({ path, directory: Directory.Cache });
      await Share.share({ title: name, files: [uri], dialogTitle: 'Save or share video' });
    })().catch((error) => {
      if (!/cancel/i.test(String(error))) window.alert(`Could not share video: ${String(error)}`);
    }).finally(() => { busy = false; });
  }, true);
}
