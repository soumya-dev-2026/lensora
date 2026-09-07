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

export type CanvasLayout = 'portrait' | 'landscape';

export interface CameraPreviewProps {
  layout: CanvasLayout;
  videoRef: React.RefObject<HTMLVideoElement>;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  isActive: boolean;
  facingMode: 'user' | 'environment';
  background: BackgroundSelection;
  onProcessingState?: (state: 'idle' | 'loading' | 'ready' | 'error', message?: string) => void;
}

export type BackgroundSelection =
  | { kind: 'image'; value: string }
  | { kind: 'color'; value: string };

export interface CameraControlsProps {
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onSave: () => void;
  onStopCamera: () => void;
  onSwitchFacing: () => void;
  isActive: boolean;
  recordingState: 'idle' | 'starting' | 'recording' | 'paused';
  fileName: string;
  onFileNameChange: (value: string) => void;
  facingMode: 'user' | 'environment';
  error: string | null;
  recordingError: string | null;
}
