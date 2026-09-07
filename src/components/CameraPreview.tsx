/**
 * Camera Preview Component
 * 
 * Displays the live camera feed.
 */

import React, { useEffect, useRef } from 'react';
import { CameraPreviewProps } from '../types/camera';
import { PersonSegmenter } from '../ai/PersonSegmenter';
import { WebGLCompositor } from '../rendering/WebGLCompositor';
import styles from './CameraPreview.module.css';

export const CameraPreview: React.FC<CameraPreviewProps> = ({
  videoRef,
  isActive,
  facingMode,
  background,
  onProcessingState,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const compositorRef = useRef<WebGLCompositor | null>(null);
  const segmenterRef = useRef<PersonSegmenter | null>(null);
  const frameRef = useRef<number>();
  const backgroundRef = useRef(background);
  const previousMaskRef = useRef<Uint8Array | null>(null);

  const applyBackground = (compositor: WebGLCompositor, nextBackground: typeof background) => {
    if (nextBackground.kind === 'color') {
      compositor.setBackgroundColor(nextBackground.value);
      return;
    }
    const image = new Image();
    image.onload = () => compositor.setBackground(image);
    image.src = nextBackground.value;
  };

  useEffect(() => {
    backgroundRef.current = background;
    if (compositorRef.current) applyBackground(compositorRef.current, background);
  }, [background]);

  useEffect(() => {
    if (!isActive || !canvasRef.current) return;
    let cancelled = false;
    let lastFrame = 0;
    previousMaskRef.current = null;
    const segmenter = new PersonSegmenter();
    segmenterRef.current = segmenter;
    onProcessingState?.('loading');

    const start = async () => {
      try {
        const compositor = new WebGLCompositor(canvasRef.current!);
        compositorRef.current = compositor;
        applyBackground(compositor, backgroundRef.current);
        await segmenter.initialize();
        if (cancelled) return;
        onProcessingState?.('ready');

        const processFrame = (time: number) => {
          if (cancelled) return;
          const video = videoRef.current;
          if (video && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && time - lastFrame >= 33) {
            lastFrame = time;
            const mask = segmenter.segment(video, time);
            if (mask) {
              let stableMask = previousMaskRef.current;
              if (!stableMask || stableMask.length !== mask.data.length) {
                stableMask = new Uint8Array(mask.data);
                previousMaskRef.current = stableMask;
              } else {
                // Preserve fine detail while damping single-frame edge flicker.
                for (let index = 0; index < mask.data.length; index += 1) {
                  stableMask[index] = mask.data[index] * 0.68 + stableMask[index] * 0.32;
                }
              }
              compositor.render(video, stableMask, mask.width, mask.height, facingMode === 'user');
            }
          }
          frameRef.current = requestAnimationFrame(processFrame);
        };
        frameRef.current = requestAnimationFrame(processFrame);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'AI background processing failed.';
        onProcessingState?.('error', message);
      }
    };
    start();

    return () => {
      cancelled = true;
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      segmenter.dispose();
      segmenterRef.current = null;
      compositorRef.current = null;
      previousMaskRef.current = null;
    };
  }, [isActive, facingMode, onProcessingState, videoRef]);

  return (
    <div className={styles.container}>
      <video
        ref={videoRef}
        className={styles.sourceVideo}
        autoPlay
        playsInline
        muted
      />
      <canvas ref={canvasRef} className={styles.canvas} />
      {!isActive && (
        <div className={styles.overlay}>
          <span>Camera is not active</span>
          <small>Start the camera to replace your background</small>
        </div>
      )}
    </div>
  );
};
