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
  private secondaryStream: MediaStream | null = null;
  private splitPending = false;
  private splitError: string | null = null;
  private splitRequest = 0;
  private splitCleanup: (() => void) | null = null;
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
  async start(options: Partial<CameraOptions> = {}, requireFacing = false): Promise<void> {
    if (this.isActive) {
      return;
    }

    try {
      this.error = null;
      this.splitError = null;
      this.facingMode = options.facingMode || 'user';

      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: requireFacing ? { exact: this.facingMode } : this.facingMode,
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
    this.stopSplitCamera();
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

    this.stopSplitCamera();
    const newFacingMode = this.facingMode === 'user' ? 'environment' : 'user';
    const previousFacingMode = this.facingMode;
    const currentStream = this.stream;

    // Mobile camera drivers often cannot open the rear camera while the front is held.
    currentStream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.isActive = false;
    this.notifyListeners();
    try {
      await this.start({ facingMode: newFacingMode }, true);
    } catch (err) {
      // A stopped stream cannot be restored: acquire a fresh previous-camera stream.
      try {
        await this.start({ facingMode: previousFacingMode });
        this.error = 'Could not switch cameras. Returned to the previous camera.';
        this.notifyListeners();
      } catch { /* start() already publishes the recovery error. */ }
      throw err;
    }
  }

  stopSplitCamera(): void {
    this.splitRequest++;
    this.splitCleanup?.();
    this.splitCleanup = null;
    this.secondaryStream?.getTracks().forEach((track) => track.stop());
    this.secondaryStream = null;
    this.splitPending = false;
    this.splitError = null;
    this.notifyListeners();
  }

  async startSplitCamera(): Promise<void> {
    if (!this.isActive || this.secondaryStream || this.splitPending) return;
    const request = ++this.splitRequest;
    const primary = this.stream!.getVideoTracks()[0];
    const currentId = primary.getSettings().deviceId;
    let secondary: MediaStream | null = null;
    this.splitPending = true;
    this.splitError = null;
    this.notifyListeners();
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      if (request !== this.splitRequest) return;
      const candidates = devices.filter((device) => device.kind === 'videoinput' && device.deviceId && device.deviceId !== currentId);
      const opposite = this.facingMode === 'user' ? 'environment' : 'user';
      const label = opposite === 'environment' ? /back|rear|environment/i : /front|user|facetime/i;
      const other = candidates.find((device) => label.test(device.label)) || candidates[0];
      if (currentId && !other) throw new Error('A second camera was not found. Connect or allow access to another camera.');
      secondary = await navigator.mediaDevices.getUserMedia({
        video: { ...(currentId && other ? { deviceId: { exact: other.deviceId } } : { facingMode: { exact: opposite } }), width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24 } },
        audio: false,
      });
      if (request !== this.splitRequest) { secondary.getTracks().forEach((track) => track.stop()); return; }
      const secondTrack = secondary.getVideoTracks()[0];
      // Some WebViews return a muted track while the camera sensor is starting.
      if (secondTrack) await Promise.all([primary, secondTrack].map((track) => this.waitForCamera(track)));
      if (request !== this.splitRequest) { secondary.getTracks().forEach((track) => track.stop()); return; }
      if (!secondTrack || (currentId && secondTrack.getSettings().deviceId === currentId) || primary.muted || primary.readyState === 'ended' || secondTrack.muted || secondTrack.readyState === 'ended') {
        throw new Error('This device cannot keep both cameras active at the same time.');
      }
      this.secondaryStream = secondary;
      const unavailable = () => {
        this.stopSplitCamera();
        if (primary.muted || primary.readyState === 'ended') this.stop();
        this.splitError = this.isActive
          ? 'The second camera became unavailable. Returned to single-camera mode.'
          : 'This device could not keep both cameras active. Start the camera again to use single-camera mode.';
        this.notifyListeners();
      };
      for (const track of [primary, secondTrack]) {
        track.addEventListener('ended', unavailable);
        track.addEventListener('mute', unavailable);
      }
      this.splitCleanup = () => {
        for (const track of [primary, secondTrack]) {
          track.removeEventListener('ended', unavailable);
          track.removeEventListener('mute', unavailable);
        }
      };
    } catch (error) {
      secondary?.getTracks().forEach((track) => track.stop());
      if (request !== this.splitRequest) return;
      if (primary.muted || primary.readyState === 'ended') {
        this.stop();
        this.splitError = 'This device could not keep both cameras active. Start the camera again to use single-camera mode.';
        this.notifyListeners();
        return;
      }
      this.splitError = error instanceof Error && error.name === 'Error'
        ? error.message : 'Could not open both cameras. Your device or browser may only support one camera at a time.';
    } finally {
      if (request === this.splitRequest) {
        this.splitPending = false;
        this.notifyListeners();
      }
    }
  }

  private waitForCamera(track: MediaStreamTrack): Promise<void> {
    if (!track.muted || track.readyState === 'ended') return Promise.resolve();
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer);
        track.removeEventListener('unmute', done);
        track.removeEventListener('ended', done);
        resolve();
      };
      const timer = setTimeout(done, 2500);
      track.addEventListener('unmute', done);
      track.addEventListener('ended', done);
    });
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
      secondaryStream: this.secondaryStream,
      splitPending: this.splitPending,
      splitError: this.splitError,
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
