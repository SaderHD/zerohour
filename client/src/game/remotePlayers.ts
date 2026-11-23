import * as THREE from 'three';
import { MoveState, lineOfSight, type CompiledMap, type PlayerId, type PlayerPublic, type PlayerSnap } from '@zh/shared';
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
}

const TAG_RANGE = 28;

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
      r = { id: p.id, name: p.name, connected: p.connected, model, buffer: new InterpBuffer(), tag, pose: null };
      this.remotes.set(p.id, r);
    }
    r.name = p.name;
    r.connected = p.connected;
    r.tag.textContent = p.connected ? p.name : `${p.name} (lost)`;
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
    for (const [id, x, z, yaw, pitch, state] of players) this.remotes.get(id)?.buffer.push(time, x, z, yaw, pitch, state);
  }

  update(dt: number, renderTime: number, camera: THREE.PerspectiveCamera, viewW: number, viewH: number): void {
    for (const r of this.remotes.values()) {
      const pose = (r.pose = r.buffer.sample(renderTime));
      const root = r.model.root;
      root.visible = !!pose;
      if (!pose) {
        r.tag.style.display = 'none';
        continue;
      }
      root.position.set(pose.x, 0, pose.z);
      root.rotation.y = pose.yaw;
      r.model.update(dt, { speed: pose.speed, sprinting: pose.state === MoveState.Sprint, pitch: pose.pitch });
      r.model.setLight(this.world.lightAt(pose.x, 1, pose.z));

      // Name tag: projected to the screen, hidden when behind us, far away or behind a wall.
      const v = this.v.set(pose.x, 2.05, pose.z);
      const dist = v.distanceTo(camera.position);
      v.project(camera);
      const visible = v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1 && dist < TAG_RANGE
        && lineOfSight(this.map, camera.position.x, camera.position.z, pose.x, pose.z, 'all');
      r.tag.style.display = visible ? 'block' : 'none';
      if (visible) {
        r.tag.style.transform = `translate(-50%, -100%) translate(${((v.x + 1) / 2) * viewW}px, ${((1 - v.y) / 2) * viewH}px)`;
        r.tag.style.opacity = String(Math.min(1, 1.3 - dist / TAG_RANGE));
      }
    }
  }

  /** For tests/debug. */
  list(): { id: PlayerId; name: string; x: number; z: number; visible: boolean; connected: boolean }[] {
    return [...this.remotes.values()].map((r) => ({
      id: r.id, name: r.name, x: r.pose?.x ?? NaN, z: r.pose?.z ?? NaN, visible: r.model.root.visible, connected: r.connected,
    }));
  }
}

