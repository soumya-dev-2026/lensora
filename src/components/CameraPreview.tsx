import { useEffect, useRef, useState } from 'react';
import { CameraPreviewProps } from '../types/camera';
import { PersonSegmenter } from '../ai/PersonSegmenter';
import { SegmentationInput } from '../ai/SegmentationInput';
import { FaceTracker } from '../ai/FaceTracker';
import type { FaceFeatures } from '../types/filters';
import { WebGLCompositor } from '../rendering/WebGLCompositor';
import styles from './CameraPreview.module.css';

export function CameraPreview({ layout, videoRef, canvasRef, isActive, facingMode, background, blur, tint, filters, onFaceTrackingState, onProcessingState }: CameraPreviewProps) {
  const compositorRef = useRef<WebGLCompositor | null>(null);
  const trackerRef = useRef<FaceTracker | null>(null);
  const settings = useRef({ background, blur, tint, filters });
  settings.current = { background, blur, tint, filters };
  const [generation, setGeneration] = useState(0);
  const [backgroundError, setBackgroundError] = useState<string>();

  useEffect(() => {
    // Track even with beauty disabled: glasses must remain opaque in raw mode.
    if (!isActive) { onFaceTrackingState('off'); return; }
    let cancelled = false;
    const tracker = new FaceTracker();
    onFaceTrackingState('loading');
    void tracker.initialize().then(() => {
      if (cancelled) { tracker.dispose(); return; }
      trackerRef.current = tracker;
      onFaceTrackingState('no-face');
    }).catch(() => {
      tracker.dispose();
      if (!cancelled) onFaceTrackingState('error');
    });
    return () => {
      cancelled = true;
      trackerRef.current = null;
      tracker.dispose();
    };
  }, [isActive, facingMode, onFaceTrackingState]);

  useEffect(() => {
    const compositor = compositorRef.current;
    if (!compositor) return;
    let cancelled = false;
    setBackgroundError(undefined);
    if (background.kind === 'color') compositor.setBackgroundColor(background.value);
    if (background.kind === 'image') {
      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.onload = () => {
        if (cancelled) return;
        try { compositor.setBackground(image); }
        catch { setBackgroundError('Could not render this image. Choose another background.'); }
      };
      image.onerror = () => {
        if (!cancelled) setBackgroundError('Could not load this background. Choose another image.');
      };
      image.src = background.value;
    }
    return () => { cancelled = true; };
  }, [background, generation]);

  useEffect(() => {
    if (!isActive || !canvasRef.current) { onProcessingState?.('idle'); return; }
    let cancelled = false;
    let frame = 0;
    let usesVideoCallback = false;
    const sourceVideo = videoRef.current;
    let lastVideoTime = -1;
    let compositor: WebGLCompositor | undefined;
    const segmenter = new PersonSegmenter();
    const segmentationInput = new SegmentationInput();
    onProcessingState?.('loading');
    const fail = (error: unknown) => {
      if (!cancelled) onProcessingState?.('error', error instanceof Error ? error.message : 'Camera processing failed.');
    };
    const start = async () => {
      try {
        compositor = new WebGLCompositor(canvasRef.current!);
        compositorRef.current = compositor;
        setGeneration((value) => value + 1);
        await segmenter.initialize();
        if (cancelled) { segmenter.dispose(); return; }
        let ready = false;
        const scheduleFrame = () => {
          if (cancelled) return;
          usesVideoCallback = !!sourceVideo?.requestVideoFrameCallback;
          frame = usesVideoCallback
            ? sourceVideo!.requestVideoFrameCallback(processFrame)
            : requestAnimationFrame(processFrame);
        };
        const processFrame = (time: number) => {
          if (cancelled) return;
          try {
            const video = videoRef.current;
            if (video && video.readyState >= 2 && video.currentTime !== lastVideoTime) {
              lastVideoTime = video.currentTime;
              const mask = segmenter.segment(segmentationInput.capture(video), time);
              if (mask) {
                const effect = settings.current;
                let face: FaceFeatures | null = null;
                const tracker = trackerRef.current;
                if (tracker) {
                  try {
                    face = tracker.detect(segmentationInput.frame, time);
                    onFaceTrackingState(face ? 'tracking' : 'no-face');
                  } catch {
                    tracker.dispose();
                    trackerRef.current = null;
                    onFaceTrackingState('error');
                  }
                }
                compositor!.render(segmentationInput.frame, mask.data, mask.width, mask.height, facingMode === 'user', effect.background.kind === 'blur', effect.blur, effect.tint, effect.filters, mask.regions, face);
                if (!ready) { ready = true; onProcessingState?.('ready'); }
              }
            }
            scheduleFrame();
          } catch (error) { fail(error); }
        };
        scheduleFrame();
      } catch (error) { fail(error); }
    };
    void start();
    return () => {
      cancelled = true;
      if (usesVideoCallback) sourceVideo?.cancelVideoFrameCallback(frame);
      else cancelAnimationFrame(frame);
      segmenter.dispose();
      compositor?.dispose();
      compositorRef.current = null;
    };
  }, [isActive, facingMode, onProcessingState, onFaceTrackingState, videoRef, canvasRef]);

  return <div className={`${styles.container} ${styles[layout]}`}>
    <video ref={videoRef} className={styles.sourceVideo} autoPlay playsInline muted />
    <canvas ref={canvasRef} className={styles.canvas} width={layout === 'portrait' ? 720 : 1280} height={layout === 'landscape' ? 720 : 1280} />
    {!isActive && <div className={styles.overlay}><span>Your space. Your scene.</span><small>Start your camera to preview a background</small></div>}
    {backgroundError && <p className={styles.error} role="alert">{backgroundError}</p>}
  </div>;
}
