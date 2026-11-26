// Every sound the game can make, by name, with how long it lasts: `__zh.audio.play(name)` to hear
// one, and `npm run audio` renders each offline to check that it is there and does not clip.
import { PERK_LIST, POWERUP_LIST, WEAPON_LIST, FLOOR_STYLES, weaponStats } from '@zh/shared';
import type { GunSounds } from './guns';
import { CAROLS, type Music } from './music';
import type { Sfx } from './sfx';

export interface Lib {
  guns: GunSounds;
  sfx: Sfx;
  music: Music;
}

export interface Entry {
  name: string;
  seconds: number;
  play(lib: Lib): void;
}

const e = (name: string, seconds: number, play: (lib: Lib) => void): Entry => ({ name, seconds, play });

export const CATALOGUE: readonly Entry[] = [
  ...WEAPON_LIST.flatMap((w) => [
    e(`shot-${w.id}`, 1.5, (l) => l.guns.shot(w, false)),
    e(`shot-${w.id}-forged`, 1.5, (l) => l.guns.shot(weaponStats(w.id, true)!, true)),
  ]),
  ...(['out', 'in', 'rack'] as const).map((stage) => e(`reload-${stage}`, 0.5, (l) => l.guns.reload(WEAPON_LIST[0]!, stage))),
  e('dry', 0.2, (l) => l.guns.dry()),
  e('pump', 0.5, (l) => l.guns.pump(0)),
  e('swap', 0.4, (l) => l.guns.swap()),
  e('knife-miss', 0.4, (l) => l.guns.knife(false)),
  e('knife-hit', 0.4, (l) => l.guns.knife(true)),
  e('toss', 0.5, (l) => l.guns.toss()),
  e('clink', 0.2, (l) => l.guns.clink(undefined)),
  ...['frag', 'siren', 'well'].map((k) => e(`explosion-${k}`, 2.5, (l) => l.guns.explosion(undefined, k))),
  e('arc', 0.4, (l) => l.guns.arc(undefined, 0)),
  e('well-hum', 0.9, (l) => l.guns.wellHum(undefined)),
  e('siren-wail', 1.1, (l) => l.guns.sirenWail(undefined)),
  ...FLOOR_STYLES.map((f) => e(`step-${f}`, 0.4, (l) => l.sfx.step(f, false))),
  e('mark', 0.4, (l) => l.sfx.mark()),
  e('chat', 0.2, (l) => l.sfx.chat()),
  e('groan', 1.8, (l) => l.sfx.groan(undefined, 11)),
  e('groan-runner', 1.4, (l) => l.sfx.groan(undefined, 23, 1)),
  e('zombie-attack', 0.6, (l) => l.sfx.attack(undefined, 5)),
  e('zombie-death', 0.8, (l) => l.sfx.death(undefined, 5)),
  e('flesh', 0.2, (l) => l.sfx.flesh(undefined)),
  e('howl', 1.6, (l) => l.sfx.howl(undefined, 3)),
  e('bark', 0.4, (l) => l.sfx.bark(undefined)),
  e('thunder', 2.4, (l) => l.sfx.thunder(undefined)),
  e('plank-torn', 0.4, (l) => l.sfx.plank(undefined, true)),
  e('plank-nailed', 0.4, (l) => l.sfx.plank(undefined, false)),
  e('door', 1.2, (l) => l.sfx.door(undefined, false)),
  e('debris', 1.3, (l) => l.sfx.door(undefined, true)),
  e('power-on', 2.8, (l) => l.sfx.powerOn()),
  e('power-chord', 4.2, (l) => l.music.powerChord()),
  e('drip', 0.3, (l) => l.sfx.drip(undefined)),
  e('ember', 0.6, (l) => l.sfx.ember(undefined)),
  e('hurt', 0.6, (l) => l.sfx.hurt(true)),
  e('heartbeat', 0.5, (l) => l.sfx.heartbeat(1)),
  e('downed', 1.6, (l) => l.sfx.downed()),
  e('revived', 0.9, (l) => l.sfx.revived()),
  e('revive-tick', 0.2, (l) => l.sfx.reviveTick(2)),
  ...(['hit', 'head', 'kill', 'headkill'] as const).map((k) => e(`tick-${k}`, 0.5, (l) => l.sfx.tick(k))),
  e('purchase', 0.8, (l) => l.sfx.purchase()),
  e('denied', 0.4, (l) => l.sfx.denied()),
  e('click', 0.2, (l) => l.sfx.click()),
  e('anvil', 0.7, (l) => l.sfx.anvil(undefined, 0)),
  e('forged', 1.6, (l) => l.music.forged(undefined)),
  ...PERK_LIST.map((p) => e(`tonic-${p.id}`, 4, (l) => l.music.tonic(p.id))),
  e('cache-roll', 4.2, (l) => l.music.cacheRoll(undefined, 4, 3)),
  e('cache-offer', 1.4, (l) => l.music.cacheOffer(undefined)),
  e('cache-jinx', 2.6, (l) => l.music.jinx(undefined)),
  e('cache-leave', 2.5, (l) => l.music.cacheLeave(undefined)),
  e('cache-land', 1.4, (l) => l.music.cacheLand()),
  e('powerup-drop', 1, (l) => l.music.drop(undefined)),
  e('powerup-gone', 0.5, (l) => l.music.dropGone(undefined)),
  ...POWERUP_LIST.map((p) => e(`powerup-${p.id}`, 2.4, (l) => l.music.powerup(p.id))),
  e('effect-end', 0.8, (l) => l.music.effectEnd()),
  e('round-start', 4.2, (l) => l.music.roundStart(1)),
  e('round-start-late', 4.2, (l) => l.music.roundStart(8)),
  e('round-special', 4.4, (l) => l.music.roundSpecial()),
  e('round-end', 4.4, (l) => l.music.roundEnd()),
  e('game-over', 9.5, (l) => l.music.gameOver()),
  e('mate-down', 1.2, (l) => l.music.mateDown()),
  e('far-siren', 10, (l) => l.sfx.distantSiren()),
  ...CAROLS.flatMap((c, i) => [
    e(`carol-${c.name}`, 12, (l) => void l.music.carol('jukebox', i, 0)),
    e(`carol-${c.name}-box`, 14, (l) => void l.music.carol('box', i, 0)),
  ]),
];
