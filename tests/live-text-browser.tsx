import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { WebGLCompositor } from '../src/rendering/WebGLCompositor';
import { DEFAULT_LIVE_TEXT, drawLiveText } from '../src/rendering/liveText';
import { LiveTextHandle } from '../src/components/LiveTextHandle';
import { LiveTextControls } from '../src/components/LiveTextControls';
import '../src/index.css';

function Demo() {
  const [text, setText] = useState({ ...DEFAULT_LIVE_TEXT, enabled: true, text: 'Live caption' });
  const canvas = useRef<HTMLCanvasElement>(null);
  const [result, setResult] = useState('Checking composed canvas…');
  useEffect(() => {
    const source = document.createElement('canvas'); source.width = 1280; source.height = 720;
    const input = source.getContext('2d')!;
    input.fillStyle = '#31526b'; input.fillRect(0, 0, 1280, 720);
    const scene = document.createElement('canvas'); scene.width = 1280; scene.height = 720;
    const compositor = new WebGLCompositor(scene);
    compositor.render(source, new Uint8Array([255]), 1, 1, false, true);
    const output = canvas.current!.getContext('2d')!;
    output.drawImage(scene, 0, 0);
    const before = output.getImageData(0, 0, 1280, 720).data;
    drawLiveText(output, text, 1280, 720);
    const after = output.getImageData(0, 0, 1280, 720).data;
    const changed = after.some((value, index) => value !== before[index]);
    const stream = canvas.current!.captureStream(30);
    const captures = stream.getVideoTracks().length === 1;
    stream.getTracks().forEach((track) => track.stop());
    const expected = text.enabled && text.opacity > 0 && !!text.text.trim();
    setResult(changed === expected && captures ? 'PASS: text composited into capturable canvas' : 'FAIL: canvas composition');
    compositor.dispose();
  }, [text]);
  return <main style={{ padding: 20, maxWidth: 1000, margin: 'auto' }}>
    <h1>Live text browser check</h1><p role="status">{result}</p>
    <div style={{ position: 'relative', width: '100%', aspectRatio: '16/9', marginBlock: 20 }}>
      <canvas ref={canvas} width={1280} height={720} aria-label="Synthetic camera preview" style={{ width: '100%', height: '100%', display: 'block' }} />
      <LiveTextHandle value={text} width={1280} height={720} onChange={setText} />
    </div>
    <output aria-label="Text position">{Math.round(text.x)}, {Math.round(text.y)}</output>
    <LiveTextControls value={text} onChange={setText} canPosition onPosition={() => {}} />
  </main>;
}
createRoot(document.getElementById('root')!).render(<Demo />);
