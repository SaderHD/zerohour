/** Keyboard + pointer-lock mouse state (buttons and wheel included). `setKey` lets tests and debug tools drive it. */
export class Input {
  private readonly keys = new Set<string>();
  private readonly hit = new Set<string>();
  private dx = 0;
  private dy = 0;
  /** Wheel notches this frame (sign only matters). */
  wheel = 0;
  locked = false;
  onLockChange: ((locked: boolean) => void) | null = null;

  /** `canLock` gates pointer lock (only while actually playing). */
  attach(canvas: HTMLCanvasElement, canLock: () => boolean = () => true): void {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.hit.add(e.code);
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
    // Mouse buttons read as keys 'Mouse0' (left), 'Mouse1' (middle), 'Mouse2' (right).
    document.addEventListener('mousedown', (e) => {
      if (this.locked) this.setKey(`Mouse${e.button}`, true);
    });
    document.addEventListener('mouseup', (e) => this.keys.delete(`Mouse${e.button}`));
    document.addEventListener('wheel', (e) => {
      if (this.locked) this.wheel += Math.sign(e.deltaY);
    }, { passive: true });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.dx += e.movementX;
      this.dy += e.movementY;
    });
  }

  down(code: string): boolean {
    return this.keys.has(code);
  }

  /** True only on the frame the key went down. */
  pressed(code: string): boolean {
    return this.hit.has(code);
  }

  setKey(code: string, down: boolean): void {
    if (down) {
      this.keys.add(code);
      this.hit.add(code);
    } else this.keys.delete(code);
  }

  /** Call once at the end of every frame. */
  endFrame(): void {
    this.hit.clear();
    this.wheel = 0;
  }

  /** Mouse movement since the last call, in pixels. */
  consumeMouse(): { dx: number; dy: number } {
    const m = { dx: this.dx, dy: this.dy };
    this.dx = this.dy = 0;
    return m;
  }
}
