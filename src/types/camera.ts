/**
 * Camera-related type definitions
 */

export interface CameraOptions {
  facingMode: 'user' | 'environment';
  width?: number | ConstrainLongRange;
  height?: number | ConstrainLongRange;
  frameRate?: number | ConstrainDoubleRange;
  audio?: boolean;
}

export interface ConstrainLongRange {
  exact?: number;
  ideal?: number;
  min?: number;
  max?: number;
}

export interface ConstrainDoubleRange {
  exact?: number;
  ideal?: number;
  min?: number;
  max?: number;
}

export interface CameraCapabilities {
  facingMode: string[];
  width: ValueRange;
  height: ValueRange;
  frameRate: ValueRange;
}

export interface ValueRange {
  min: number;
  max: number;
}

export interface CameraState {
  isActive: boolean;
  facingMode: 'user' | 'environment';
  stream: MediaStream | null;
  error: string | null;
}

export interface CameraPreviewProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  isActive: boolean;
}

export interface CameraControlsProps {
  onToggleCamera: () => void;
  onSwitchFacing: () => void;
  isActive: boolean;
  facingMode: 'user' | 'environment';
  error: string | null;
}
