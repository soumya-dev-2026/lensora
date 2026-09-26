export interface CameraEffects {
  enabled: boolean;
  vignette: number;
  outline: number;
  outlineWidth: number;
  outlineColor: string;
  wavyBorder: boolean;
  sticker: 'none' | 'crown' | 'heart' | 'star';
  frame: 'none' | 'neon' | 'film' | 'white';
  background: 'none' | 'bubbles' | 'rain';
  spotlight: number;
  distortion: number;
  monochrome: boolean;
  sepia: boolean;
  grain: number;
  glitch: number;
}

export const DEFAULT_EFFECTS: CameraEffects = {
  enabled: true, vignette: 0, outline: 0, outlineWidth: 4, outlineColor: '#78f5e3', wavyBorder: false, sticker: 'none', frame: 'none', background: 'none',
  spotlight: 0, distortion: 0, monochrome: false, sepia: false, grain: 0, glitch: 0,
};
