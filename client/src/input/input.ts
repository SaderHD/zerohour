/** Keyboard + pointer-lock mouse state. `setKey` lets tests and debug tools drive it. */
export class Input {
  private readonly keys = new Set<string>();
  private dx = 0;
  private dy = 0;
  locked = false;
  onLockChange: ((locked: boolean) => void) | null = null;

  /** `canLock` gates pointer lock (only while actually playing). */
  attach(canvas: HTMLCanvasElement, canLock: () => boolean = () => true): void {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (this.locked && ['Tab', 'Space', 'ControlLeft'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    canvas.addEventListener('click', () => {
      if (!this.locked && canLock()) void canvas.requestPointerLock()?.catch?.(() => {});
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked) this.keys.clear();
      this.onLockChange?.(this.locked);
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.dx += e.movementX;
      this.dy += e.movementY;
    });
  }

  down(code: string): boolean {
    return this.keys.has(code);
  }

  setKey(code: string, down: boolean): void {
    if (down) this.keys.add(code);
    else this.keys.delete(code);
  }

  /** Mouse movement since the last call, in pixels. */
  consumeMouse(): { dx: number; dy: number } {
    const m = { dx: this.dx, dy: this.dy };
    this.dx = this.dy = 0;
    return m;
  }
}
