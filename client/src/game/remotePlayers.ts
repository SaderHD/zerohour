import * as THREE from 'three';
import { BLEEDOUT_SECONDS, FLOOR_GAP, INTERACT_RANGE, MoveState, PLAYER_EYE_HEIGHT, lineOfSight, type CompiledMap, type PlayerId, type PlayerPublic, type PlayerSnap } from '@zh/shared';
import { PLAYER_COLOURS, PlayerModel } from '../models/player';
import { InterpBuffer, type Pose } from '../net/interp';
import type { World } from '../render/worldBuilder';

interface Remote {
  id: PlayerId;
  name: string;
  connected: boolean;
  model: PlayerModel;
  buffer: InterpBuffer;
  tag: HTMLDivElement;
  pose: Pose | null;
  weapon: string | null;
  shots: number;
  /** 0 standing .. 1 flat on their back. */
  fall: number;
  /** Seconds they have been down (for the icon's urgency), and whether someone is reviving them. */
  downFor: number;
  reviving: boolean;
}

const TAG_RANGE = 28;
/** A downed teammate's icon turns urgent in the last part of the bleed-out. */
const URGENT_FRAC = 0.6;

/** Everyone else in the match: interpolated models with name tags. */
export class RemotePlayers {
  private readonly remotes = new Map<PlayerId, Remote>();
  private readonly tags = document.getElementById('tags') as HTMLDivElement;
  private readonly v = new THREE.Vector3();
  selfId: PlayerId = 0;

  constructor(private readonly scene: THREE.Scene, private readonly world: World, private readonly map: CompiledMap) {}

  /** Replace the roster (on sync). */
  reset(players: PlayerPublic[]): void {
    for (const id of [...this.remotes.keys()]) this.remove(id);
    for (const p of players) this.upsert(p);
  }

  upsert(p: PlayerPublic): void {
    if (p.id === this.selfId) return;
    let r = this.remotes.get(p.id);
    if (!r) {
      const model = new PlayerModel(PLAYER_COLOURS[p.id % PLAYER_COLOURS.length]!);
      model.root.visible = false;
      this.scene.add(model.root);
      const tag = document.createElement('div');
      tag.className = 'tag';
      this.tags.appendChild(tag);
      r = { id: p.id, name: p.name, connected: p.connected, model, buffer: new InterpBuffer(), tag, pose: null, weapon: null, shots: 0, fall: 0, downFor: 0, reviving: false };
      this.remotes.set(p.id, r);
    }
    r.name = p.name;
    r.connected = p.connected;
    const held = p.weapons[p.slot];
    r.weapon = held?.id ?? null;
    r.model.setWeapon(r.weapon, held?.upgraded);
    r.tag.classList.toggle('lost', !p.connected);
  }

  remove(id: PlayerId): void {
    const r = this.remotes.get(id);
    if (!r) return;
    this.scene.remove(r.model.root);
    r.model.dispose();
    r.tag.remove();
    this.remotes.delete(id);
  }

  onSnapshot(time: number, players: PlayerSnap[]): void {
    for (const [id, x, z, yaw, pitch, state, , , y] of players) this.remotes.get(id)?.buffer.push(time, x, z, yaw, pitch, state, y);
  }

