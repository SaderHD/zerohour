/** Is the keyboard going into a text field right now? */
const typing = (): boolean => {
  const a = document.activeElement;
  return a instanceof HTMLInputElement || a instanceof HTMLTextAreaElement;
};

/**
 * Keyboard + pointer-lock mouse state (buttons and wheel included). The game asks for an action by
 * its default code (`KeyF`, `Mouse0`); `remap` turns the physical key into that, so rebinding
 * never touches game code. `setKey` lets tests and debug tools drive it (in default codes).
 */
export class Input {
  private readonly keys = new Set<string>();
  private readonly hit = new Set<string>();
  private dx = 0;
  private dy = 0;
  /** Wheel notches this frame (sign only matters). */
  wheel = 0;
  locked = false;
  onLockChange: ((locked: boolean) => void) | null = null;
  /** Physical code -> the code the game sees, or null to swallow it (see Settings.remap). */
  remap: (code: string) => string | null = (c) => c;
  /** While set, the next key or mouse button goes here instead of to the game (the settings screen rebinding a key). */
  capture: ((code: string) => void) | null = null;

  /** `canLock` gates pointer lock (only while actually playing). */
  attach(canvas: HTMLCanvasElement, canLock: () => boolean = () => true): void {
    window.addEventListener('keydown', (e) => {
      if (this.capture) {
        e.preventDefault();
        e.stopPropagation();
        const take = this.capture;
        this.capture = null;
        take(e.code);
        return;
      }
      if (e.repeat || typing()) return;
      const code = this.remap(e.code);
      if (!code) return;
      this.keys.add(code);
      this.hit.add(code);
      if (this.locked && (['Tab', 'Space', 'ControlLeft', 'Enter'].includes(e.code) || ['Tab', 'Enter'].includes(code))) e.preventDefault();
    }, true);
    window.addEventListener('keyup', (e) => {
      const code = this.remap(e.code);
      if (code) this.keys.delete(code);
    });
    window.addEventListener('blur', () => this.keys.clear());
    canvas.addEventListener('click', () => this.lock(canvas, canLock));
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked) this.keys.clear();
      this.onLockChange?.(this.locked);
    });
    // Mouse buttons read as keys 'Mouse0' (left), 'Mouse1' (middle), 'Mouse2' (right).
    document.addEventListener('mousedown', (e) => {
      if (this.capture) {
        e.preventDefault();
        e.stopPropagation();
        const take = this.capture;
        this.capture = null;
        take(`Mouse${e.button}`);
        return;
      }
      if (!this.locked) return;
      const code = this.remap(`Mouse${e.button}`);
      if (code) this.setKey(code, true);
    }, true);
    document.addEventListener('mouseup', (e) => {
      const code = this.remap(`Mouse${e.button}`);
      if (code) this.keys.delete(code);
    });
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

  /** Ask the browser for the mouse (it only agrees inside a click or key press). */
  lock(canvas: HTMLCanvasElement, canLock: () => boolean = () => true): void {
    if (!this.locked && canLock()) void canvas.requestPointerLock()?.catch?.(() => {});
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

  /** Let go of everything (a menu or the chat box has taken over). */
  release(): void {
    this.keys.clear();
    this.hit.clear();
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
