/**
 * Main Application Component
 * 
 * Phase 1 MVP: Camera setup
 * 
 * This component:
 * - Manages the overall application state
 * - Integrates the camera hook
 * - Renders the preview and controls
 * - Handles camera start/stop/switch operations
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useCamera } from './hooks/useCamera';
import { CameraPreview } from './components/CameraPreview';
import { CameraControls } from './components/CameraControls';
import { BackgroundPicker, BACKGROUNDS } from './components/BackgroundPicker';
import { BackgroundSelection, CanvasLayout } from './types/camera';
import './App.css';

function App() {
  const [canvasLayout, setCanvasLayout] = useState<CanvasLayout>('portrait');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [background, setBackground] = useState<BackgroundSelection>({ kind: 'image', value: BACKGROUNDS[0].src });
  const [processing, setProcessing] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [processingError, setProcessingError] = useState<string>();
  const [recordingState, setRecordingState] = useState<'idle' | 'starting' | 'recording' | 'paused'>('idle');
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [fileName, setFileName] = useState('background-video');
  const startWhenReadyRef = useRef(false);
  const {
    videoRef,
    isActive,
    facingMode,
    error,
    startCamera,
    stopCamera,
    switchCamera,
    isSupported,
  } = useCamera();

  const handleProcessingState = useCallback((state: 'idle' | 'loading' | 'ready' | 'error', message?: string) => {
    setProcessing(state);
    setProcessingError(message);
  }, []);

  useEffect(() => {
    return () => {
      if (background.kind === 'image' && background.value.startsWith('blob:')) {
        URL.revokeObjectURL(background.value);
      }
    };
  }, [background]);

  const handleBackgroundChange = (nextBackground: BackgroundSelection) => {
    setBackground(nextBackground);
  };

  const beginRecording = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !('MediaRecorder' in window) || typeof canvas.captureStream !== 'function') {
      setRecordingError('Video recording is not supported in this browser. Try Chrome, Edge, or Firefox.');
      setRecordingState('idle');
      return;
    }

    const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
      .find((type) => MediaRecorder.isTypeSupported(type));
    const recorder = new MediaRecorder(canvas.captureStream(30), mimeType ? { mimeType } : undefined);
    chunksRef.current = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onerror = () => {
      setRecordingError('The recording stopped unexpectedly. Please try again.');
      setRecordingState('idle');
    };
    recorder.start(1000);
    recorderRef.current = recorder;
    setRecordingError(null);
    setRecordingState('recording');
  }, []);

  useEffect(() => {
    if (isActive && processing === 'ready' && startWhenReadyRef.current) {
      startWhenReadyRef.current = false;
      beginRecording();
    }
  }, [beginRecording, isActive, processing]);

  useEffect(() => {
    if (error && recordingState === 'starting') {
      startWhenReadyRef.current = false;
      setRecordingState('idle');
    }
  }, [error, recordingState]);

  useEffect(() => () => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
  }, []);

  const handleStart = async () => {
    setRecordingError(null);
    if (!isActive) {
      startWhenReadyRef.current = true;
      setRecordingState('starting');
      await startCamera();
      return;
    }
    if (processing !== 'ready') {
      startWhenReadyRef.current = true;
      setRecordingState('starting');
      return;
    }
    beginRecording();
  };

  const handlePause = () => {
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.pause();
      setRecordingState('paused');
    }
  };

  const handleResume = () => {
    if (recorderRef.current?.state === 'paused') {
      recorderRef.current.resume();
      setRecordingState('recording');
    }
  };

  const handleSave = () => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;
    const safeName = fileName.trim().replace(/[^a-z0-9-_]+/gi, '-') || 'background-video';
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'video/webm' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${safeName}.webm`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      chunksRef.current = [];
      recorderRef.current = null;
      setRecordingState('idle');
    };
    recorder.stop();
  };

  const handleStopCamera = () => {
    startWhenReadyRef.current = false;
    stopCamera();
    setRecordingState('idle');
  };

  // Handle camera switch
  const handleSwitchCamera = async () => {
    try {
      await switchCamera();
    } catch (err) {
      console.error('Failed to switch camera:', err);
    }
  };

  // Show unsupported message if camera API is not available
  if (!isSupported) {
    return (
      <div className="app-container">
        <h1>Background Studio</h1>
        <div className="error-message">
          <p>Your browser does not support camera access.</p>
          <p>Please use a modern browser (Chrome, Edge, Firefox, or Safari) on a device with a camera.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>🎥 Background Studio</h1>
        <p>Private, on-device AI background replacement</p>
      </header>

      <main className="app-main">
        <fieldset className="layout-options" disabled={recordingState !== 'idle'}>
          <legend>Canvas layout</legend>
          {(['portrait', 'landscape'] as const).map((layout) => (
            <label key={layout}>
              <input
                type="radio"
                name="canvas-layout"
                value={layout}
                checked={canvasLayout === layout}
                onChange={() => setCanvasLayout(layout)}
              />
              {layout === 'portrait' ? 'Portrait (9:16)' : 'Landscape (16:9)'}
            </label>
          ))}
        </fieldset>
        <div className="preview-section">
          <CameraPreview
            layout={canvasLayout}
            videoRef={videoRef}
            canvasRef={canvasRef}
            isActive={isActive}
            facingMode={facingMode}
            background={background}
            onProcessingState={handleProcessingState}
          />
        </div>

        {isActive && processing === 'loading' && <div className="processing-banner">Loading the AI model…</div>}
        {processingError && <div className="processing-error">{processingError}</div>}

        <CameraControls
          onStart={handleStart}
          onPause={handlePause}
          onResume={handleResume}
          onSave={handleSave}
          onStopCamera={handleStopCamera}
          onSwitchFacing={handleSwitchCamera}
          isActive={isActive}
          recordingState={recordingState}
          fileName={fileName}
          onFileNameChange={setFileName}
          facingMode={facingMode}
          error={error}
          recordingError={recordingError}
        />

        <BackgroundPicker selected={background} onSelect={handleBackgroundChange} />

        <div className="info-section">
          <div className="status-info">
            <h3>Status</h3>
            <ul>
              <li>Camera: {isActive ? '✓ Active' : '✗ Inactive'}</li>
              <li>Facing: {facingMode === 'user' ? 'Front' : 'Rear'}</li>
              <li>Browser: {isSupported ? '✓ Supported' : '✗ Not Supported'}</li>
              <li>AI segmentation: {processing === 'ready' ? '✓ Ready' : processing === 'loading' ? 'Loading…' : 'Waiting'}</li>
              <li>Compositor: WebGL 2</li>
              <li>Recording: {recordingState === 'recording' ? '● Recording' : recordingState === 'paused' ? 'Paused' : recordingState === 'starting' ? 'Starting…' : 'Idle'}</li>
            </ul>
          </div>
        </div>
      </main>

      <footer className="app-footer">
        <p>Camera processing stays on this device</p>
      </footer>
    </div>
  );
}

export default App;
