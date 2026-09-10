import { useEffect, useState } from 'react';
import { readPreference, writePreference } from '../storage/uiPreferences';
import { Icon } from './Icon';

export function MotionToggle() {
  const [enabled, setEnabled] = useState(() => readPreference('animations'));
  useEffect(() => {
    document.documentElement.dataset.motion = enabled ? 'on' : 'off';
    writePreference('animations', enabled);
  }, [enabled]);
  return <label className="preference-toggle preference-card"><span className="preference-icon"><Icon name="motion" size={23} /></span><span className="preference-copy"><strong>Animate interface</strong><small>System reduced-motion settings still apply.</small></span><input type="checkbox" role="switch" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} /></label>;
}
