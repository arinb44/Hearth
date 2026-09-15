const VISIBLE_MS = 2200;

/** A short message above the palette, e.g. why a placement was rejected. */
export class Toast {
  private readonly root = document.getElementById('toast')!;
  private timer: number | undefined;

  show(message: string): void {
    this.root.textContent = message;
    this.root.classList.add('visible');
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(
      () => this.root.classList.remove('visible'),
      VISIBLE_MS,
    );
  }
}
