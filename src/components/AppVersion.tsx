import { version } from '../../package.json';
import './AppVersion.css';

export function AppVersion() {
  return <span className="app-version" aria-label={`App version ${version}`} title={`Lensora version ${version}`}>v{version}</span>;
}
