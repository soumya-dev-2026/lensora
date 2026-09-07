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
import styles from './CameraControls.module.css';

export const CameraControls: React.FC<CameraControlsProps> = ({
  onToggleCamera,
  onSwitchFacing,
  isActive,
  facingMode,
  error,
}) => {
  return (
    <div className={styles.controls}>
      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.buttons}>
        <button
          onClick={onToggleCamera}
          className={`${styles.button} ${
            isActive ? styles.active : ''
          }`}
          aria-label={isActive ? 'Stop camera' : 'Start camera'}
        >
          {isActive ? '⏹ Stop Camera' : '▶ Start Camera'}
        </button>

        <button
          onClick={onSwitchFacing}
          disabled={!isActive}
          className={`${styles.button} ${styles.switch}`}
          aria-label="Switch camera (front/rear)"
        >
          🔄 Switch ({facingMode === 'user' ? 'Front' : 'Rear'})
        </button>
      </div>
    </div>
  );
};
