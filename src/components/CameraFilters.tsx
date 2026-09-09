import { useState } from 'react';
import { CameraFilters as FilterSettings, DEFAULT_FILTERS, FaceTrackingState } from '../types/filters';
import { Icon, IconName } from './Icon';
import { Modal } from './Modal';

type FilterKey = Exclude<keyof FilterSettings, 'enabled'>;
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
  { key: 'contrast', label: 'Contrast', icon: 'contrast' },
];

export function CameraFilters({ value, onChange, faceState }: {
  value: FilterSettings; onChange: (value: FilterSettings) => void; faceState: FaceTrackingState;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'beauty' | 'color'>('beauty');
  const [beautyIndex, setBeautyIndex] = useState(0);
  const [colorIndex, setColorIndex] = useState(0);
  const controls = tab === 'beauty' ? beautyControls : colorControls;
  const selected = controls[tab === 'beauty' ? beautyIndex : colorIndex];
  return <>
    <button className="icon-button glass" aria-label="Camera filters" title="Camera filters" aria-haspopup="dialog" onClick={() => setOpen(true)}><Icon name="sparkle" /></button>
    {open && <Modal title="Camera filters" onClose={() => setOpen(false)}>
      <div className="filter-tabs" role="group" aria-label="Filter category">
        <button aria-pressed={tab === 'beauty'} onClick={() => setTab('beauty')}><Icon name="sparkle" size={17} />Beauty</button>
        <button aria-pressed={tab === 'color'} onClick={() => setTab('color')}><Icon name="sliders" size={17} />Light & color</button>
      </div>
      <div className="effect-options" role="group" aria-label={tab === 'beauty' ? 'Beauty effects' : 'Color adjustments'}>
        {controls.map((control, index) => <button key={control.key} className="effect-option" aria-label={control.label} title={control.label} aria-pressed={selected.key === control.key} onClick={() => tab === 'beauty' ? setBeautyIndex(index) : setColorIndex(index)}>
          <Icon name={control.icon} size={23} />
          {value[control.key] !== 0 && <i className="effect-dot" />}
        </button>)}
      </div>
      <div className="sliders">
        <label htmlFor={`filter-${selected.key}`}>{selected.label}<output aria-hidden="true">{value[selected.key]}{tab === 'beauty' ? '%' : ''}</output></label>
        <input id={`filter-${selected.key}`} disabled={!value.enabled} type="range" min={tab === 'beauty' ? 0 : -100} max="100" value={value[selected.key]} onChange={(event) => onChange({ ...value, [selected.key]: Number(event.target.value) })} />
        {selected.key === 'whiteBalance' && <div className="slider-ends"><span>Cool</span><span>Warm</span></div>}
      </div>
      {tab === 'beauty' && ['loading', 'error', 'no-face'].includes(faceState) && <p className="muted" role="status">{
        faceState === 'loading' ? 'Preparing face effects…' :
        faceState === 'error' ? 'Face tracking unavailable. Restart the camera to retry.' :
        'Face the camera for eye and lip effects.'
      }</p>}
      <div className="popup-footer">
        <label className="filter-toggle"><input type="checkbox" role="switch" checked={value.enabled} onChange={(event) => onChange({ ...value, enabled: event.target.checked })} /><span>Enable filters</span></label>
        <button className="icon-button" aria-label="Reset all filters" title="Reset all filters" onClick={() => onChange({ ...DEFAULT_FILTERS })}><Icon name="reset" size={18} /></button>
      </div>
    </Modal>}
  </>;
}
