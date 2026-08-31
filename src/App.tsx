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

import { useCamera } from './hooks/useCamera';
import { CameraPreview } from './components/CameraPreview';
import { CameraControls } from './components/CameraControls';
import './App.css';

function App() {
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
        <p>Phase 1: Camera MVP</p>
      </header>

      <main className="app-main">
        <div className="preview-section">
          <CameraPreview videoRef={videoRef} isActive={isActive} />
        </div>

        <CameraControls
          onToggleCamera={handleToggleCamera}
          onSwitchFacing={handleSwitchCamera}
          isActive={isActive}
          facingMode={facingMode}
          error={error}
        />

        <div className="info-section">
          <div className="status-info">
            <h3>Status</h3>
            <ul>
              <li>Camera: {isActive ? '✓ Active' : '✗ Inactive'}</li>
              <li>Facing: {facingMode === 'user' ? 'Front' : 'Rear'}</li>
              <li>Browser: {isSupported ? '✓ Supported' : '✗ Not Supported'}</li>
            </ul>
          </div>
        </div>
      </main>

      <footer className="app-footer">
        <p>Phase 1: Camera MVP - Local processing only, no data uploaded</p>
      </footer>
    </div>
  );
}

export default App;
