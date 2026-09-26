import { AppVersion } from './components/AppVersion';
import { LiveImageControls } from './components/LiveImageControls';
import type { LiveImage } from './rendering/liveImages';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useCamera } from './hooks/useCamera';
import { CameraPreview } from './components/CameraPreview';
import { BackgroundPicker, BACKGROUNDS } from './components/BackgroundPicker';
import { Modal } from './components/Modal';
import { BackgroundSelection, CanvasLayout } from './types/camera';
import { RecordingAudio } from './recording/RecordingAudio';
import { getMp4MimeType } from './recording/mp4';
import { CameraFilters } from './components/CameraFilters';
import { DEFAULT_FILTERS, FaceTrackingState } from './types/filters';
import { Icon } from './components/Icon';
import { CameraEffects } from './components/CameraEffects';
import { DEFAULT_EFFECTS } from './types/effects';
import { RecordingCountdown } from './components/RecordingCountdown';
import { MicrophoneMeter } from './components/MicrophoneMeter';
import { CompareButton } from './components/CompareButton';
import { SavedLooks } from './components/SavedLooks';
import { MotionToggle } from './components/MotionToggle';
import { readPreference, writePreference } from './storage/uiPreferences';
import { LiveTextControls } from './components/LiveTextControls';
import { DEFAULT_LIVE_TEXT, type LiveText } from './rendering/liveText';
import './App.css';
import './glass-theme.css';

const settingsTabs = [
  { key: 'background', label: 'Background', icon: 'image' },
  { key: 'filters', label: 'Filters', icon: 'sparkle' },
  { key: 'effects', label: 'Effects', icon: 'effects' },
  { key: 'text', label: 'Text', icon: 'text' },
  { key: 'images', label: 'Images', icon: 'image' },
] as const;
type SettingsTab = typeof settingsTabs[number]['key'];

type RecordingState = 'idle' | 'starting' | 'countdown' | 'recording' | 'paused' | 'stopping';
const formatTime = (ms: number) => {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
};

function getDefaultLayout(): CanvasLayout {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return 'landscape';

  // iPads can identify as Macs when requesting desktop websites.
  const mobileOrTablet = /Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (!mobileOrTablet) return 'landscape';

  const orientation = window.screen?.orientation?.type;
  if (orientation?.startsWith('landscape')) return 'landscape';
  if (orientation?.startsWith('portrait')) return 'portrait';

  // Older iOS browsers expose the device rotation as an angle.
  const angle = (window as Window & { orientation?: number }).orientation;
  if (typeof angle === 'number') return Math.abs(angle) % 180 === 90 ? 'landscape' : 'portrait';

  return 'portrait';
}

