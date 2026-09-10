export interface LiveImage {
  id: string; name: string; src: string; image: HTMLImageElement;
  x: number; y: number; size: number; opacity: number; enabled: boolean;
}
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
export function liveImageLayout(value: LiveImage, width: number, height: number) {
  const ratio = value.image.naturalHeight / Math.max(1, value.image.naturalWidth);
  const w = Math.min(width * clamp(value.size, 5, 100) / 100, height / ratio);
  const h = w * ratio;
  return { width: w, height: h, x: clamp(value.x / 100 * width, w / 2, width - w / 2), y: clamp(value.y / 100 * height, h / 2, height - h / 2) };
}
export function drawLiveImages(ctx: CanvasRenderingContext2D, images: LiveImage[] | undefined, width: number, height: number) {
  for (const value of images ?? []) {
    if (!value.enabled || value.opacity <= 0 || !value.image.naturalWidth || !value.image.naturalHeight) continue;
    const box = liveImageLayout(value, width, height);
    ctx.save();
    ctx.globalAlpha = clamp(value.opacity, 0, 100) / 100;
    ctx.drawImage(value.image, box.x - box.width / 2, box.y - box.height / 2, box.width, box.height);
    ctx.restore();
  }
}
