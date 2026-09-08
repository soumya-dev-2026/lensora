import { useEffect, useRef, useState } from 'react';
import { CameraPreviewProps } from '../types/camera';
import { PersonSegmenter } from '../ai/PersonSegmenter';
import { WebGLCompositor } from '../rendering/WebGLCompositor';
import styles from './CameraPreview.module.css';

export function CameraPreview({ layout, videoRef, canvasRef, isActive, facingMode, background, blur, tint, onProcessingState }: CameraPreviewProps) {
  const compositorRef = useRef<WebGLCompositor | null>(null);
  const settings = useRef({ background, blur, tint });
  settings.current = { background, blur, tint };
  const [generation, setGeneration] = useState(0);
  const [backgroundError, setBackgroundError] = useState<string>();

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
    let lastVideoTime = -1;
    let previousMask: Uint8Array | null = null;
    let compositor: WebGLCompositor | undefined;
    const segmenter = new PersonSegmenter();
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
        const processFrame = (time: number) => {
          if (cancelled) return;
          try {
            const video = videoRef.current;
            if (video && video.readyState >= 2 && video.currentTime !== lastVideoTime) {
              lastVideoTime = video.currentTime;
              const mask = segmenter.segment(video, time);
              if (mask) {
                if (!previousMask || previousMask.length !== mask.data.length) previousMask = mask.data;
                else for (let i = 0; i < mask.data.length; i++) previousMask[i] = Math.round(mask.data[i] * 0.8 + previousMask[i] * 0.2);
                const effect = settings.current;
                compositor!.render(video, previousMask, mask.width, mask.height, facingMode === 'user', effect.background.kind === 'blur', effect.blur, effect.tint);
                if (!ready) { ready = true; onProcessingState?.('ready'); }
              }
            }
            frame = requestAnimationFrame(processFrame);
          } catch (error) { fail(error); }
        };
        frame = requestAnimationFrame(processFrame);
      } catch (error) { fail(error); }
    };
    void start();
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      segmenter.dispose();
      compositor?.dispose();
      compositorRef.current = null;
    };
  }, [isActive, facingMode, onProcessingState, videoRef, canvasRef]);

  return <div className={`${styles.container} ${styles[layout]}`}>
    <video ref={videoRef} className={styles.sourceVideo} autoPlay playsInline muted />
    <canvas ref={canvasRef} className={styles.canvas} width={layout === 'portrait' ? 720 : 1280} height={layout === 'portrait' ? 1280 : 720} />
    {!isActive && <div className={styles.overlay}><span>Your space. Your scene.</span><small>Start your camera to preview a background</small></div>}
    {backgroundError && <p className={styles.error} role="alert">{backgroundError}</p>}
  </div>;
}
