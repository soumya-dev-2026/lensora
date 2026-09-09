import { useCallback, useEffect, useRef, useState } from 'react';
import { useCamera } from './hooks/useCamera';
import { CameraPreview } from './components/CameraPreview';
import { BackgroundPicker, BACKGROUNDS } from './components/BackgroundPicker';
import { Modal } from './components/Modal';
import { BackgroundSelection, CanvasLayout } from './types/camera';
import { getMp4MimeType } from './recording/mp4';
import './App.css';

type RecordingState = 'idle' | 'starting' | 'recording' | 'paused' | 'stopping';
const formatTime = (ms: number) => {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
};

function App() {
  const [layout, setLayout] = useState<CanvasLayout>('landscape');
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

  useEffect(() => () => {
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
      const mimeType = getMp4MimeType((type) => MediaRecorder.isTypeSupported(type));
      stream = canvas.captureStream(30);
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
    if (pendingStart.current && isActive && processing === 'ready') {
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
  }, [isActive, processing, error, beginRecording]);

  const record = async () => {
    if (savedClip) { setSaveOpen(true); return; }
    setRecordingError(null);
    if (isActive && processing === 'ready') { beginRecording(); return; }
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
  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await studioRef.current?.requestFullscreen();
    } catch { setRecordingError('Fullscreen is unavailable in this browser. The canvas still fills the studio view.'); }
  };
  const message = error || processingError || recordingError;

  return <div className="studio" ref={studioRef}>
    <main className="stage" aria-label="Camera studio">
      <CameraPreview layout={layout} videoRef={videoRef} canvasRef={canvasRef} isActive={isActive} facingMode={facingMode} background={background} blur={blur} tint={tint} onProcessingState={handleProcessingState} />
    </main>
    <div className="top-left">
      <div className={`recording-time ${recordingState === 'recording' ? 'live' : ''}`} role="timer" aria-label={`Recording time ${formatTime(elapsed)}`}><i />{formatTime(elapsed)}<span>{recordingState === 'paused' ? 'PAUSED' : recordingState === 'recording' ? 'REC' : 'STUDIO'}</span></div>
      <BackgroundPicker selected={background} onSelect={setBackground} blur={blur} tint={tint} onBlur={setBlur} onTint={setTint} />
    </div>
    <div className="top-right">
      <label className="layout-control"><span className="sr-only">Canvas orientation</span><select aria-label="Canvas orientation" value={layout} disabled={busy} onChange={(event) => setLayout(event.target.value as CanvasLayout)}><option value="landscape">Landscape · 16:9</option><option value="portrait">Portrait · 9:16</option></select></label>
      <button className="glass" aria-label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'} onClick={() => void toggleFullscreen()}>⛶</button>
    </div>
    <div className="status-area" aria-live="polite">
      {!isSupported && <p role="alert">Camera access is unavailable. Open this app over HTTPS in a camera-capable browser.</p>}
      {message && <p role="alert">{message}</p>}
      {processing === 'loading' && <p>Preparing your camera and background…</p>}
      {!isActive && isSupported && recordingState === 'idle' && <button className="primary" onClick={() => void startCamera()}>Start camera</button>}
      {isActive && processing === 'error' && !busy && <button onClick={stopCamera}>Reset camera</button>}
      {savedClip && !saveOpen && <div className="clip-actions"><button onClick={() => setSaveOpen(true)}>Review & save video</button><button onClick={() => { setSavedClip(null); setElapsed(0); }}>New recording</button></div>}
    </div>
    <div className="bottom-left"><span className="brand">BACKGROUND STUDIO</span><small>Processed on your device</small></div>
    <div className="record-controls">
      {recordingState === 'recording' || recordingState === 'paused' ? <>
        <button className="record-small pause" aria-label={recordingState === 'paused' ? 'Resume recording' : 'Pause recording'} onClick={pauseOrResume}>{recordingState === 'paused' ? '▶' : 'Ⅱ'}</button>
        <button className="record-small stop" aria-label="Stop recording" onClick={stop}><span /></button>
        <span className="record-caption">{recordingState === 'paused' ? 'Resume' : 'Pause'} / Stop</span>
      </> : <>
        <button className="record-button" aria-label={savedClip ? "Review recording" : "Start recording"} disabled={!isSupported || busy || (isActive && processing === 'error')} onClick={() => void record()}><span /></button>
        <span className="record-caption">{recordingState === 'starting' ? 'Getting ready…' : recordingState === 'stopping' ? 'Finishing…' : savedClip ? 'Review recording' : 'Record'}</span>
      </>}
    </div>
    <div className="bottom-right">
      {hasMultipleCameras && <button className="glass" disabled={!isActive || busy} onClick={() => void switchCamera()}>Switch camera</button>}
      {isActive && <button className="glass" disabled={busy} onClick={stopCamera}>Camera off</button>}
    </div>
    {saveOpen && savedClip && <Modal title="Your video is ready" onClose={() => setSaveOpen(false)}>
      {clipUrl && <video className="recorded-preview" src={clipUrl} controls playsInline />}
      <p className="muted">{formatTime(elapsed)} · {(savedClip.size / 1024 / 1024).toFixed(1)} MB · MP4 · Video only</p>
      <label className="filename">File name<input autoFocus value={fileName} maxLength={120} onChange={(event) => setFileName(event.target.value)} placeholder="background-video" /></label>
      <button className="primary" disabled={!clipUrl} onClick={save}>Save MP4</button>
    </Modal>}
  </div>;
}
export default App;
