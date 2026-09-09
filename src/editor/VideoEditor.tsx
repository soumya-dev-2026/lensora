import { useEffect, useRef, useState } from 'react';
import { Icon, type IconName } from '../components/Icon';
import { Modal } from '../components/Modal';
import { EditorEngine } from './EditorEngine';
import { clamp, defaultSettings, type AudioLayer, type EditSettings, type Overlay } from './model';
import '../App.css';
import './VideoEditor.css';

type Panel = 'trim' | 'crop' | 'audio' | 'text' | 'frame';
const timeLabel = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toFixed(1).padStart(4, '0')}`;
const errorText = (error: unknown) => error instanceof Error ? error.message : 'This file could not be processed.';
function Tool({ icon, label, active, disabled, onClick }: { icon: IconName; label: string; active?: boolean; disabled?: boolean; onClick: () => void }) {
  return <button className="icon-button" title={label} aria-label={label} aria-pressed={active} disabled={disabled} onClick={onClick}><Icon name={icon} /></button>;
}
function Slider({ label, value, min = 0, max = 100, step = 1, suffix = '%', onChange }: { label: string; value: number; min?: number; max?: number; step?: number; suffix?: string; onChange: (value: number) => void }) {
  return <label className="editor-slider"><span>{label}<output>{Number(value.toFixed(2))}{suffix}</output></span><input aria-label={label} type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}

export default function VideoEditor() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const engine = useRef<EditorEngine | null>(null);
  const urls = useRef(new Set<string>());
  const videoInput = useRef<HTMLInputElement>(null);
  const audioInput = useRef<HTMLInputElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const [settings, setSettings] = useState(defaultSettings);
  const [layers, setLayers] = useState<AudioLayer[]>([]);
  const [info, setInfo] = useState<{ name: string; duration: number; width: number; height: number } | null>(null);
  const [panel, setPanel] = useState<Panel>('trim');
  const [selected, setSelected] = useState<string | null>(null);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');
  const [name, setName] = useState('edited-video');
  const [saveOpen, setSaveOpen] = useState(false);
  const dragging = useRef(false);
  const locked = loading || exporting;
  const overlay = settings.overlays.find((item) => item.id === selected);
  const remember = (file: Blob) => { const url = URL.createObjectURL(file); urls.current.add(url); return url; };
  const release = (url: string) => { URL.revokeObjectURL(url); urls.current.delete(url); };

  useEffect(() => {
    let editor: EditorEngine;
    try {
      editor = new EditorEngine(canvas.current!);
      engine.current = editor;
      editor.onTime = (value, active) => { setTime(value); setPlaying(active); };
      editor.onError = setError; editor.onProgress = setProgress;
    } catch (error) { setError(errorText(error)); return; }
    const objectUrls = urls.current;
    return () => {
      editor.onTime = () => {}; editor.onError = () => {}; editor.onProgress = () => {};
      editor.dispose(); engine.current = null;
      objectUrls.forEach((url) => URL.revokeObjectURL(url)); objectUrls.clear();
    };
  }, []);
  useEffect(() => { if (engine.current) engine.current.settings = settings; }, [settings]);
  useEffect(() => { if (engine.current) engine.current.layers = layers; }, [layers]);

  const update = (patch: Partial<EditSettings>) => {
    setSettings((current) => ({ ...current, ...patch }));
    if (result) { release(result); setResult(''); }
  };
  const updateOverlay = (patch: Partial<Overlay>) => update({ overlays: settings.overlays.map((item) => item.id === selected ? { ...item, ...patch } : item) });
  const updateLayers = (next: AudioLayer[]) => { setLayers(next); if (result) { release(result); setResult(''); } };

  const uploadVideo = async (file?: File) => {
    if (!file || !engine.current) return;
    setLoading(true); setError(''); engine.current.pause();
    setInfo(null); setResult(''); setSaveOpen(false); setSelected(null);
    layers.forEach((layer) => engine.current!.removeAudio(layer.id));
    setLayers([]); engine.current.layers = [];
    urls.current.forEach((url) => URL.revokeObjectURL(url)); urls.current.clear();
    const defaults = defaultSettings(); setSettings(defaults); engine.current.settings = defaults;
    const url = remember(file);
    try {
      const metadata = await engine.current.load(url);
      setInfo({ ...metadata, name: file.name });
      const next = { ...defaults, end: metadata.duration };
      setSettings(next); engine.current!.settings = next;
      setName(`${file.name.replace(/\.[^.]+$/, '')}-edited`);
      setTime(0);
    } catch (error) { release(url); setError(errorText(error)); }
    finally { setLoading(false); }
  };
  const uploadAudio = async (files: FileList | null) => {
    if (!files || !engine.current) return;
    setLoading(true); setError(''); engine.current.pause();
    const added: AudioLayer[] = [];
    for (const file of Array.from(files)) {
      const layer: AudioLayer = { id: crypto.randomUUID(), name: file.name, url: remember(file), volume: 100, start: settings.start, duration: 0 };
      try { layer.duration = await engine.current.addAudio(layer); added.push(layer); }
      catch (error) { release(layer.url); setError(`${file.name}: ${errorText(error)}`); }
    }
    updateLayers([...layers, ...added]); setPanel('audio'); setLoading(false);
  };
  const addOverlay = (kind: 'text' | 'emoji') => {
    const item: Overlay = { id: crypto.randomUUID(), kind, text: kind === 'emoji' ? '😎' : 'Your text', x: 50, y: 50, size: kind === 'emoji' ? 14 : 8, color: '#ffffff' };
    update({ overlays: [...settings.overlays, item] }); setSelected(item.id); setPanel('text');
  };
  const uploadImage = async (file?: File) => {
    if (!file) return;
    setLoading(true); setError('');
    const url = remember(file);
    try {
      const image = new Image(); image.src = url; await image.decode();
      const item: Overlay = { id: crypto.randomUUID(), kind: 'image', text: file.name, x: 50, y: 50, size: 30, color: '#ffffff', image, url };
      update({ overlays: [...settings.overlays, item] }); setSelected(item.id); setPanel('text');
    } catch { release(url); setError('This image could not be decoded. Try PNG, JPG, or WebP.'); }
    finally { setLoading(false); }
  };
  const trim = (start: number, end: number) => {
    if (!info || !engine.current) return;
    const minimum = Math.min(.1, info.duration);
    const nextStart = clamp(start, 0, info.duration - minimum);
    const nextEnd = clamp(end, nextStart + minimum, info.duration);
    const next = { ...settings, start: nextStart, end: nextEnd };
    update(next); engine.current.settings = next;
    void engine.current.seek(clamp(time, nextStart, nextEnd)).catch((error) => setError(errorText(error)));
  };
  const cropPreset = (aspect: number | null) => {
    if (!info) return;
    if (aspect === null) { update({ crop: defaultSettings().crop }); return; }
    const sourceAspect = info.width / info.height;
    const width = sourceAspect > aspect ? aspect / sourceAspect * 100 : 100;
    const height = sourceAspect > aspect ? 100 : sourceAspect / aspect * 100;
    update({ crop: { x: (100 - width) / 2, y: (100 - height) / 2, width, height } });
  };
  const exportVideo = async () => {
    if (!engine.current) return;
    setError(''); setExporting(true); setProgress(0);
    try {
      const blob = await engine.current.exportMp4();
      if (result) release(result);
      setResult(remember(blob)); setSaveOpen(true);
    } catch (error) { setError(errorText(error)); }
    finally { setExporting(false); }
  };
  const download = () => {
    const link = document.createElement('a');
    link.href = result;
    link.download = `${name.trim().replace(/\.mp4$/i, '').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').slice(0, 120) || 'edited-video'}.mp4`;
    document.body.appendChild(link); link.click(); link.remove(); setSaveOpen(false);
  };
  const moveOverlay = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragging.current || !overlay || locked) return;
    const rect = event.currentTarget.getBoundingClientRect();
    updateOverlay({ x: clamp((event.clientX - rect.left) / rect.width * 100, 0, 100), y: clamp((event.clientY - rect.top) / rect.height * 100, 0, 100) });
  };

  return <div className="video-editor">
    <header className="editor-header">
      <a className="icon-button" href="/" aria-label="Back to camera" title="Back to camera" onClick={(event) => { if (locked) event.preventDefault(); }} aria-disabled={locked}><Icon name="back" /></a>
      <div><h1>Video editor</h1><p>{info?.name ?? 'Make it yours.'}</p></div>
      <div className="editor-header-actions">
        <Tool icon="upload" label="Upload video" disabled={locked} onClick={() => videoInput.current?.click()} />
        {result && <Tool icon="play" label="Review exported video" disabled={locked} onClick={() => setSaveOpen(true)} />}
        <button className="icon-button primary" aria-label="Export MP4" title="Export MP4" disabled={!info || locked} onClick={() => void exportVideo()}><Icon name="download" /></button>
      </div>
    </header>
    <input ref={videoInput} className="sr-only" tabIndex={-1} aria-label="Video file" type="file" accept="video/*" onChange={(event) => { void uploadVideo(event.target.files?.[0]); event.target.value = ''; }} />
    <input ref={audioInput} className="sr-only" tabIndex={-1} aria-label="Audio files" type="file" accept="audio/*" multiple onChange={(event) => { void uploadAudio(event.target.files); event.target.value = ''; }} />
    <input ref={imageInput} className="sr-only" tabIndex={-1} aria-label="Overlay image file" type="file" accept="image/png,image/jpeg,image/webp,image/avif" onChange={(event) => { void uploadImage(event.target.files?.[0]); event.target.value = ''; }} />
    <div className="editor-workspace">
      <nav className="editor-toolbar" aria-label="Editing tools">
        <Tool icon="trim" label="Trim video" active={panel === 'trim'} disabled={!info || locked} onClick={() => setPanel('trim')} />
        <Tool icon="crop" label="Crop video" active={panel === 'crop'} disabled={!info || locked} onClick={() => setPanel('crop')} />
        <Tool icon="audio" label="Audio mixer" active={panel === 'audio'} disabled={!info || locked} onClick={() => setPanel('audio')} />
        <span />
        <Tool icon="text" label="Add text" disabled={!info || locked} onClick={() => addOverlay('text')} />
        <Tool icon="image" label="Add image" disabled={!info || locked} onClick={() => imageInput.current?.click()} />
        <Tool icon="emoji" label="Add emoji" disabled={!info || locked} onClick={() => addOverlay('emoji')} />
        <Tool icon="frame" label="Video frame" active={panel === 'frame'} disabled={!info || locked} onClick={() => setPanel('frame')} />
      </nav>
      <main className="editor-main">
        <div className="editor-preview">
          <canvas ref={canvas} width={1280} height={720} aria-label="Edited video preview" className={overlay ? 'can-drag' : ''}
            onPointerDown={(event) => { if (!overlay || locked) return; dragging.current = true; event.currentTarget.setPointerCapture(event.pointerId); moveOverlay(event); }}
            onPointerMove={moveOverlay} onPointerUp={() => { dragging.current = false; }} onPointerCancel={() => { dragging.current = false; }} />
          {!info && <div className="editor-empty"><Icon name="edit" size={40} /><h2>Your next cut starts here</h2><p>Upload a video. Trim, mix, and make it yours.</p><button className="icon-button primary" aria-label="Choose a video" title="Choose a video" disabled={locked} onClick={() => videoInput.current?.click()}><Icon name="plus" /></button><small>Files stay on your device.</small></div>}
        </div>
        <div className="editor-playback">
          <Tool icon={playing ? 'pause' : 'play'} label={playing ? 'Pause preview' : 'Play preview'} disabled={!info || locked} onClick={() => { if (playing) engine.current?.pause(); else void engine.current?.play().catch((error) => setError(errorText(error))); }} />
          <span>{timeLabel(time)} <i>/ {timeLabel(info?.duration ?? 0)}</i></span>
          <Tool icon={settings.muted ? 'volumeOff' : 'volume'} label={settings.muted ? 'Unmute video audio' : 'Mute video audio'} active={!settings.muted} disabled={!info || locked} onClick={() => update({ muted: !settings.muted })} />
        </div>
        <div className="editor-timeline">
          <input aria-label="Video playhead" type="range" min={settings.start} max={settings.end || 1} step={.01} value={clamp(time, settings.start, settings.end || 1)} disabled={!info || locked} onChange={(event) => void engine.current?.seek(Number(event.target.value)).catch((error) => setError(errorText(error)))} />
          <div><span>{timeLabel(settings.start)}</span><span>{timeLabel(settings.end - settings.start)} selected</span><span>{timeLabel(settings.end)}</span></div>
          {layers.map((layer) => <div className="audio-timeline-row" key={layer.id}><Icon name="audio" size={13} /><span>{layer.name}</span><small>{layer.volume}% · starts {timeLabel(layer.start)}</small></div>)}
        </div>
        {loading && <p className="editor-notice" role="status">Preparing media…</p>}
        {error && <p className="editor-notice error" role="alert">{error}</p>}
        {exporting && <div className="editor-export" role="status"><div><strong>Exporting {Math.round(progress * 100)}%</strong><small>Keep this page visible. Export runs in real time.</small></div><progress max={1} value={progress} /><Tool icon="close" label="Cancel export" onClick={() => engine.current?.cancelExport()} /></div>}
      </main>
      <aside className="editor-inspector">
        <fieldset disabled={!info || locked}>
          {panel === 'trim' && <><h2>Trim</h2><p>Choose the part you want to keep.</p><label className="editor-number">Start <span><input aria-label="Trim start seconds" type="number" min={0} max={Math.max(0, settings.end - .1)} step={.1} value={Number(settings.start.toFixed(2))} onChange={(event) => { if (event.target.value !== '') trim(Math.min(Number(event.target.value), settings.end - Math.min(.1, info?.duration ?? .1)), settings.end); }} />s</span></label><label className="editor-number">End <span><input aria-label="Trim end seconds" type="number" min={settings.start + Math.min(.1, info?.duration ?? .1)} max={info?.duration ?? 0} step={.1} value={Number(settings.end.toFixed(2))} onChange={(event) => { if (event.target.value !== '') trim(settings.start, Number(event.target.value)); }} />s</span></label><Slider label="Start" value={settings.start} max={Math.max(0, settings.end - .1)} step={.1} suffix="s" onChange={(value) => trim(value, settings.end)} /><Slider label="End" value={settings.end} min={settings.start + Math.min(.1, info?.duration ?? .1)} max={info?.duration ?? 1} step={.1} suffix="s" onChange={(value) => trim(settings.start, value)} /><Tool icon="reset" label="Reset trim" onClick={() => trim(0, info!.duration)} /></>}
          {panel === 'crop' && <><h2>Crop</h2><p>Crop the source. Overlays follow the output.</p><div className="crop-presets"><button onClick={() => cropPreset(null)}>Original</button><button onClick={() => cropPreset(16 / 9)}>16:9</button><button onClick={() => cropPreset(9 / 16)}>9:16</button><button onClick={() => cropPreset(1)}>1:1</button></div><Slider label="Left" value={settings.crop.x} max={100 - settings.crop.width} onChange={(x) => update({ crop: { ...settings.crop, x } })} /><Slider label="Top" value={settings.crop.y} max={100 - settings.crop.height} onChange={(y) => update({ crop: { ...settings.crop, y } })} /><Slider label="Width" value={settings.crop.width} min={1} onChange={(width) => update({ crop: { ...settings.crop, width, x: Math.min(settings.crop.x, 100 - width) } })} /><Slider label="Height" value={settings.crop.height} min={1} onChange={(height) => update({ crop: { ...settings.crop, height, y: Math.min(settings.crop.y, 100 - height) } })} /></>}
          {panel === 'audio' && <><div className="inspector-heading"><h2>Audio mixer</h2><Tool icon="plus" label="Add audio files" onClick={() => audioInput.current?.click()} /></div><p>Each track has its own volume. Start times use the original video timeline.</p><div className="audio-original"><span>Original video</span><Tool icon={settings.muted ? 'volumeOff' : 'volume'} label={settings.muted ? 'Enable original audio' : 'Mute original audio'} active={!settings.muted} onClick={() => update({ muted: !settings.muted })} /></div>{layers.map((layer) => <div className="audio-layer" key={layer.id}><div><strong title={layer.name}>{layer.name}</strong><Tool icon="trash" label={`Remove ${layer.name}`} onClick={() => { engine.current?.removeAudio(layer.id); release(layer.url); updateLayers(layers.filter((item) => item.id !== layer.id)); }} /></div><Slider label={`Volume: ${layer.name}`} value={layer.volume} onChange={(volume) => updateLayers(layers.map((item) => item.id === layer.id ? { ...item, volume } : item))} /><label className="editor-number">Start <span><input aria-label={`Start time: ${layer.name}`} type="number" min={0} max={info?.duration ?? 0} step={.1} value={layer.start} onChange={(event) => updateLayers(layers.map((item) => item.id === layer.id ? { ...item, start: clamp(Number(event.target.value), 0, info?.duration ?? 0) } : item))} />s</span></label><small>{timeLabel(layer.duration)} long</small></div>)}{!layers.length && <p className="editor-hint">Add music, voice, or sound effects with +.</p>}</>}
          {panel === 'text' && <><h2>Overlays</h2><p>Select a layer, then drag it on the video or adjust its position.</p><div className="overlay-list">{settings.overlays.map((item, index) => <button key={item.id} aria-pressed={item.id === selected} onClick={() => setSelected(item.id)}><Icon name={item.kind === 'image' ? 'image' : item.kind === 'emoji' ? 'emoji' : 'text'} size={16} /><span>{item.text || `Layer ${index + 1}`}</span></button>)}</div>{overlay && <>{overlay.kind !== 'image' && <label className="editor-field">{overlay.kind === 'emoji' ? 'Emoji' : 'Text'}<textarea aria-label="Overlay content" value={overlay.text} maxLength={500} rows={3} onChange={(event) => updateOverlay({ text: event.target.value })} /></label>}{overlay.kind === 'emoji' && <div className="emoji-options">{['😎', '❤️', '🔥', '✨', '🎉', '👍', '😂', '🌟'].map((emoji) => <button key={emoji} aria-label={`Use ${emoji}`} onClick={() => updateOverlay({ text: emoji })}>{emoji}</button>)}</div>}<Slider label="Horizontal position" value={overlay.x} onChange={(x) => updateOverlay({ x })} /><Slider label="Vertical position" value={overlay.y} onChange={(y) => updateOverlay({ y })} /><Slider label="Size" value={overlay.size} min={1} max={overlay.kind === 'image' ? 100 : 40} onChange={(size) => updateOverlay({ size })} />{overlay.kind === 'text' && <label className="editor-color">Text color<input aria-label="Text color" type="color" value={overlay.color} onChange={(event) => updateOverlay({ color: event.target.value })} /></label>}<div className="editor-layer-actions"><Tool icon="plus" label="Bring overlay to front" onClick={() => update({ overlays: [...settings.overlays.filter((item) => item.id !== selected), overlay] })} /><Tool icon="trash" label="Delete overlay" onClick={() => { if (overlay.url) release(overlay.url); update({ overlays: settings.overlays.filter((item) => item.id !== selected) }); setSelected(null); }} /></div></>}</>}
          {panel === 'frame' && <><h2>Video frame</h2><p>A finishing border, included in your export.</p><div className="frame-options">{(['none', 'border', 'cinema', 'polaroid'] as const).map((frame) => <button key={frame} aria-pressed={settings.frame === frame} onClick={() => update({ frame, frameColor: frame === 'cinema' ? '#000000' : settings.frameColor })}><span className={`frame-swatch ${frame}`} /><span>{frame}</span></button>)}</div>{settings.frame !== 'none' && <><Slider label="Frame thickness" value={settings.frameWidth} min={1} max={15} onChange={(frameWidth) => update({ frameWidth })} /><label className="editor-color">Frame color<input aria-label="Frame color" type="color" value={settings.frameColor} onChange={(event) => update({ frameColor: event.target.value })} /></label></>}</>}
        </fieldset>
        <p className="editor-footnote">MP4 · up to 1920px longest edge · 30 fps<br />Your originals stay unchanged.</p>
      </aside>
    </div>
    {saveOpen && result && <Modal title="Your edit is ready" onClose={() => setSaveOpen(false)}><video className="recorded-preview" src={result} controls playsInline /><label className="filename">File name<input value={name} maxLength={120} onChange={(event) => setName(event.target.value)} /></label><div className="dialog-actions"><button className="icon-button primary" aria-label="Save edited MP4" title="Save edited MP4" onClick={download}><Icon name="download" /></button></div></Modal>}
  </div>;
}
