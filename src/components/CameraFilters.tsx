import { useState } from 'react';
import { CameraFilters as FilterSettings, DEFAULT_FILTERS, FaceTrackingState } from '../types/filters';
import { Icon, IconName } from './Icon';
import { GaugeSlider } from './GaugeSlider';

type FilterKey = Exclude<keyof FilterSettings, 'enabled' | 'look'>;
const beautyControls: { key: FilterKey; label: string; icon: IconName }[] = [
  { key: 'skinBrightening', label: 'Skin brightening', icon: 'sun' },
  { key: 'skinSmoothing', label: 'Skin smoothness', icon: 'smooth' },
  { key: 'eyeSize', label: 'Larger eyes', icon: 'eye' },
  { key: 'redLips', label: 'Red lips', icon: 'lips' },
  { key: 'darkHair', label: 'Darker hair', icon: 'hair' },
];
const colorControls: typeof beautyControls = [
  { key: 'brightness', label: 'Brightness', icon: 'sun' },
  { key: 'whiteBalance', label: 'White balance', icon: 'temperature' },
  { key: 'saturation', label: 'Saturation', icon: 'saturation' },
  { key: 'sharpen', label: 'Sharpen', icon: 'sun' },
  { key: 'contrast', label: 'Contrast', icon: 'contrast' },
];

export function CameraFilters({ value, onChange, faceState }: {
  value: FilterSettings; onChange: (value: FilterSettings) => void; faceState: FaceTrackingState;
}) {
  const [tab, setTab] = useState<'beauty' | 'color'>('beauty');
  const [beautyIndex, setBeautyIndex] = useState(0);
  const [colorIndex, setColorIndex] = useState(0);
  const controls = tab === 'beauty' ? beautyControls : colorControls;
  const selected = controls[tab === 'beauty' ? beautyIndex : colorIndex];
  return <>
      <div className="effect-choice-group filter-looks" role="group" aria-label="Preset looks">
        <h3>Preset looks</h3>
        <div className="effect-tiles">{(['none', 'natural', 'cinematic', 'warm', 'cool', 'vintage'] as const).map((look) => <button type="button" key={look} disabled={!value.enabled} aria-pressed={value.look === look} onClick={() => onChange({ ...value, look })}>
          <span className={`look-preview look-preview-${look}`} /><span>{look === 'none' ? 'Original' : look[0].toUpperCase() + look.slice(1)}</span>
          {value.look === look && <span className="selected-check"><Icon name="check" size={12} /></span>}
        </button>)}</div>
        {value.look !== 'none' && <GaugeSlider id="look-intensity" label="Look strength" icon="palette" value={value.lookIntensity} disabled={!value.enabled} onChange={(lookIntensity) => onChange({ ...value, lookIntensity })} />}
      </div>
      <div className="filter-tabs" role="group" aria-label="Filter category">
        <button aria-pressed={tab === 'beauty'} onClick={() => setTab('beauty')}><Icon name="sparkle" size={17} />Beauty</button>
        <button aria-pressed={tab === 'color'} onClick={() => setTab('color')}><Icon name="sliders" size={17} />Light & color</button>
      </div>
      <div className="effect-options" role="group" aria-label={tab === 'beauty' ? 'Beauty effects' : 'Color adjustments'}>
        {controls.map((control, index) => <button key={control.key} className="effect-option" aria-label={control.label} title={control.label} aria-pressed={selected.key === control.key} onClick={() => tab === 'beauty' ? setBeautyIndex(index) : setColorIndex(index)}>
          <Icon name={control.icon} size={23} /><span>{control.label}</span>
          {value[control.key] !== 0 && <i className="effect-dot" />}
        </button>)}
      </div>
      <div className="filter-gauge"><GaugeSlider id={`filter-${selected.key}`} label={selected.label} icon={selected.icon} disabled={!value.enabled} value={value[selected.key]} min={tab === 'beauty' || selected.key === 'sharpen' ? 0 : -100} suffix={tab === 'beauty' ? '%' : ''} onChange={(next) => onChange({ ...value, [selected.key]: next })} /></div>
      {selected.key === 'whiteBalance' && <p className="muted">Negative values cool the image; positive values add warmth.</p>}
      {tab === 'beauty' && ['loading', 'error', 'no-face'].includes(faceState) && <p className="muted" role="status">{
        faceState === 'loading' ? 'Preparing face effects…' :
        faceState === 'error' ? 'Face tracking unavailable. Restart the camera to retry.' :
        'Face the camera for eye and lip effects.'
      }</p>}
      <div className="popup-footer">
        <label className="filter-toggle"><input type="checkbox" role="switch" checked={value.enabled} onChange={(event) => onChange({ ...value, enabled: event.target.checked })} /><Icon name="sparkle" size={17} /><span>Enable filters</span></label>
        <button className="icon-button" aria-label="Reset all filters" title="Reset all filters" onClick={() => onChange({ ...DEFAULT_FILTERS })}><Icon name="reset" size={18} /></button>
      </div>
  </>;
}
