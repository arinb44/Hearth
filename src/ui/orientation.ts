import { IS_TOUCH } from '../input/touch';

// Not in the DOM typings: orientation lock is only available on some mobile browsers.
type LockableOrientation = ScreenOrientation & {
  lock?: (orientation: 'landscape') => Promise<void>;
};

/**
 * Best effort: fullscreen plus a landscape lock (Android Chrome). Browsers that refuse
 * (iOS Safari, desktop) fall back to the "turn your phone sideways" card in CSS.
 * Must run inside a tap so the browser allows fullscreen.
 */
export function requestLandscape(): void {
  if (!IS_TOUCH) return;
  const root = document.documentElement;
  const enter = document.fullscreenElement
    ? Promise.resolve()
    : (root.requestFullscreen?.() ?? Promise.resolve());
  enter
    .then(() => (screen.orientation as LockableOrientation).lock?.('landscape'))
    .catch(() => {
      // Unsupported or denied: the rotate card covers portrait instead.
    });
}

/** Wires the rotate card's button and tries landscape on the first tap anywhere. */
export function setUpLandscape(): void {
  if (!IS_TOUCH) return;
  document
    .getElementById('go-landscape')!
    .addEventListener('click', requestLandscape);
  document.addEventListener('pointerdown', requestLandscape, { once: true });
}
