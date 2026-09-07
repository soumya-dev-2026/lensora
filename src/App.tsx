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

import { useCallback, useEffect, useState } from 'react';
import { useCamera } from './hooks/useCamera';
import { CameraPreview } from './components/CameraPreview';
import { CameraControls } from './components/CameraControls';
import { BackgroundPicker, BACKGROUNDS } from './components/BackgroundPicker';
import { BackgroundSelection } from './types/camera';
import './App.css';

function App() {
  const [background, setBackground] = useState<BackgroundSelection>({ kind: 'image', value: BACKGROUNDS[0].src });
  const [processing, setProcessing] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [processingError, setProcessingError] = useState<string>();
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

  // Handle camera toggle
  const handleToggleCamera = async () => {
    if (isActive) {
      stopCamera();
    } else {
      await startCamera();
    }
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
        <div className="preview-section">
          <CameraPreview
            videoRef={videoRef}
            isActive={isActive}
            facingMode={facingMode}
            background={background}
            onProcessingState={handleProcessingState}
          />
        </div>

        {isActive && processing === 'loading' && <div className="processing-banner">Loading the AI model…</div>}
        {processingError && <div className="processing-error">{processingError}</div>}

        <CameraControls
          onToggleCamera={handleToggleCamera}
          onSwitchFacing={handleSwitchCamera}
          isActive={isActive}
          facingMode={facingMode}
          error={error}
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
