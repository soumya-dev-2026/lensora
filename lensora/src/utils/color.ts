export interface HSV { h: number; s: number; v: number }
export const clampColor = (n: number, min = 0, max = 100) => Math.max(min, Math.min(max, n));
export function hexToHsv(hex: string): HSV {
  const safe = /^#[\da-f]{6}$/i.test(hex) ? hex : '#ffffff';
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(safe.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
  let h = 0;
  if (delta) h = max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  return { h: (h * 60 + 360) % 360, s: max ? delta / max * 100 : 0, v: max * 100 };
}
export function hsvToHex({ h, s, v }: HSV): string {
  const hue = ((h % 360) + 360) % 360 / 60, saturation = clampColor(s) / 100, brightness = clampColor(v) / 100;
  const c = brightness * saturation, x = c * (1 - Math.abs(hue % 2 - 1)), m = brightness - c;
  const rgb = hue < 1 ? [c, x, 0] : hue < 2 ? [x, c, 0] : hue < 3 ? [0, c, x] : hue < 4 ? [0, x, c] : hue < 5 ? [x, 0, c] : [c, 0, x];
  return '#' + rgb.map((n) => Math.round((n + m) * 255).toString(16).padStart(2, '0')).join('');
}
export function wheelColor(x: number, y: number, radius: number, value: HSV): HSV {
  return { h: Math.hypot(x, y) < 1 ? value.h : (Math.atan2(-y, x) * 180 / Math.PI + 360) % 360, s: clampColor(Math.hypot(x, y) / Math.max(1, radius) * 100), v: value.v };
}
