import { SwipeSlider } from './SwipeSlider';
import { useId, useState } from 'react';
import { CameraEffects as EffectSettings, DEFAULT_EFFECTS } from '../types/effects';
import type { FaceTrackingState } from '../types/filters';
import { Icon, IconName } from './Icon';
import { GaugeSlider } from './GaugeSlider';

const categories = [
  { key: 'face', label: 'Face', icon: 'emoji' },
  { key: 'scene', label: 'Scene', icon: 'image' },
  { key: 'style', label: 'Style', icon: 'palette' },
] as const;
type Category = typeof categories[number]['key'];
type Choice<T extends string> = { value: T; label: string; icon: IconName };
function Choices<T extends string>({ label, value, options, onChange }: {
  label: string; value: T; options: Choice<T>[]; onChange: (value: T) => void;
}) {
  return <div className="effect-choice-group" role="group" aria-label={label}>
    <h3>{label}</h3>
    <SwipeSlider label={label} className="effect-tiles" selectedKey={value}>{options.map((option) => <button type="button" key={option.value} aria-pressed={value === option.value} onClick={() => onChange(option.value)}>
      <Icon name={option.icon} size={24} /><span>{option.label}</span>
      {value === option.value && <span className="selected-check"><Icon name="check" size={12} /></span>}
    </button>)}</SwipeSlider>
  </div>;
}

export function CameraEffects({ value, onChange, faceState }: {
  value: EffectSettings; onChange: (value: EffectSettings) => void; faceState: FaceTrackingState;
}) {
  const [category, setCategory] = useState<Category>('face');
  const id = useId();
  const set = <K extends keyof EffectSettings>(key: K, next: EffectSettings[K]) => onChange({ ...value, [key]: next });
  const needsFace = value.wavyBorder || value.sticker !== 'none' || value.distortion > 0;
  const slider = (key: 'spotlight' | 'distortion' | 'grain' | 'glitch' | 'vignette' | 'outline', label: string, icon: IconName) => <GaugeSlider id={`effect-${key}`} label={label} icon={icon} value={value[key]} disabled={!value.enabled} onChange={(next) => set(key, next)} />;
  const toggle = (key: 'wavyBorder' | 'monochrome' | 'sepia', label: string, icon: IconName) => <button type="button" className="effect-toggle-tile" aria-pressed={value[key]} onClick={() => set(key, !value[key])}>
    <Icon name={icon} size={22} /><span>{label}</span><span className="toggle-state">{value[key] ? <Icon name="check" size={16} /> : <Icon name="plus" size={16} />}{value[key] ? 'On' : 'Off'}</span>
  </button>;
  return <>
      <div className="effects-category-tabs" role="tablist" aria-label="Effect category">
        {categories.map((tab, index) => <button type="button" key={tab.key} role="tab" id={`${id}-${tab.key}`} aria-controls={`${id}-panel`} aria-selected={category === tab.key} tabIndex={category === tab.key ? 0 : -1} onClick={() => setCategory(tab.key)} onKeyDown={(event) => {
          const next = event.key === 'ArrowRight' ? (index + 1) % categories.length : event.key === 'ArrowLeft' ? (index + categories.length - 1) % categories.length : event.key === 'Home' ? 0 : event.key === 'End' ? categories.length - 1 : -1;
          if (next < 0) return;
          event.preventDefault(); setCategory(categories[next].key);
          event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next].focus();
        }}><Icon name={tab.icon} size={20} /><span>{tab.label}</span></button>)}
      </div>
      <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${category}`} tabIndex={0}>
        <p className="muted">{category === 'face' ? 'Follow your head movement with playful face effects.' : category === 'scene' ? 'Set the scene with motion, frames, and light.' : 'Mix a vintage or digital look. Adjust the strength below.'}</p>
        <fieldset className="camera-effects" disabled={!value.enabled}>
          {category === 'face' && <>
            {toggle('wavyBorder', 'Wavy face border', 'wave')}
            <Choices label="Head sticker" value={value.sticker} onChange={(next) => set('sticker', next)} options={[
              { value: 'none', label: 'None', icon: 'none' }, { value: 'crown', label: 'Crown', icon: 'crown' }, { value: 'heart', label: 'Heart', icon: 'heart' }, { value: 'star', label: 'Star', icon: 'star' },
            ]} />
            {slider('distortion', 'Face distortion', 'distortion')}
          </>}
          {category === 'scene' && <>
            <Choices label="Frame" value={value.frame} onChange={(next) => set('frame', next)} options={[
              { value: 'none', label: 'None', icon: 'none' }, { value: 'neon', label: 'Neon', icon: 'sparkle' }, { value: 'film', label: 'Film', icon: 'film' }, { value: 'white', label: 'White', icon: 'frame' },
            ]} />
            <Choices label="Background animation" value={value.background} onChange={(next) => set('background', next)} options={[
              { value: 'none', label: 'None', icon: 'none' }, { value: 'bubbles', label: 'Bubbles', icon: 'bubbles' }, { value: 'rain', label: 'Rain', icon: 'rain' },
            ]} />
            {slider('outline', 'Person outline', 'sparkle')}
            {value.outline > 0 && <div className="outline-controls">
              <label className="outline-color">Outline color<input type="color" value={value.outlineColor} onChange={(event) => set('outlineColor', event.target.value)} /></label>
              <GaugeSlider id="outline-width" label="Outline width" icon="frame" min={1} max={12} suffix="px" value={value.outlineWidth} disabled={!value.enabled} onChange={(next) => set('outlineWidth', next)} />
            </div>}
            {slider('spotlight', 'Spotlight', 'spotlight')}
          </>}
          {category === 'style' && <>
            <div className="effect-choice-group" role="group" aria-label="Color styles">
              <h3>Color styles</h3>
              <SwipeSlider label="Color styles" className="effect-tiles">
                {([
                  { key: 'monochrome', label: 'Black & white', icon: 'contrast' },
                  { key: 'sepia', label: 'Sepia', icon: 'sepia' },
                ] as const).map((style) => <button type="button" key={style.key} aria-pressed={value[style.key]} onClick={() => set(style.key, !value[style.key])}>
                  <Icon name={style.icon} size={24} /><span>{style.label}</span>
                  {value[style.key] && <span className="selected-check"><Icon name="check" size={12} /></span>}
                </button>)}
              </SwipeSlider>
            </div>
            <div className="effect-gauge-pair">
              {slider('vignette', 'Vignette', 'contrast')}
              {slider('grain', 'Film grain', 'grain')}
              {slider('glitch', 'Glitch', 'glitch')}
            </div>
          </>}
        </fieldset>
      </div>
      {category === 'face' && value.enabled && needsFace && faceState !== 'tracking' && <p className="muted control-label" role="status"><Icon name="emoji" size={18} />{faceState === 'error' ? 'Face tracking unavailable. Restart the camera to retry.' : faceState === 'loading' ? 'Preparing face tracking…' : 'Face the camera to activate your face effects.'}</p>}
      <div className="popup-footer">
        <label className="filter-toggle"><input type="checkbox" role="switch" checked={value.enabled} onChange={(e) => set('enabled', e.target.checked)} /><Icon name="effects" size={17} /><span>Enable effects</span></label>
        <button className="text-icon reset-effects" aria-label="Reset all effects" title="Reset all effects" onClick={() => onChange({ ...DEFAULT_EFFECTS })}><Icon name="reset" size={17} />Reset</button>
      </div>
  </>;
}
