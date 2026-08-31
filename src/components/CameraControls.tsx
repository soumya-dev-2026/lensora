/**
 * Camera Controls Component
 * 
 * Provides buttons to:
 * - Start/stop camera
 * - Switch between front and rear cameras
 * - Display errors
 */

import React from 'react';
import { CameraControlsProps } from '../types/camera';
import './CameraControls.module.css';

export const CameraControls: React.FC<CameraControlsProps> = ({
  onToggleCamera,
  onSwitchFacing,
  isActive,
  facingMode,
  error,
}) => {
  return (
    <div className="camera-controls">
      {error && <div className="camera-error">{error}</div>}

      <div className="camera-buttons">
        <button
          onClick={onToggleCamera}
          className={`camera-button toggle-button ${
            isActive ? 'active' : ''
          }`}
          aria-label={isActive ? 'Stop camera' : 'Start camera'}
        >
          {isActive ? '⏹ Stop Camera' : '▶ Start Camera'}
        </button>

        <button
          onClick={onSwitchFacing}
          disabled={!isActive}
          className="camera-button switch-button"
          aria-label="Switch camera (front/rear)"
        >
          🔄 Switch ({facingMode === 'user' ? 'Front' : 'Rear'})
        </button>
      </div>
    </div>
  );
};
