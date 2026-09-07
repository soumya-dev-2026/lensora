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
  onStart,
  onPause,
  onResume,
  onSave,
  onStopCamera,
  onSwitchFacing,
  isActive,
  recordingState,
  fileName,
  onFileNameChange,
  facingMode,
  error,
  recordingError,
}) => {
  return (
    <div className={styles.controls}>
      {error && <div className={styles.error}>{error}</div>}
      {recordingError && <div className={styles.error}>{recordingError}</div>}

      <div className={styles.buttons}>
        {recordingState === 'recording' ? (
          <button onClick={onPause} className={`${styles.button} ${styles.recording}`}>
            ⏸ Pause Recording
          </button>
        ) : recordingState === 'paused' ? (
          <button onClick={onResume} className={styles.button}>
            ▶ Resume Recording
          </button>
        ) : (
          <button onClick={onStart} className={styles.button} disabled={recordingState === 'starting'}>
            {recordingState === 'starting' ? 'Starting…' : '⏺ Start Recording'}
          </button>
        )}

        <button
          onClick={onSwitchFacing}
          disabled={!isActive || recordingState !== 'idle'}
          className={`${styles.button} ${styles.switch}`}
          aria-label="Switch camera (front/rear)"
        >
          🔄 Switch ({facingMode === 'user' ? 'Front' : 'Rear'})
        </button>

        <button
          onClick={onStopCamera}
          disabled={!isActive || recordingState !== 'idle'}
          className={`${styles.button} ${styles.stop}`}
        >
          ⏹ Stop Camera
        </button>
      </div>

      {recordingState === 'paused' && (
        <div className={styles.savePanel}>
          <label htmlFor="recording-name">Video filename</label>
          <div className={styles.saveRow}>
            <input
              id="recording-name"
              value={fileName}
              onChange={(event) => onFileNameChange(event.target.value)}
              placeholder="my-video"
              autoFocus
            />
            <button onClick={onSave} className={`${styles.button} ${styles.save}`}>
              Save Video
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
