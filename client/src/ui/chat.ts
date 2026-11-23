import { MAX_CHAT_LENGTH } from '@zh/shared';

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const KEEP = 40;
/** A line in the in-game log fades after this long unless the box is open. */
const FADE_MS = 9000;

/**
 * Text chat: one history shown in two places, the lobby's log (always there) and the in-game log
 * (lines fade; the box opens on the chat key). System lines ("Bea is back") go in the same list.
 */
export class Chat {
  private readonly logs = [el('lobby-chat'), el('chat-log')];
  private readonly box = el<HTMLInputElement>('chat-input');
  private readonly lobbyBox = el<HTMLInputElement>('lobby-say');
  private readonly lines: { who: string; text: string; self: boolean }[] = [];
  open = false;
  /** Called when the in-game box closes, so the game can take the keyboard back. */
  onClose: (() => void) | null = null;
  /** Called after every line added (the debug state keeps a copy). */
  onLine: (() => void) | null = null;

  constructor(private readonly send: (text: string) => void) {
    for (const input of [this.box, this.lobbyBox]) {
      input.maxLength = MAX_CHAT_LENGTH;
      input.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') {
          const text = input.value.trim();
          input.value = '';
          if (text) this.send(text);
          if (input === this.box) this.hide();
        } else if (e.key === 'Escape' && input === this.box) this.hide();
      });
    }
    this.box.addEventListener('blur', () => this.open && this.hide());
  }

  /** Open the in-game box and start typing. */
  show(): void {
    if (this.open) return;
    this.open = true;
    document.body.dataset.chat = '1';
    this.box.value = '';
    this.box.focus();
  }

  hide(): void {
    if (!this.open) return;
    this.open = false;
    delete document.body.dataset.chat;
    this.box.blur();
    this.onClose?.();
  }

  /** A message from a player (`who`), or a line from the game itself (`who` empty). */
  add(who: string, text: string, self = false): void {
    this.lines.push({ who, text, self });
    if (this.lines.length > KEEP) this.lines.shift();
    for (const log of this.logs) {
      const row = document.createElement('div');
      row.className = who ? (self ? 'line self' : 'line') : 'line system';
      if (who) {
        const name = document.createElement('b');
        name.textContent = `${who}: `;
        row.append(name);
      }
      row.append(text);
      log.append(row);
      while (log.childElementCount > KEEP) log.firstElementChild!.remove();
      log.scrollTop = log.scrollHeight;
      if (log.id === 'chat-log') setTimeout(() => row.classList.add('old'), FADE_MS);
    }
    this.onLine?.();
  }

  system(text: string): void {
    this.add('', text);
  }

  clear(): void {
    this.lines.length = 0;
    for (const log of this.logs) log.replaceChildren();
  }

  /** For tests. */
  list(): { who: string; text: string }[] {
    return this.lines.map(({ who, text }) => ({ who, text }));
  }
}