function App() {
  const [liveImages, setLiveImages] = useState<LiveImage[]>([]);
  const [liveText, setLiveText] = useState<LiveText>({ ...DEFAULT_LIVE_TEXT });
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('background');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [noiseCancellation, setNoiseCancellation] = useState(() => readPreference('noise-cancellation'));
  const [noisePending, setNoisePending] = useState(false);
  const [noiseNotice, setNoiseNotice] = useState('');
  const [countdownEnabled, setCountdownEnabled] = useState(() => readPreference('countdown'));
  const [comparing, setComparing] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const startingCamera = useRef(false);
  const settingsTabsRef = useRef<HTMLDivElement>(null);
  const settingsDrag = useRef<{ pointerId: number; x: number; scrollLeft: number; moved: boolean } | null>(null);
  useEffect(() => {
    const tabbar = settingsTabsRef.current;
    if (!settingsOpen || !tabbar) return;
    tabbar.closest('.sidebar-content')?.scrollTo({ top: 0 });
    const selected = tabbar.querySelector<HTMLButtonElement>('[aria-selected="true"]');
    if (selected) tabbar.scrollTo({
      left: selected.offsetLeft - (tabbar.clientWidth - selected.offsetWidth) / 2,
      behavior: document.documentElement.dataset.motion === 'off' || window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
    });
  }, [settingsTab, settingsOpen]);
  const openSettings = (tab: SettingsTab) => { setSettingsTab(tab); setSettingsOpen(true); };
  const [effects, setEffects] = useState({ ...DEFAULT_EFFECTS });
  const [filters, setFilters] = useState({ ...DEFAULT_FILTERS });
  const [faceState, setFaceState] = useState<FaceTrackingState>('off');
  const [layout, setLayout] = useState<CanvasLayout>(getDefaultLayout);
  const [layoutOpen, setLayoutOpen] = useState(false);
  const [background, setBackground] = useState<BackgroundSelection>({ kind: 'image', value: BACKGROUNDS[0].src });
  const [maskEnabled, setMaskEnabled] = useState(false);
  const [blur, setBlur] = useState(0);
  const [tint, setTint] = useState(0);
  const [processing, setProcessing] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [processingError, setProcessingError] = useState<string>();
  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [fileName, setFileName] = useState('background-video');
  const [savedClip, setSavedClip] = useState<Blob | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [micMuted, setMicMuted] = useState(false);
  const [micPending, setMicPending] = useState(false);
  const micReady = useRef(false);
  const audioRef = useRef(new RecordingAudio(noiseCancellation));
  const [clipUrl, setClipUrl] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const studioRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const pendingStart = useRef(false);
  const recordingRequest = useRef(false);
  const requestId = useRef(0);
  const [startRequest, setStartRequest] = useState(0);
  const accumulated = useRef(0);
  const startedAt = useRef(0);
  const { videoRef, isActive, facingMode, error, startCamera, stopCamera, switchCamera, isSupported, hasMultipleCameras, secondaryVideoRef, splitCamera = false, splitPending = false, splitError, setSplitCamera } = useCamera();
  const cameraActive = useRef(isActive);
  cameraActive.current = isActive;
  const busy = recordingState !== 'idle' || splitPending;
  useEffect(() => {
    const recorder = recorderRef.current;
    if (!isActive && recorder && recorder.state !== 'inactive') recorder.stop();
  }, [isActive]);
  const showTimer = recordingState === 'recording' || recordingState === 'paused' || recordingState === 'stopping';

  const handleProcessingState = useCallback((state: typeof processing, message?: string) => {
    setProcessing(state);
    setProcessingError(message);
  }, []);
  const startPreview = async () => {
    if (startingCamera.current || busy || !isSupported) return;
    startingCamera.current = true; setCameraStarting(true);
    try { await startCamera(); }
    finally { startingCamera.current = false; setCameraStarting(false); }
  };
  useEffect(() => {
    if (!isSupported || cameraActive.current) return;
    // Defer until mount settles so StrictMode's setup/cleanup does not request twice.
    const timer = window.setTimeout(() => { void startPreview(); }, 0);
    return () => window.clearTimeout(timer);
  }, [isSupported]);
  const cancelRecordingStart = useCallback(() => {
    requestId.current++; recordingRequest.current = false; pendingStart.current = false;
    setRecordingState((current) => current === 'starting' || current === 'countdown' ? 'idle' : current);
  }, []);
  useEffect(() => {
    const cancel = () => { if (document.visibilityState === 'hidden') cancelRecordingStart(); };
    document.addEventListener('visibilitychange', cancel);
    return () => document.removeEventListener('visibilitychange', cancel);
  }, [cancelRecordingStart]);
  useEffect(() => {
    if (recordingState === 'countdown' && (!isActive || processing !== 'ready')) cancelRecordingStart();
  }, [recordingState, isActive, processing, cancelRecordingStart]);

  useEffect(() => {
    if (!savedClip) { setClipUrl(''); return; }
    const url = URL.createObjectURL(savedClip);
    setClipUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [savedClip]);

  useEffect(() => {
    const update = () => setFullscreen(document.fullscreenElement === studioRef.current);
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, []);

  useEffect(() => {
    if (recordingState !== 'recording') return;
    const timer = window.setInterval(() => setElapsed(accumulated.current + performance.now() - startedAt.current), 200);
    return () => window.clearInterval(timer);
  }, [recordingState]);

  useEffect(() => {
    let cancelled = false;
    micReady.current = false;
    if (!isActive) { audioRef.current.mute(); setMicMuted(false); setMicPending(false); return; }
    setMicPending(true);
    void audioRef.current.unmute().then((enabled) => {
      if (!cancelled) setMicMuted(!enabled);
    }).catch(() => {
      if (!cancelled) { setMicMuted(true); setRecordingError('Microphone access was denied or unavailable. Recording will be muted.'); }
    }).finally(() => {
      if (!cancelled) { micReady.current = true; setMicPending(false); }
    });
    return () => { cancelled = true; audioRef.current.mute(); };
  }, [isActive]);

  useEffect(() => () => {
    requestId.current++; recordingRequest.current = false; pendingStart.current = false;
    audioRef.current.dispose();
    const recorder = recorderRef.current;
    if (recorder) {
      recorder.onstop = null;
      recorder.ondataavailable = null;
      recorder.onerror = null;
      if (recorder.state !== 'inactive') recorder.stop();
      recorder.stream.getTracks().forEach((track) => track.stop());
    }
  }, []);

  const beginRecording = useCallback(() => {
    if (!recordingRequest.current || recorderRef.current) return;
    recordingRequest.current = false;
    if (document.visibilityState === 'hidden' || !cameraActive.current) { setRecordingState('idle'); return; }
    let stream: MediaStream | undefined;
    try {
      const canvas = canvasRef.current;
      if (!canvas || !window.MediaRecorder || !canvas.captureStream) throw new Error('Video recording is unavailable in this browser.');
      const mimeType = getMp4MimeType((type) => MediaRecorder.isTypeSupported(type), true);
      stream = canvas.captureStream(30);
      stream.addTrack(audioRef.current.recordingTrack());
      const recorder = new MediaRecorder(stream, { mimeType });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      recorder.onstop = () => {
        recorder.stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunks, { type: recorder.mimeType || mimeType });
        if (blob.size) { setSavedClip(blob); setSaveOpen(true); }
        else setRecordingError('No video was captured. Please try again.');
        recorderRef.current = null;
        setRecordingState('idle');
      };
      recorder.onerror = () => {
        setRecordingError('Recording was interrupted. Any captured video will be available to save.');
        if (recorder.state !== 'inactive') recorder.stop();
      };
      recorder.start(250);
      recorderRef.current = recorder;
      accumulated.current = 0;
      startedAt.current = performance.now();
      setElapsed(0);
      setRecordingState('recording');
      setRecordingError(null);
    } catch (error) {
      stream?.getTracks().forEach((track) => track.stop());
      setRecordingError(error instanceof Error ? error.message : 'Could not start recording.');
      setRecordingState('idle');
    }
  }, []);

  const queueRecording = useCallback(() => {
    if (!recordingRequest.current) return;
    if (document.visibilityState === 'hidden') { cancelRecordingStart(); return; }
    setComparing(false); setSettingsOpen(false);
    if (countdownEnabled) setRecordingState('countdown');
    else beginRecording();
  }, [countdownEnabled, beginRecording, cancelRecordingStart]);

  useEffect(() => {
    if (pendingStart.current && isActive && processing === 'ready' && micReady.current) {
      pendingStart.current = false;
      queueRecording();
    }
    if (error || processing === 'error') {
      cancelRecordingStart();
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== 'inactive') {
        setRecordingError('Camera processing stopped. Save the video captured so far.');
        recorder.stop();
      }
    }
  }, [isActive, processing, error, queueRecording, micPending, startRequest, cancelRecordingStart]);

  const record = async () => {
    if (recordingRequest.current || busy || startingCamera.current) return;
    if (savedClip) { setSaveOpen(true); return; }
    const attempt = ++requestId.current;
    recordingRequest.current = true;
    setRecordingError(null);
    setRecordingState('starting');
    try { await audioRef.current.resume(); }
    catch { if (attempt === requestId.current) { cancelRecordingStart(); setRecordingError('Audio recording is unavailable in this browser.'); } return; }
    if (attempt !== requestId.current || !recordingRequest.current) return;
    pendingStart.current = true;
    setStartRequest(attempt);
    if (!cameraActive.current) await startCamera();
  };
  const pauseOrResume = () => {
    const recorder = recorderRef.current;
    if (recorder?.state === 'recording') {
      recorder.pause();
      accumulated.current += performance.now() - startedAt.current;
      setElapsed(accumulated.current);
      setRecordingState('paused');
    } else if (recorder?.state === 'paused') {
      recorder.resume();
      startedAt.current = performance.now();
      setRecordingState('recording');
    }
  };
  const stop = () => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;
    if (recorder.state === 'recording') accumulated.current += performance.now() - startedAt.current;
    setElapsed(accumulated.current);
    setRecordingState('stopping');
    recorder.stop();
  };
  const save = () => {
    if (!savedClip || !clipUrl) return;
    const safeName = fileName.trim().replace(/\.(webm|mp4)$/i, '').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').slice(0, 120) || 'background-video';
    const link = document.createElement('a');
    link.href = clipUrl;
    link.download = `${safeName}.mp4`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setSaveOpen(false);
  };
  const requestDiscard = () => { setSaveOpen(false); setDiscardOpen(true); };
  const cancelDiscard = () => { setDiscardOpen(false); setSaveOpen(true); };
  const discard = async () => {
    setDiscardOpen(false);
    setSaveOpen(false);
    setSavedClip(null);
    setElapsed(0);
    setRecordingError(null);
    stopCamera();
    await startCamera({ facingMode });
  };
  const toggleMicrophone = async () => {
    if (!micMuted) { audioRef.current.mute(); setMicMuted(true); return; }
    setMicPending(true);
    try {
      if (await audioRef.current.unmute()) { setMicMuted(false); setRecordingError(null); }
    } catch { setRecordingError('Microphone unavailable. Allow microphone access to record audio.'); }
    finally { setMicPending(false); }
  };
  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await studioRef.current?.requestFullscreen();
    } catch { setRecordingError('Fullscreen is unavailable in this browser. The canvas still fills the studio view.'); }
  };
  const message = error || splitError || processingError || recordingError;

  return <div className="studio" data-camera-active={isActive} ref={studioRef}>
    <main className="stage" aria-label="Camera studio">
      <CameraPreview layout={layout} videoRef={videoRef} canvasRef={canvasRef} secondaryVideoRef={secondaryVideoRef} splitCamera={splitCamera} maskEnabled={maskEnabled} renderQualityLocked={recordingState !== 'idle'} liveImages={liveImages} onLiveImagesChange={setLiveImages} liveText={liveText} onLiveTextChange={setLiveText} isActive={isActive} facingMode={facingMode} background={background} blur={blur} tint={tint} filters={filters} effects={effects} comparing={comparing} onStartCamera={() => void startPreview()} cameraStarting={cameraStarting} cameraDisabled={!isSupported || busy} onFaceTrackingState={setFaceState} onProcessingState={handleProcessingState} />
    </main>
    {recordingState === 'countdown' && <RecordingCountdown onComplete={beginRecording} onCancel={cancelRecordingStart} />}
    {isActive && maskEnabled && !splitCamera && processing === 'ready' && recordingState !== 'countdown' && recordingState !== 'starting' && <CompareButton onChange={setComparing} />}
    {showTimer && <div className={`recording-time ${recordingState === 'recording' ? 'live' : ''}`} role="timer" aria-label={`${recordingState === 'paused' ? 'Paused' : 'Recording time'} ${formatTime(elapsed)}`}>
      {recordingState === 'paused' ? <Icon name="pause" size={12} /> : <i aria-hidden="true" />}{formatTime(elapsed)}
    </div>}
    <div className="top-left">
      <button className="icon-button glass" aria-label="Mask" title={maskEnabled ? 'Turn off mask' : 'Apply mask'} aria-pressed={maskEnabled} disabled={busy} onClick={() => { setComparing(false); setMaskEnabled((enabled) => !enabled); }}><Icon name="mask" /></button>
      <button className="icon-button glass" data-current={settingsTab === 'background'} aria-label="Background filters" title="Background" aria-haspopup="dialog" onClick={() => openSettings('background')}><Icon name="image" /></button>
      <button className="icon-button glass" data-current={settingsTab === 'filters'} aria-label="Camera filters" title="Camera filters" aria-haspopup="dialog" onClick={() => openSettings('filters')}><Icon name="sparkle" /></button>
    </div>
    <div className="top-right">
      <button className="icon-button glass" aria-label="Canvas orientation" title="Canvas orientation" aria-haspopup="dialog" disabled={busy} onClick={() => setLayoutOpen(true)}><Icon name={layout} /></button>
      <button className="icon-button glass" aria-label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'} title={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'} onClick={() => void toggleFullscreen()}><Icon name={fullscreen ? 'collapse' : 'expand'} /></button>
      {hasMultipleCameras && <button className="icon-button glass camera-switch" aria-label="Switch camera" title="Switch camera" disabled={!isActive || busy || splitCamera} onClick={() => void switchCamera()}><Icon name="switchCamera" /></button>}
    </div>
    <div className="status-area" aria-live="polite">
      {!isSupported && <p role="alert">Camera access is unavailable. Open this app over HTTPS in a camera-capable browser.</p>}
      {message && <p role="alert">{message}</p>}
      {processing === 'loading' && <p>{maskEnabled ? 'Loading mask…' : 'Starting camera…'}</p>}
      {recordingState === 'starting' && <button type="button" onClick={cancelRecordingStart}>Cancel recording start</button>}
      {isActive && processing === 'error' && !busy && <button className="icon-button glass" aria-label="Reset camera" title="Reset camera" onClick={stopCamera}><Icon name="reset" /></button>}
      {savedClip && !saveOpen && !discardOpen && <div className="clip-actions"><button className="icon-button glass" aria-label="Review and save video" title="Review and save video" onClick={() => setSaveOpen(true)}><Icon name="download" /></button><button className="icon-button glass" aria-label="New recording" title="New recording" onClick={requestDiscard}><Icon name="plus" /></button></div>}
    </div>
    {recordingState === 'idle' && <>
      <a className="icon-button glass studio-editor-launcher" href="/editor" aria-disabled={busy} onClick={(event) => { if (busy) event.preventDefault(); }} aria-label="Open video editor" title="Video editor"><Icon name="wand" /></a>
      <button className="icon-button glass studio-split-launcher" aria-label="Split camera" title={splitPending ? 'Opening second camera…' : !isActive ? 'Start the camera to enable split camera' : splitCamera ? 'Turn off split camera' : 'Turn on split camera'} aria-pressed={splitCamera} disabled={!isActive || busy || cameraStarting} onClick={() => { setComparing(false); void setSplitCamera(!splitCamera); }}><Icon name="splitCamera" /></button>
    </>}
    <div className="record-controls">
      <button className="icon-button glass camera-toggle" aria-label={isActive ? 'Camera off' : 'Start camera'} title={isActive ? 'Camera off' : 'Start camera'} disabled={!isSupported || busy || cameraStarting} onClick={() => isActive ? stopCamera() : void startPreview()}><Icon name={isActive ? 'cameraOff' : 'camera'} /></button>
      {recordingState === 'recording' || recordingState === 'paused' ? <>
        <button className="record-small pause" aria-label={recordingState === 'paused' ? 'Resume recording' : 'Pause recording'} title={recordingState === 'paused' ? 'Resume recording' : 'Pause recording'} onClick={pauseOrResume}><Icon name={recordingState === 'paused' ? 'play' : 'pause'} /></button>
        <button className="record-small stop" aria-label="Stop recording" title="Stop recording" onClick={stop}><Icon name="stop" /></button>
      </> : <>
        <button className="record-button" aria-label={savedClip ? 'Review recording' : 'Start recording'} title={savedClip ? 'Review recording' : 'Start recording'} disabled={!isSupported || busy || cameraStarting || (isActive && processing === 'error')} onClick={() => void record()}>{savedClip ? <Icon name="play" size={26} /> : <span />}</button>
      </>}
      <button className="icon-button glass microphone-toggle" aria-label={micMuted ? 'Unmute microphone' : 'Mute microphone'} title={micMuted ? 'Unmute microphone' : 'Mute microphone'} aria-pressed={!micMuted} disabled={!isActive || micPending || recordingState === 'stopping'} onClick={() => void toggleMicrophone()}><Icon name={micMuted ? 'micOff' : 'mic'} /></button>
      <MicrophoneMeter audio={audioRef.current} active={isActive} muted={micMuted} pending={micPending} />
      {(recordingState === 'starting' || recordingState === 'stopping') && <span className="record-caption" role="status">{recordingState === 'starting' ? 'Getting ready…' : 'Finishing…'}</span>}
    </div>
    <Modal title="Studio settings" subtitle="Customize your studio environment" icon="sliders" open={settingsOpen} onClose={() => setSettingsOpen(false)}>
      <header className="studio-settings-slider">
      <div ref={settingsTabsRef} className="studio-settings-tabs" onPointerDown={(event) => {
        // Touch uses native momentum scrolling and snapping.
        settingsDrag.current = null;
        if (event.pointerType !== 'mouse' || event.button !== 0) return;
        settingsDrag.current = { pointerId: event.pointerId, x: event.clientX, scrollLeft: event.currentTarget.scrollLeft, moved: false };
      }} onPointerMove={(event) => {
        const drag = settingsDrag.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        const delta = event.clientX - drag.x;
        if (!drag.moved && Math.abs(delta) < 6) return;
        if (!drag.moved) {
          drag.moved = true;
          event.currentTarget.setPointerCapture(event.pointerId);
          event.currentTarget.dataset.dragging = 'true';
        }
        event.currentTarget.scrollLeft = drag.scrollLeft - delta;
      }} onPointerUp={(event) => {
        delete event.currentTarget.dataset.dragging;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      }} onPointerCancel={(event) => {
        settingsDrag.current = null;
        delete event.currentTarget.dataset.dragging;
      }} onLostPointerCapture={(event) => {
        delete event.currentTarget.dataset.dragging;
      }} onPointerLeave={() => {
        if (!settingsDrag.current?.moved) settingsDrag.current = null;
      }} onClickCapture={(event) => {
        if (settingsDrag.current?.moved && event.detail !== 0) {
          event.preventDefault();
          event.stopPropagation();
        }
        settingsDrag.current = null;
      }} onDragStart={(event) => event.preventDefault()}>
        <div className="studio-settings-tab-group" role="tablist" aria-label="Studio settings" aria-describedby="studio-slider-hint">
        {settingsTabs.map((tab, index) => <button type="button" key={tab.key} role="tab" id={`studio-tab-${tab.key}`} aria-controls={`studio-panel-${tab.key}`} aria-selected={settingsTab === tab.key} tabIndex={settingsTab === tab.key ? 0 : -1} onClick={() => setSettingsTab(tab.key)} onKeyDown={(event) => {
          const next = event.key === 'ArrowRight' ? (index + 1) % settingsTabs.length : event.key === 'ArrowLeft' ? (index + settingsTabs.length - 1) % settingsTabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? settingsTabs.length - 1 : -1;
          if (next < 0) return;
          event.preventDefault(); setSettingsTab(settingsTabs[next].key);
          event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next].focus();
        }}><Icon name={tab.icon} size={21} /><span>{tab.label}</span></button>)}
        </div>
      </div>
        <span className="studio-slider-arrow studio-slider-arrow-left" aria-hidden="true"><Icon name="back" size={16} /></span>
        <span className="studio-slider-arrow studio-slider-arrow-right" aria-hidden="true"><Icon name="back" size={16} /></span>
        <span id="studio-slider-hint" className="sr-only">Swipe or drag to explore</span>
      </header>
      <div id="studio-panel-background" className="studio-tab-content" role="tabpanel" aria-labelledby="studio-tab-background" hidden={settingsTab !== 'background'}>
        <BackgroundPicker selected={background} onSelect={setBackground} blur={blur} tint={tint} onBlur={setBlur} onTint={setTint} />
      </div>
      <div id="studio-panel-filters" className="studio-tab-content" role="tabpanel" aria-labelledby="studio-tab-filters" hidden={settingsTab !== 'filters'}>
        <CameraFilters value={filters} onChange={setFilters} faceState={faceState} />
      </div>
      <div id="studio-panel-effects" className="studio-tab-content" role="tabpanel" aria-labelledby="studio-tab-effects" hidden={settingsTab !== 'effects'}>
        <CameraEffects value={effects} onChange={setEffects} faceState={faceState} />
      </div>
      <div id="studio-panel-text" className="studio-tab-content" role="tabpanel" aria-labelledby="studio-tab-text" hidden={settingsTab !== 'text'}>
        <LiveTextControls value={liveText} onChange={setLiveText} canPosition={isActive} onPosition={() => { setComparing(false); setSettingsOpen(false); }} />
      </div>
      <div id="studio-panel-images" className="studio-tab-content" role="tabpanel" aria-labelledby="studio-tab-images" hidden={settingsTab !== 'images'}>
        <LiveImageControls value={liveImages} onChange={setLiveImages} canPosition={isActive} onPosition={() => { setComparing(false); setSettingsOpen(false); }} />
      </div>
      <SavedLooks settings={{ background, blur, tint, filters, effects, layout }} busy={busy} onApply={(look) => {
        if (busy) return;
        setBackground({ ...look.background }); setBlur(look.blur); setTint(look.tint);
        setFilters({ ...look.filters }); setEffects({ ...look.effects }); setLayout(look.layout);
      }} />
      <details className="studio-utility-panel studio-preferences-panel"><summary><span className="utility-heading-icon"><Icon name="settings" size={23} /></span><span className="utility-heading-copy"><strong>Studio preferences</strong><small>Customize your recording and interface settings.</small></span></summary>
        <div className="preference-card-list">
        <label className="preference-toggle preference-card"><span className="preference-icon"><Icon name="timer" size={23} /></span><span className="preference-copy"><strong>3-second countdown</strong><small>You can skip or cancel before recording starts.</small></span><input type="checkbox" role="switch" checked={countdownEnabled} onChange={(event) => { setCountdownEnabled(event.target.checked); writePreference('countdown', event.target.checked); }} /></label>
        <label className="preference-toggle preference-card">
          <span className="preference-icon"><Icon name="mic" size={23} /></span>
          <span className="preference-copy"><strong>Noise cancellation</strong><small>{noiseNotice || 'Reduce microphone background noise. Turn off to keep more ambient sound where supported.'}</small></span>
          <input type="checkbox" role="switch" checked={noiseCancellation} disabled={noisePending} onChange={async (event) => {
            const enabled = event.target.checked;
            setNoiseCancellation(enabled); writePreference('noise-cancellation', enabled); setNoisePending(true);
            try {
              const applied = await audioRef.current.setNoiseCancellation(enabled);
              setNoiseNotice(applied ? '' : 'Your browser or microphone does not support this noise cancellation setting.');
            } finally { setNoisePending(false); }
          }} />
        </label>
        {recordingState === 'idle' && <label className="preference-toggle preference-card">
          <span className="preference-icon"><Icon name="splitCamera" size={23} /></span>
          <span className="preference-copy"><strong>Split camera</strong><small>{splitPending ? 'Opening second camera…' : !isActive ? 'Start the camera to use two cameras together.' : 'Record two cameras together. Landscape: side by side. Portrait: stacked. Effects apply to the main camera.'}</small></span>
          <input type="checkbox" role="switch" checked={splitCamera} disabled={!isActive || busy} onChange={(event) => { setComparing(false); void setSplitCamera(event.target.checked); }} />
        </label>}
        {splitError && <p role="alert">{splitError}</p>}
        <MotionToggle />
        </div>
      </details>
      <footer className="studio-creator">Creator: <strong>Soumya Pal</strong> <AppVersion /></footer>
    </Modal>
    {layoutOpen && <Modal variant="dialog" title="Canvas orientation" onClose={() => setLayoutOpen(false)}>
      <div className="orientation-options" role="group" aria-label="Canvas orientation">
        {(['portrait', 'landscape', 'square'] as const).map((option) => <button key={option} disabled={busy} aria-pressed={layout === option} onClick={() => { setLayout(option); setLayoutOpen(false); }}>
          {layout === option && <span className="orientation-check" aria-hidden="true"><Icon name="check" size={14} /></span>}
          <Icon name={option} size={36} /><span>{{ portrait: 'Portrait', landscape: 'Landscape', square: 'Square' }[option]}</span><small>{{ portrait: '9:16', landscape: '16:9', square: '16:16' }[option]}</small>
        </button>)}
      </div>
    </Modal>}
    {saveOpen && savedClip && <Modal title="Your video is ready" onClose={requestDiscard}>
      {clipUrl && <video className="recorded-preview" src={clipUrl} controls playsInline />}
      <p className="muted">{formatTime(elapsed)} · {(savedClip.size / 1024 / 1024).toFixed(1)} MB · MP4</p>
      <label className="filename">File name<input autoFocus value={fileName} maxLength={120} onChange={(event) => setFileName(event.target.value)} placeholder="background-video" /></label>
      <div className="dialog-actions"><button className="primary icon-button" aria-label="Save MP4" title="Save MP4" disabled={!clipUrl} onClick={save}><Icon name="download" /></button></div>
    </Modal>}
    {discardOpen && savedClip && <Modal title="Delete this recording?" onClose={cancelDiscard}>
      <p className="confirmation-copy">This will delete the recorded video. Cancel to go back and save it.</p>
      <div className="dialog-actions">
        <button autoFocus className="icon-button" aria-label="Cancel, return to save video" title="Cancel" onClick={cancelDiscard}><Icon name="close" /></button>
        <button className="icon-button danger" aria-label="OK, delete" title="OK, delete" onClick={() => void discard()}><Icon name="trash" /></button>
      </div>
    </Modal>}
  </div>;
}
export default App;
