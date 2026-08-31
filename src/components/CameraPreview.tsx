/**
 * Camera Preview Component
 * 
 * Displays the live camera feed.
 */

import React from 'react';
import { CameraPreviewProps } from '../types/camera';
import './CameraPreview.module.css';

export const CameraPreview: React.FC<CameraPreviewProps> = ({
  videoRef,
  isActive,
}) => {
  return (
    <div className="camera-preview-container">
      <video
        ref={videoRef}
        className="camera-preview-video"
        autoPlay
        playsInline
        muted
        style={{
          opacity: isActive ? 1 : 0.5,
          backgroundColor: '#000',
        }}
      />
      {!isActive && (
        <div className="camera-preview-overlay">
          Camera is not active
        </div>
      )}
    </div>
  );
};
