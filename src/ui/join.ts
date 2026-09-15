import { MAX_NAME_LENGTH } from '../../spacetimedb/src/logic/players';
import { STORAGE_SUFFIX } from '../config';

const NAME_KEY = `coop-builder:name${STORAGE_SUFFIX}`;

function loadName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

function saveName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    // Storage unavailable: the name just isn't prefilled next time.
  }
}

/** The name prompt; `onJoin` resolves when the server accepts the join. */
export class JoinScreen {
  private readonly root = document.getElementById('join')!;
  private readonly form = this.root.querySelector('form')!;
  private readonly input = this.root.querySelector('input')!;
  private readonly button = this.root.querySelector('button')!;
  private readonly error = this.root.querySelector<HTMLElement>('.join-error')!;

  constructor(onJoin: (name: string) => Promise<void>) {
    this.input.maxLength = MAX_NAME_LENGTH;
    this.input.value = loadName();
    this.form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = this.input.value.trim();
      if (!name) return this.showError('Pick a name first');
      this.button.disabled = true;
      this.showError('');
      try {
        await onJoin(name);
        saveName(name);
        this.hide();
      } catch (err) {
        this.showError(err instanceof Error ? err.message : 'Could not join');
      } finally {
        this.button.disabled = false;
      }
    });
  }

  show(): void {
    this.root.hidden = false;
    this.input.focus();
  }

  hide(): void {
    this.root.hidden = true;
    this.input.blur();
  }

  private showError(message: string): void {
    this.error.textContent = message;
  }
}