  update(dt: number, renderTime: number, camera: THREE.PerspectiveCamera, viewW: number, viewH: number): void {
    for (const r of this.remotes.values()) {
      const pose = (r.pose = r.buffer.sample(renderTime));
      const root = r.model.root;
      // Dead players (bled out, or waiting to join) are not in the world.
      root.visible = !!pose && pose.state !== MoveState.Dead;
      if (!pose || !root.visible) {
        r.tag.style.display = 'none';
        r.fall = 0;
        continue;
      }
      const down = pose.state === MoveState.Downed;
      r.downFor = down ? r.downFor + dt : 0;
      if (!down) r.reviving = false;
      r.fall += ((down ? 1 : 0) - r.fall) * Math.min(1, dt * 7);
      root.position.set(pose.x, this.map.footAt(pose.x, pose.y, pose.z) + r.fall * 0.14, pose.z);
      root.rotation.set(r.fall * 1.5, pose.yaw, 0, 'YXZ');
      r.model.update(dt, { speed: pose.speed, sprinting: pose.state === MoveState.Sprint, pitch: pose.pitch });
      r.model.setLight(this.world.lightAt(pose.x, pose.y + 1, pose.z));

      // Name tag: projected to the screen, hidden when behind us, far away or behind a wall.
      const v = this.v.set(pose.x, pose.y + 2.05 - r.fall * 1.4, pose.z);
      const dist = v.distanceTo(camera.position);
      v.project(camera);
      // A downed teammate's revive icon shows through walls and at any distance.
      const visible = v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1
        && (down || (dist < TAG_RANGE && lineOfSight(this.map, camera.position.x, camera.position.y - PLAYER_EYE_HEIGHT, camera.position.z, pose.x, pose.y, pose.z, 'all')));
      r.tag.style.display = visible ? 'block' : 'none';
      const text = down ? `\u271a ${r.name}` : r.connected ? r.name : `${r.name} (lost)`;
      if (r.tag.textContent !== text) r.tag.textContent = text;
      r.tag.classList.toggle('downed', down);
      r.tag.classList.toggle('urgent', down && r.downFor > BLEEDOUT_SECONDS * URGENT_FRAC);
      r.tag.classList.toggle('reviving', down && r.reviving);
      if (visible) {
        r.tag.style.transform = `translate(-50%, -100%) translate(${((v.x + 1) / 2) * viewW}px, ${((1 - v.y) / 2) * viewH}px)`;
        r.tag.style.opacity = down ? '1' : String(Math.min(1, 1.3 - dist / TAG_RANGE));
      }
    }
  }

  /** A remote player fired: flash their gun. Returns the muzzle position for a tracer, if they are drawn. */
  fired(id: PlayerId, out: THREE.Vector3): THREE.Vector3 | null {
    const r = this.remotes.get(id);
    if (!r) return null;
    r.shots++;
    if (!r.pose) return null;
    r.model.fire();
    return r.model.muzzleWorld(out);
  }

  melee(id: PlayerId): void {
    this.remotes.get(id)?.model.swing();
  }

  /** The nearest downed teammate within reach. */
  revivable(x: number, y: number, z: number): { id: PlayerId; name: string } | null {
    let best: Remote | null = null;
    let bestD = INTERACT_RANGE;
    for (const r of this.remotes.values()) {
      if (r.pose?.state !== MoveState.Downed || Math.abs(r.pose.y - y) >= FLOOR_GAP) continue;
      const d = Math.hypot(r.pose.x - x, r.pose.z - z);
      if (d < bestD) {
        best = r;
        bestD = d;
      }
    }
    return best && { id: best.id, name: best.name };
  }

  /** Someone started or stopped reviving this player. */
  setReviving(id: PlayerId, on: boolean): void {
    const r = this.remotes.get(id);
    if (r) r.reviving = on;
  }

  private up(): Remote[] {
    return [...this.remotes.values()].filter((r) => r.pose && r.pose.state !== MoveState.Downed && r.pose.state !== MoveState.Dead);
  }

  /** How many teammates are on their feet. */
  standing(): number {
    return this.up().length;
  }

  /** Height of the floor a teammate stands on (0 if we have not seen them yet). */
  floorOf(id: PlayerId): number {
    return this.remotes.get(id)?.pose?.y ?? 0;
  }

  /** A teammate on their feet to watch while we are out of the game; `index` steps through them. */
  spectate(index = 0): (Pose & { name: string }) | null {
    const up = this.up();
    const r = up[((index % up.length) + up.length) % up.length];
    return r?.pose ? { ...r.pose, name: r.name } : null;
  }

  /** For tests/debug. `state` is a MoveState. */
  list(): { id: PlayerId; name: string; x: number; y: number; z: number; visible: boolean; connected: boolean; weapon: string | null; shots: number; state: number }[] {
    return [...this.remotes.values()].map((r) => ({
      id: r.id, name: r.name, x: r.pose?.x ?? NaN, y: r.pose?.y ?? 0, z: r.pose?.z ?? NaN, visible: r.model.root.visible, connected: r.connected,
      weapon: r.weapon, shots: r.shots, state: r.pose?.state ?? MoveState.Idle,
    }));
  }
}

