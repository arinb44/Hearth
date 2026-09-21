import type { EnvironmentSettings, FogLevel, TimeOfDay } from '../scene/world';

const KEY = 'coop-builder:environment';
const TIMES: { value: TimeOfDay; icon: string; label: string }[] = [
  { value: 'day', icon: '☀️', label: 'Day' },
  { value: 'dusk', icon: '🌇', label: 'Dusk' },
  { value: 'night', icon: '🌙', label: 'Night' },
];
const FOGS: { value: FogLevel; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 'light', label: 'Light' },
  { value: 'heavy', label: 'Heavy' },
];

function load(): EnvironmentSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return {
      time: TIMES.some((t) => t.value === saved.time) ? saved.time : 'day',
      fog: FOGS.some((f) => f.value === saved.fog) ? saved.fog : 'off',
    };
  } catch {
    return { time: 'day', fog: 'off' };
  }
}

function save(settings: EnvironmentSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Storage unavailable: the choice lasts until the page closes.
  }
}

function next<T>(list: { value: T }[], current: T): T {
  const i = list.findIndex((item) => item.value === current);
  return list[(i + 1) % list.length].value;
}

/**
 * Personal look controls (top right): tap to cycle day/dusk/night and fog. Saved on
 * this device only; other players keep their own settings.
 */
export class EnvironmentControls {
  private readonly root = document.getElementById('settings')!;
  private readonly timeButton = document.createElement('button');
  private readonly fogButton = document.createElement('button');
  private settings = load();

  constructor(private readonly apply: (settings: EnvironmentSettings) => void) {
    this.timeButton.type = this.fogButton.type = 'button';
    this.timeButton.title = 'Time of day (just for you)';
    this.fogButton.title = 'Fog (just for you)';
    this.timeButton.addEventListener('click', () =>
      this.update({ time: next(TIMES, this.settings.time) }),
    );
    this.fogButton.addEventListener('click', () =>
      this.update({ fog: next(FOGS, this.settings.fog) }),
    );
    this.root.append(this.timeButton, this.fogButton);
    this.update({});
  }

  private update(change: Partial<EnvironmentSettings>): void {
    this.settings = { ...this.settings, ...change };
    save(this.settings);
    const time = TIMES.find((t) => t.value === this.settings.time)!;
    const fog = FOGS.find((f) => f.value === this.settings.fog)!;
    this.timeButton.innerHTML = `${time.icon} <span class="label">${time.label}</span>`;
    this.fogButton.innerHTML = `🌫️ <span class="label">Fog: ${fog.label}</span>`;
    this.apply(this.settings);
  }
}
