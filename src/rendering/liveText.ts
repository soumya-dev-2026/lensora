export const TEXT_FONTS = [
  { id: 'sans', name: 'Modern', family: 'Arial, sans-serif', weight: 600, style: 'normal' },
  { id: 'serif', name: 'Classic', family: 'Georgia, serif', weight: 400, style: 'normal' },
  { id: 'mono', name: 'Typewriter', family: 'Courier New, monospace', weight: 400, style: 'normal' },
  { id: 'bold', name: 'Headline', family: 'Arial Black, Arial, sans-serif', weight: 900, style: 'normal' },
  { id: 'italic', name: 'Editorial', family: 'Georgia, serif', weight: 400, style: 'italic' },
  { id: 'rounded', name: 'Playful', family: 'Trebuchet MS, sans-serif', weight: 700, style: 'normal' },
] as const;
export interface LiveText {
  enabled: boolean;
  text: string;
  font: typeof TEXT_FONTS[number]['id'];
  size: number;
  color: string;
  opacity: number;
  align: 'left' | 'center' | 'right';
  x: number;
  y: number;
}
export const DEFAULT_LIVE_TEXT: LiveText = { enabled: false, text: 'Your text', font: 'sans', size: 48, color: '#ffffff', opacity: 100, align: 'center', x: 50, y: 75 };
export const textFont = (value: LiveText) => TEXT_FONTS.find((font) => font.id === value.font) ?? TEXT_FONTS[0];
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function liveTextLayout(ctx: CanvasRenderingContext2D, value: LiveText, width: number, height: number) {
  const font = textFont(value);
  let size = value.size * Math.min(width, height) / 720;
  const padding = Math.min(width, height) / 120;
  let lines: string[] = [];
  // Fit long captions to the canvas, including words without spaces.
  const wrap = () => {
    ctx.font = `${font.style} ${font.weight} ${size}px ${font.family}`;
    lines = [];
    for (const paragraph of value.text.slice(0, 240).split('\n')) {
      let line = '';
      for (const char of Array.from(paragraph)) {
        if (line && ctx.measureText(line + char).width > width * .9 - padding * 2) {
          const space = line.lastIndexOf(' ');
          if (space > 0) { lines.push(line.slice(0, space)); line = line.slice(space + 1) + char; }
          else { lines.push(line); line = char; }
        } else line += char;
      }
      lines.push(line);
    }
  };
  wrap();
  while (lines.length * size * 1.2 + padding * 2 > height * .9 && size > 1) { size *= .9; wrap(); }
  const boxWidth = Math.min(width, Math.max(...lines.map((line) => ctx.measureText(line).width), 1) + padding * 2);
  const boxHeight = Math.min(height, lines.length * size * 1.2 + padding * 2);
  const x = clamp(value.x / 100 * width, boxWidth / 2, width - boxWidth / 2);
  const y = clamp(value.y / 100 * height, boxHeight / 2, height - boxHeight / 2);
  return { lines, size, padding, width: boxWidth, height: boxHeight, x, y, font: ctx.font };
}

const layoutCache = new WeakMap<CanvasRenderingContext2D, { value: LiveText; width: number; height: number; box: ReturnType<typeof liveTextLayout> }>();

export function drawLiveText(ctx: CanvasRenderingContext2D, value: LiveText | undefined, width: number, height: number) {
  if (!value?.enabled || !value.text.trim() || value.opacity <= 0) return;
  ctx.save();
  const cached = layoutCache.get(ctx);
  const box = cached?.value === value && cached.width === width && cached.height === height
    ? cached.box : liveTextLayout(ctx, value, width, height);
  layoutCache.set(ctx, { value, width, height, box });
  ctx.font = box.font;
  ctx.globalAlpha = clamp(value.opacity / 100, 0, 1);
  ctx.fillStyle = value.color;
  ctx.textAlign = value.align ?? 'center';
  const textX = ctx.textAlign === 'left' ? box.x - box.width / 2 + box.padding
    : ctx.textAlign === 'right' ? box.x + box.width / 2 - box.padding : box.x;
  ctx.textBaseline = 'middle';
  ctx.shadowColor = '#00000099';
  ctx.shadowBlur = box.size / 12;
  box.lines.forEach((line, index) => ctx.fillText(line, textX, box.y + (index - (box.lines.length - 1) / 2) * box.size * 1.2));
  ctx.restore();
}
