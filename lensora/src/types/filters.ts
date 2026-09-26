export interface CameraFilters {
  enabled: boolean;
  look: 'none' | 'natural' | 'cinematic' | 'warm' | 'cool' | 'vintage';
  lookIntensity: number;
  sharpen: number;
  brightness: number;
  whiteBalance: number;
  saturation: number;
  contrast: number;
  skinBrightening: number;
  skinSmoothing: number;
  eyeSize: number;
  redLips: number;
  darkHair: number;
}

export const DEFAULT_FILTERS: CameraFilters = {
  enabled: true, look: 'none', lookIntensity: 100, sharpen: 0, brightness: 0, whiteBalance: 0, saturation: 0, contrast: 0,
  skinBrightening: 0, skinSmoothing: 0, eyeSize: 0, redLips: 0, darkHair: 0,
};

export type FaceTrackingState = 'off' | 'loading' | 'tracking' | 'no-face' | 'error';

export interface FaceFeatures {
  // Camera-normalized centers and circular radii, corrected for source aspect.
  eyes: [number, number, number, number][];
  mask: HTMLCanvasElement;
  pose?: { center: [number, number]; radius: [number, number]; roll: number };
}
