export interface Crop { x: number; y: number; width: number; height: number }
export interface Overlay {
  id: string; kind: 'text' | 'emoji' | 'image'; text: string; x: number; y: number;
  size: number; opacity?: number; color: string; image?: HTMLImageElement; url?: string;
}
export interface AudioLayer { id: string; name: string; url: string; volume: number; start: number; duration: number }
export interface EditSettings {
  start: number; end: number; muted: boolean; noiseReduction: number; crop: Crop; overlays: Overlay[];
  frame: 'none' | 'border' | 'cinema' | 'polaroid'; frameColor: string; frameWidth: number;
}
export const defaultSettings = (): EditSettings => ({ start: 0, end: 0, muted: false, noiseReduction: 0,
  crop: { x: 0, y: 0, width: 100, height: 100 }, overlays: [], frame: 'none', frameColor: '#ffffff', frameWidth: 4 });
export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
export function cropPixels(crop: Crop, width: number, height: number) {
  const x = clamp(crop.x, 0, 99) / 100 * width;
  const y = clamp(crop.y, 0, 99) / 100 * height;
  return { x, y, width: Math.max(1, Math.min(width - x, clamp(crop.width, 1, 100) / 100 * width)),
    height: Math.max(1, Math.min(height - y, clamp(crop.height, 1, 100) / 100 * height)) };
}
export function outputSize(width: number, height: number): [number, number] {
  const scale = Math.min(1, 1920 / Math.max(width, height));
  return [Math.max(2, Math.floor(width * scale / 2) * 2), Math.max(2, Math.floor(height * scale / 2) * 2)];
}
export function audioPosition(time: number, start: number, duration: number): number | null {
  const position = time - start;
  return position >= 0 && position < duration ? position : null;
}
export function drawEditorFrame(ctx: CanvasRenderingContext2D, video: HTMLVideoElement, settings: EditSettings) {
  const crop = cropPixels(settings.crop, video.videoWidth, video.videoHeight);
  const [w, h] = outputSize(crop.width, crop.height);
  if (ctx.canvas.width !== w || ctx.canvas.height !== h) { ctx.canvas.width = w; ctx.canvas.height = h; }
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(video, crop.x, crop.y, crop.width, crop.height, 0, 0, w, h);
  for (const overlay of settings.overlays) {
    ctx.save();
    ctx.globalAlpha = clamp(overlay.opacity ?? 100, 0, 100) / 100;
    const x = overlay.x / 100 * w, y = overlay.y / 100 * h;
    if (overlay.kind === 'image' && overlay.image) {
      const width = overlay.size / 100 * w;
      const height = width * overlay.image.naturalHeight / overlay.image.naturalWidth;
      ctx.drawImage(overlay.image, x - width / 2, y - height / 2, width, height);
    } else {
      const size = overlay.size / 100 * h;
      ctx.font = `600 ${size}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = overlay.color;
      ctx.shadowColor = '#0009'; ctx.shadowBlur = 3; ctx.shadowOffsetY = 1;
      const lines = overlay.text.split('\n');
      lines.forEach((line, i) => ctx.fillText(line, x, y + (i - (lines.length - 1) / 2) * size * 1.2, w * .96));
    }
    ctx.restore();
  }
  const border = Math.min(w, h) * settings.frameWidth / 100;
  ctx.fillStyle = settings.frameColor;
  if (settings.frame === 'border' || settings.frame === 'polaroid') {
    ctx.fillRect(0, 0, w, border); ctx.fillRect(0, 0, border, h); ctx.fillRect(w - border, 0, border, h);
    const bottom = settings.frame === 'polaroid' ? border * 3 : border;
    ctx.fillRect(0, h - bottom, w, bottom);
  } else if (settings.frame === 'cinema') {
    ctx.fillRect(0, 0, w, border); ctx.fillRect(0, h - border, w, border);
  }
}
