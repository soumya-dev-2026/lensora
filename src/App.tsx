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
import './App.css';

type RecordingState = 'idle' | 'starting' | 'recording' | 'paused' | 'stopping';
const formatTime = (ms: number) => {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
};

function App() {
  const [filters, setFilters] = useState({ ...DEFAULT_FILTERS });
  const [faceState, setFaceState] = useState<FaceTrackingState>('off');
  const [layout, setLayout] = useState<CanvasLayout>('portrait');
  const [layoutOpen, setLayoutOpen] = useState(false);
  const [background, setBackground] = useState<BackgroundSelection>({ kind: 'image', value: BACKGROUNDS[0].src });
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
  const audioRef = useRef(new RecordingAudio());
  const [clipUrl, setClipUrl] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const studioRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const pendingStart = useRef(false);
  const accumulated = useRef(0);
  const startedAt = useRef(0);
  const { videoRef, isActive, facingMode, error, startCamera, stopCamera, switchCamera, isSupported, hasMultipleCameras } = useCamera();
  const busy = recordingState !== 'idle';
  const showTimer = recordingState === 'recording' || recordingState === 'paused' || recordingState === 'stopping';

  const handleProcessingState = useCallback((state: typeof processing, message?: string) => {
    setProcessing(state);
    setProcessingError(message);
  }, []);

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

  useEffect(() => {
    if (pendingStart.current && isActive && processing === 'ready' && micReady.current) {
      pendingStart.current = false;
      beginRecording();
    }
    if (error || processing === 'error') {
      pendingStart.current = false;
      setRecordingState((current) => current === 'starting' ? 'idle' : current);
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== 'inactive') {
        setRecordingError('Camera processing stopped. Save the video captured so far.');
        recorder.stop();
      }
    }
  }, [isActive, processing, error, beginRecording, micPending]);

  const record = async () => {
    if (savedClip) { setSaveOpen(true); return; }
    setRecordingError(null);
    setRecordingState('starting');
    try { await audioRef.current.resume(); }
    catch { setRecordingError('Audio recording is unavailable in this browser.'); setRecordingState('idle'); return; }
    if (isActive && processing === 'ready' && micReady.current) { beginRecording(); return; }
    pendingStart.current = true;
    setRecordingState('starting');
    if (!isActive) await startCamera();
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
  const message = error || processingError || recordingError;

  return <div className="studio" ref={studioRef}>
    <main className="stage" aria-label="Camera studio">
      <CameraPreview layout={layout} videoRef={videoRef} canvasRef={canvasRef} isActive={isActive} facingMode={facingMode} background={background} blur={blur} tint={tint} filters={filters} onFaceTrackingState={setFaceState} onProcessingState={handleProcessingState} />
    </main>
    {showTimer && <div className={`recording-time ${recordingState === 'recording' ? 'live' : ''}`} role="timer" aria-label={`${recordingState === 'paused' ? 'Paused' : 'Recording time'} ${formatTime(elapsed)}`}>
      {recordingState === 'paused' ? <Icon name="pause" size={12} /> : <i aria-hidden="true" />}{formatTime(elapsed)}
    </div>}
    <div className="top-left">
      <BackgroundPicker selected={background} onSelect={setBackground} blur={blur} tint={tint} onBlur={setBlur} onTint={setTint} />
      <a className="icon-button glass" href="/editor" aria-disabled={busy} onClick={(event) => { if (busy) event.preventDefault(); }} aria-label="Open video editor" title="Video editor"><Icon name="edit" /></a>
      <CameraFilters value={filters} onChange={setFilters} faceState={faceState} />
    </div>
    <div className="top-right">
      <button className="icon-button glass" aria-label="Canvas orientation" title="Canvas orientation" aria-haspopup="dialog" disabled={busy} onClick={() => setLayoutOpen(true)}><Icon name={layout} /></button>
      <button className="icon-button glass" aria-label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'} title={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'} onClick={() => void toggleFullscreen()}><Icon name={fullscreen ? 'collapse' : 'expand'} /></button>
    </div>
    <div className="status-area" aria-live="polite">
      {!isSupported && <p role="alert">Camera access is unavailable. Open this app over HTTPS in a camera-capable browser.</p>}
      {message && <p role="alert">{message}</p>}
      {processing === 'loading' && <p>Preparing your camera and background…</p>}
      {isActive && processing === 'error' && !busy && <button className="icon-button glass" aria-label="Reset camera" title="Reset camera" onClick={stopCamera}><Icon name="reset" /></button>}
      {savedClip && !saveOpen && !discardOpen && <div className="clip-actions"><button className="icon-button glass" aria-label="Review and save video" title="Review and save video" onClick={() => setSaveOpen(true)}><Icon name="download" /></button><button className="icon-button glass" aria-label="New recording" title="New recording" onClick={requestDiscard}><Icon name="plus" /></button></div>}
    </div>
    <button className="icon-button glass microphone-toggle" aria-label={micMuted ? 'Unmute microphone' : 'Mute microphone'} title={micMuted ? 'Unmute microphone' : 'Mute microphone'} aria-pressed={!micMuted} disabled={!isActive || micPending || recordingState === 'stopping'} onClick={() => void toggleMicrophone()}><Icon name={micMuted ? 'micOff' : 'mic'} /></button>
    <div className="record-controls">
      <button className="icon-button glass camera-toggle" aria-label={isActive ? 'Camera off' : 'Start camera'} title={isActive ? 'Camera off' : 'Start camera'} disabled={!isSupported || busy} onClick={() => isActive ? stopCamera() : void startCamera()}><Icon name={isActive ? 'cameraOff' : 'camera'} /></button>
      {recordingState === 'recording' || recordingState === 'paused' ? <>
        <button className="record-small pause" aria-label={recordingState === 'paused' ? 'Resume recording' : 'Pause recording'} title={recordingState === 'paused' ? 'Resume recording' : 'Pause recording'} onClick={pauseOrResume}><Icon name={recordingState === 'paused' ? 'play' : 'pause'} /></button>
        <button className="record-small stop" aria-label="Stop recording" title="Stop recording" onClick={stop}><Icon name="stop" /></button>
      </> : <>
        <button className="record-button" aria-label={savedClip ? 'Review recording' : 'Start recording'} title={savedClip ? 'Review recording' : 'Start recording'} disabled={!isSupported || busy || (isActive && processing === 'error')} onClick={() => void record()}>{savedClip ? <Icon name="play" size={26} /> : <span />}</button>
      </>}
      {hasMultipleCameras && <button className="icon-button glass camera-switch" aria-label="Switch camera" title="Switch camera" disabled={!isActive || busy} onClick={() => void switchCamera()}><Icon name="switchCamera" /></button>}
      {(recordingState === 'starting' || recordingState === 'stopping') && <span className="record-caption" role="status">{recordingState === 'starting' ? 'Getting ready…' : 'Finishing…'}</span>}
    </div>
    {layoutOpen && <Modal title="Canvas orientation" onClose={() => setLayoutOpen(false)}>
      <div className="orientation-options" role="group" aria-label="Canvas orientation">
        {(['portrait', 'landscape', 'square'] as const).map((option) => <button key={option} disabled={busy} aria-pressed={layout === option} onClick={() => { setLayout(option); setLayoutOpen(false); }}>
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
