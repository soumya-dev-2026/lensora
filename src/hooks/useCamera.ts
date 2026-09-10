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
  secondaryVideoRef: React.RefObject<HTMLVideoElement>;
  splitCamera: boolean;
  splitPending: boolean;
  splitError: string | null;
  setSplitCamera: (enabled: boolean) => Promise<void>;
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
  const secondaryVideoRef = useRef<HTMLVideoElement>(null);
  const cameraManagerRef = useRef(new CameraManager());
  const [state, setState] = useState<CameraState>({
    isActive: false,
    facingMode: 'user',
    stream: null,
    secondaryStream: null,
    splitPending: false,
    splitError: null,
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
  }, [state.isActive]);

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
    if (videoRef.current) {
      videoRef.current.srcObject = state.stream;
    }
  }, [state.stream]);

  useEffect(() => {
    const video = secondaryVideoRef.current;
    if (!video) return;
    video.srcObject = state.secondaryStream;
    if (state.secondaryStream) void video.play().catch(() => {
      if (video.srcObject === state.secondaryStream) cameraManagerRef.current.stopSplitCamera();
    });
    return () => { video.srcObject = null; };
  }, [state.secondaryStream]);

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
    secondaryVideoRef,
    splitCamera: !!state.secondaryStream,
    splitPending: state.splitPending,
    splitError: state.splitError,
    setSplitCamera: async (enabled) => {
      if (enabled) await cameraManagerRef.current.startSplitCamera();
      else cameraManagerRef.current.stopSplitCamera();
    },
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
