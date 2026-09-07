/**
 * Camera Manager
 * 
 * Handles all camera operations independently of React.
 * Responsibilities:
 * - Request camera permission
 * - Start/stop camera
 * - Switch between front and rear cameras
 * - Handle camera errors
 * - Expose the active MediaStream
 * - Manage MediaStream cleanup
 */

import { CameraOptions, CameraState } from '../types/camera';

type CameraEventListener = (state: CameraState) => void;

export class CameraManager {
  private stream: MediaStream | null = null;
  private facingMode: 'user' | 'environment' = 'user';
  private isActive: boolean = false;
  private error: string | null = null;
  private listeners: Set<CameraEventListener> = new Set();

  /**
   * Get default camera options
   */
  static getDefaultOptions(): CameraOptions {
    return {
      facingMode: 'user',
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 30 },
      audio: false,
    };
  }

  /**
   * Check if the browser supports camera access
   */
  static isCameraSupported(): boolean {
    return !!(
      navigator.mediaDevices &&
      navigator.mediaDevices.getUserMedia
    );
  }

  /**
   * Check if the device has multiple cameras
   */
  static async hasMultipleCameras(): Promise<boolean> {
    if (!this.isCameraSupported()) return false;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter((device) => device.kind === 'videoinput').length > 1;
    } catch {
      return false;
    }
  }

  /**
   * Request and start the camera
   */
  async start(options: Partial<CameraOptions> = {}): Promise<void> {
    if (this.isActive) {
      return;
    }

    try {
      this.error = null;
      this.facingMode = options.facingMode || 'user';

      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: this.facingMode,
          width: options.width || { ideal: 1280 },
          height: options.height || { ideal: 720 },
          frameRate: options.frameRate || { ideal: 30 },
        },
        audio: options.audio || false,
      };

      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.isActive = true;
      this.notifyListeners();
    } catch (err) {
      this.handleError(err);
      throw err;
    }
  }

  /**
   * Stop the camera and clean up resources
   */
  stop(): void {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => {
        track.stop();
      });
      this.stream = null;
    }
    this.isActive = false;
    this.error = null;
    this.notifyListeners();
  }

  /**
   * Switch between front and rear cameras
   */
  async switchCamera(): Promise<void> {
    if (!this.isActive) {
      throw new Error('Camera is not active');
    }

    const newFacingMode = this.facingMode === 'user' ? 'environment' : 'user';
    const previousFacingMode = this.facingMode;
    const currentStream = this.stream;

    try {
      this.isActive = false;
      await this.start({ facingMode: newFacingMode });
      if (currentStream) {
        currentStream.getTracks().forEach((track) => {
          track.stop();
        });
      }
    } catch (err) {
      this.stream = currentStream;
      this.isActive = true;
      this.facingMode = previousFacingMode;
      this.notifyListeners();
      throw err;
    }
  }

  /**
   * Get the current MediaStream
   */
  getStream(): MediaStream | null {
    return this.stream;
  }

  /**
   * Get the current camera state
   */
  getState(): CameraState {
    return {
      isActive: this.isActive,
      facingMode: this.facingMode,
      stream: this.stream,
      error: this.error,
    };
  }

  /**
   * Subscribe to camera state changes
   */
  subscribe(listener: CameraEventListener): () => void {
    this.listeners.add(listener);
    // Return unsubscribe function
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Handle camera errors with user-friendly messages
   */
  private handleError(err: unknown): void {
    if (err instanceof DOMException) {
      if (err.name === 'NotAllowedError') {
        this.error =
          'Camera access was denied. Please allow camera access in your browser settings.';
      } else if (err.name === 'NotFoundError') {
        this.error = 'No camera device found on this device.';
      } else if (err.name === 'NotReadableError') {
        this.error =
          'Camera is already in use by another application.';
      } else {
        this.error = `Camera error: ${err.message}`;
      }
    } else if (err instanceof Error) {
      this.error = err.message;
    } else {
      this.error = 'An unknown camera error occurred.';
    }
    this.isActive = false;
    this.notifyListeners();
  }

  /**
   * Notify all listeners of state changes
   */
  private notifyListeners(): void {
    const state = this.getState();
    this.listeners.forEach((listener) => {
      listener(state);
    });
  }
}
