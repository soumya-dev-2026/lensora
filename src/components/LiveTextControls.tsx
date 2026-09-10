import { Icon } from './Icon';
import { GaugeSlider } from './GaugeSlider';
import { TEXT_FONTS, textFont, type LiveText } from '../rendering/liveText';
import './LiveText.css';

export function LiveTextControls({ value, onChange, onPosition, canPosition }: { value: LiveText; canPosition: boolean; onChange: (value: LiveText) => void; onPosition: () => void }) {
  const update = (patch: Partial<LiveText>) => onChange({ ...value, ...patch });
  const font = textFont(value);
  return <div className="live-text-controls">
    <label className="filter-toggle"><input type="checkbox" role="switch" checked={value.enabled} onChange={(event) => update({ enabled: event.target.checked })} />Show text on video</label>
    <label className="live-text-field">Your text<textarea value={value.text} maxLength={240} rows={3} onChange={(event) => update({ text: event.target.value, enabled: true })} /></label>
    <p className="live-text-hint">Changes appear in your recording immediately. Close this panel to drag the text on your video.</p>
    <div className="live-text-sample" aria-label="Text style preview"><span style={{ textAlign: value.align ?? 'center', fontFamily: font.family, fontWeight: font.weight, fontStyle: font.style, color: value.color, opacity: value.opacity / 100, fontSize: Math.max(12, value.size / 2) }}>{value.text || 'Your text'}</span></div>
    <div className="live-text-alignment" role="group" aria-label="Text alignment">
      {(['left', 'center', 'right'] as const).map((align) => <button key={align} type="button" aria-label={`Align text ${align}`} title={`Align ${align}`} aria-pressed={(value.align ?? 'center') === align} onClick={() => update({ align })}><Icon name={{ left: 'alignLeft', center: 'alignCenter', right: 'alignRight' }[align] as 'alignLeft' | 'alignCenter' | 'alignRight'} /></button>)}
    </div>
    <label className="live-text-color">Text color<input type="color" value={value.color} onChange={(event) => update({ color: event.target.value })} /></label>
    <div role="group" aria-label="Font style" className="live-text-fonts">
      {TEXT_FONTS.map((choice) => <button key={choice.id} type="button" aria-pressed={value.font === choice.id} onClick={() => update({ font: choice.id })}><span style={{ fontFamily: choice.family, fontWeight: choice.weight, fontStyle: choice.style }}>Aa</span><small>{choice.name}</small></button>)}
    </div>
    <div className="effect-gauge-pair live-text-gauges">
      <GaugeSlider label="Font size" icon="text" min={16} max={120} suffix="px" value={value.size} onChange={(size) => update({ size })} />
      <GaugeSlider label="Text opacity" icon="text" value={value.opacity} onChange={(opacity) => update({ opacity })} />
    </div>
    <button type="button" className="primary" disabled={!value.text.trim() || !canPosition} onClick={() => { update({ enabled: true }); onPosition(); }}>{canPosition ? 'Position on video' : 'Start camera to position text'}</button>
    <button type="button" onClick={() => update({ x: 50, y: 50 })}>Center text</button>
    <button type="button" disabled={!value.text} onClick={() => update({ text: '', enabled: false })}>Remove text</button>
  </div>;
}
