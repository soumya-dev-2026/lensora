/**
 * useCamera Hook
 * 
 * Provides a React interface to the CameraManager.
 * Handles lifecycle management and state synchronization.
 */

import { useEffect, useRef, useState } from 'react';
import { CameraManager } from '../camera/CameraManager';
import { CameraOptions, CameraState } from '../types/camera';

interface UseCameraReturn {
  videoRef: React.RefObject<HTMLVideoElement>;
  isActive: boolean;
  facingMode: 'user' | 'environment';
  error: string | null;
  startCamera: (options?: Partial<CameraOptions>) => Promise<void>;
  stopCamera: () => void;
  switchCamera: () => Promise<void>;
  isSupported: boolean;
  hasMultipleCameras: boolean;
}

export function useCamera(): UseCameraReturn {
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraManagerRef = useRef(new CameraManager());
  const [state, setState] = useState<CameraState>({
    isActive: false,
    facingMode: 'user',
    stream: null,
    error: null,
  });
  const [isSupported] = useState(CameraManager.isCameraSupported());
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);

  // Check for multiple cameras on mount
  useEffect(() => {
    const checkCameras = async () => {
      const multiple = await CameraManager.hasMultipleCameras();
      setHasMultipleCameras(multiple);
    };
    checkCameras();
  }, []);

  // Subscribe to camera manager state changes
  useEffect(() => {
    const manager = cameraManagerRef.current;
    const unsubscribe = manager.subscribe((newState) => {
      setState(newState);
    });

    return unsubscribe;
  }, []);

  // Connect MediaStream to video element when stream changes
  useEffect(() => {
    if (videoRef.current && state.stream) {
      videoRef.current.srcObject = state.stream;
    }
  }, [state.stream]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cameraManagerRef.current.stop();
    };
  }, []);

  const startCamera = async (options?: Partial<CameraOptions>) => {
    try {
      await cameraManagerRef.current.start(options);
    } catch (err) {
      console.error('Failed to start camera:', err);
    }
  };

  const stopCamera = () => {
    cameraManagerRef.current.stop();
  };

  const switchCamera = async () => {
    try {
      await cameraManagerRef.current.switchCamera();
    } catch (err) {
      console.error('Failed to switch camera:', err);
    }
  };

  return {
    videoRef,
    isActive: state.isActive,
    facingMode: state.facingMode,
    error: state.error,
    startCamera,
    stopCamera,
    switchCamera,
    isSupported,
    hasMultipleCameras,
  };
}
