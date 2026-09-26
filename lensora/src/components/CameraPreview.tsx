import { drawLiveImages } from '../rendering/liveImages';
import { LiveImageHandle } from './LiveImageHandle';
import { useEffect, useRef, useState } from 'react';
import { CameraPreviewProps } from '../types/camera';
import { PersonSegmenter } from '../ai/PersonSegmenter';
import { SegmentationInput } from '../ai/SegmentationInput';
import { FaceTracker } from '../ai/FaceTracker';
import type { FaceFeatures } from '../types/filters';
import { WebGLCompositor } from '../rendering/WebGLCompositor';
import { FrameBudget } from '../rendering/FrameBudget';
import { drawLiveText } from '../rendering/liveText';
import { LiveTextHandle } from './LiveTextHandle';
import styles from './CameraPreview.module.css';

export function CameraPreview({ layout, videoRef, canvasRef, secondaryVideoRef, splitCamera = false, maskEnabled = false, liveText, onLiveTextChange, liveImages, onLiveImagesChange, isActive, facingMode, background, blur, tint, filters, effects, comparing = false, onStartCamera, cameraStarting = false, cameraDisabled = false, onFaceTrackingState, onProcessingState }: CameraPreviewProps) {
  const liveImagesRef = useRef(liveImages);
  liveImagesRef.current = liveImages;
  const liveTextRef = useRef(liveText);
  liveTextRef.current = liveText;
  const splitSettings = useRef({ splitCamera, layout });
  splitSettings.current = { splitCamera, layout };
  const originalRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const original = originalRef.current;
    if (!original || !comparing || !isActive) return;
    // This is a display-only branch. The captured canvas remains processed.
    original.srcObject = videoRef.current?.srcObject ?? null;
    void original.play().catch(() => {});
    return () => { original.srcObject = null; };
  }, [comparing, isActive, facingMode, videoRef]);
  const compositorRef = useRef<WebGLCompositor | null>(null);
  const trackerRef = useRef<FaceTracker | null>(null);
  const settings = useRef({ background, blur, tint, filters, effects });
  settings.current = { background, blur, tint, filters, effects };
  const [generation, setGeneration] = useState(0);
  const [backgroundError, setBackgroundError] = useState<string>();
  const [readyForMask, setReadyForMask] = useState<boolean | null>(null);
  const previewReady = readyForMask === maskEnabled;

  useEffect(() => {
    // Track even with beauty disabled: glasses must remain opaque in raw mode.
    // Let the first processed preview appear before loading the second AI model.
    if (!isActive || !previewReady || !maskEnabled) { onFaceTrackingState('off'); return; }
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
  }, [isActive, previewReady, maskEnabled, onFaceTrackingState]);

  useEffect(() => {
    const compositor = compositorRef.current;
    if (!compositor || !maskEnabled) return;
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
  }, [background, generation, maskEnabled]);

  useEffect(() => {
    setReadyForMask(null);
    if (!isActive || !canvasRef.current) { onProcessingState?.('idle'); return; }
    let cancelled = false;
    let frame = 0;
    let usesVideoCallback = false;
    let resumeFrames: (() => void) | undefined;
    const budget = new FrameBudget(maskEnabled && window.matchMedia('(pointer: coarse)').matches ? 15 : 30);
    const sourceVideo = videoRef.current;
    const cancelFrame = () => {
      if (usesVideoCallback) sourceVideo?.cancelVideoFrameCallback(frame);
      else cancelAnimationFrame(frame);
    };
    const visibilityChanged = () => {
      cancelFrame();
      if (!document.hidden) resumeFrames?.();
    };
    document.addEventListener('visibilitychange', visibilityChanged);
    let lastVideoTime = -1;
    const opaqueMask = new Uint8Array([255]);
    let compositor: WebGLCompositor | undefined;
    const segmenter = maskEnabled ? new PersonSegmenter() : null;
    const segmentationInput = maskEnabled ? new SegmentationInput() : null;
    onProcessingState?.('loading');
    const fail = (error: unknown) => {
      if (!cancelled) onProcessingState?.('error', error instanceof Error ? error.message : 'Camera processing failed.');
    };
    const start = async () => {
      try {
        const output = canvasRef.current!;
        const context = output.getContext('2d', { alpha: false });
        if (!context) throw new Error('Could not create the recording canvas.');
        const scene = document.createElement('canvas');
        scene.width = output.width; scene.height = output.height;
        compositor = new WebGLCompositor(scene);
        compositorRef.current = compositor;
        setGeneration((value) => value + 1);
        await segmenter?.initialize();
        if (cancelled) { segmenter?.dispose(); return; }
        let ready = false;
        const scheduleFrame = () => {
          if (cancelled || document.hidden) return;
          usesVideoCallback = !!sourceVideo?.requestVideoFrameCallback;
          frame = usesVideoCallback
            ? sourceVideo!.requestVideoFrameCallback(processFrame)
            : requestAnimationFrame(processFrame);
        };
        const processFrame = (time: number) => {
          if (cancelled || document.hidden) return;
          try {
            const video = videoRef.current;
            if (video && video.readyState >= 2 && video.currentTime !== lastVideoTime && budget.shouldProcess(time)) {
              const started = performance.now();
              lastVideoTime = video.currentTime;
              const mask = segmenter && segmentationInput
                ? segmenter.segment(segmentationInput.capture(video), time)
                : { data: opaqueMask, width: 1, height: 1, regions: undefined };
              const source = segmentationInput?.frame ?? video;
              if (mask) {
                const effect = settings.current;
                let face: FaceFeatures | null = null;
                const tracker = trackerRef.current;
                if (tracker) {
                  try {
                    face = tracker.detect(source, time);
                    onFaceTrackingState(face ? 'tracking' : 'no-face');
                  } catch {
                    tracker.dispose();
                    trackerRef.current = null;
                    onFaceTrackingState('error');
                  }
                }
                const canvas = canvasRef.current!;
                if (scene.width !== canvas.width) scene.width = canvas.width;
                if (scene.height !== canvas.height) scene.height = canvas.height;
                const second = secondaryVideoRef?.current;
                const split = splitSettings.current.splitCamera && second && second.readyState >= 2;
                const stacked = splitSettings.current.layout === 'portrait';
                const width = split && !stacked ? canvas.width / 2 : canvas.width;
                const height = split && stacked ? canvas.height / 2 : canvas.height;
                compositor!.render(source, mask.data, mask.width, mask.height, facingMode === 'user', !maskEnabled || effect.background.kind === 'blur', maskEnabled ? effect.blur : 0, maskEnabled ? effect.tint : 0, effect.filters, mask.regions, face, effect.effects, time / 1000,
                  { x: 0, y: split && stacked ? height : 0, width, height });
                if (split) {
                  const stream = second.srcObject as MediaStream | null;
                  const mirror = stream?.getVideoTracks()[0]?.getSettings().facingMode === 'user';
                  compositor!.render(second, opaqueMask, 1, 1, mirror, true, 0, 0, undefined, undefined, null, undefined, time / 1000,
                    { x: stacked ? 0 : width, y: 0, width, height });
                }
                context.drawImage(scene, 0, 0);
                drawLiveImages(context, liveImagesRef.current, canvas.width, canvas.height);
                drawLiveText(context, liveTextRef.current, canvas.width, canvas.height);
                if (!ready) { ready = true; setReadyForMask(maskEnabled); onProcessingState?.('ready'); }
              }
              budget.recordCost(performance.now() - started);
            }
            scheduleFrame();
          } catch (error) { fail(error); }
        };
        resumeFrames = scheduleFrame;
        scheduleFrame();
      } catch (error) { fail(error); }
    };
    void start();
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', visibilityChanged);
      cancelFrame();
      segmenter?.dispose();
      compositor?.dispose();
      compositorRef.current = null;
    };
  }, [isActive, facingMode, maskEnabled, onProcessingState, onFaceTrackingState, videoRef, canvasRef, secondaryVideoRef]);

  return <div className={`${styles.container} ${styles[layout]}${!isActive ? ` ${styles.idle}` : ''}`}>
    <video ref={videoRef} className={isActive && !previewReady ? styles.startingPreview : styles.sourceVideo} style={isActive && !previewReady && facingMode === 'user' ? { transform: 'scaleX(-1)' } : undefined} autoPlay playsInline muted />
    <video ref={secondaryVideoRef} className={styles.sourceVideo} autoPlay playsInline muted />
    <canvas ref={canvasRef} className={styles.canvas} width={layout === 'portrait' ? 720 : 1280} height={layout === 'landscape' ? 720 : 1280} />
    {isActive && comparing && <><video ref={originalRef} className={styles.originalPreview} style={{ transform: facingMode === 'user' ? 'scaleX(-1)' : undefined }} autoPlay playsInline muted /><span className={styles.originalLabel}>Original preview</span></>}
    {isActive && !comparing && onLiveImagesChange && liveImages?.map((image) => <LiveImageHandle key={image.id} value={image} width={layout === 'portrait' ? 720 : 1280} height={layout === 'landscape' ? 720 : 1280} onChange={(next) => onLiveImagesChange(liveImages.map((item) => item.id === next.id ? next : item))} />)}
    {isActive && !comparing && liveText && onLiveTextChange && <LiveTextHandle value={liveText} width={layout === 'portrait' ? 720 : 1280} height={layout === 'landscape' ? 720 : 1280} onChange={onLiveTextChange} />}
    {!isActive && <div className={styles.overlay}>
      <button type="button" data-camera-start className={styles.cameraOrb} aria-label="Start camera preview" disabled={cameraDisabled || cameraStarting} onClick={onStartCamera}><svg aria-hidden="true" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="m8 5 2-2h4l2 2h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" /><circle cx="12" cy="13" r="4" /></svg></button>
      <span className={styles.startLabel}>{cameraStarting ? 'Starting camera…' : 'Start camera'}</span>
      <h1>Your space. <span>Your scene.</span></h1>
      <p>Start your camera to preview a background</p>
    </div>}
    {backgroundError && <p className={styles.error} role="alert">{backgroundError}</p>}
  </div>;
}
