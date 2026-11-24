import { describe, expect, it } from 'vitest';
import { MARK_RANGE, MoveState } from '@zh/shared';
import { makeGame } from './testkit';

describe('ping markers', () => {
  it('a mark is passed on to everyone, rounded, with who placed it', () => {
    const t = makeGame();
    const p = t.game.addPlayer(1, 'Ada');
    t.send(1, { t: 'mark', x: p.x + 3.14159, y: 0, z: p.z - 2 });
    t.wait(0.1);
    const [m] = t.of('mark');
    expect(m).toEqual({ e: 'mark', id: 1, x: Math.round((p.x + 3.14159) * 1000) / 1000, y: 0, z: p.z - 2 });
  });

  it('ignores marks off the map, too far away, or from a player who is out of the game', () => {
    const t = makeGame();
    const p = t.game.addPlayer(1, 'Ada');
    t.game.addPlayer(2, 'Bea'); // on her feet, so the game goes on while Ada is down
    t.send(1, { t: 'mark', x: -1, y: 0, z: p.z });
    t.send(1, { t: 'mark', x: p.x, y: 0, z: 5000 });
    t.send(1, { t: 'mark', x: p.x, y: 0, z: p.z + MARK_RANGE + 1 });
    t.send(1, { t: 'mark', x: Number.NaN, y: 0, z: p.z });
    p.state = MoveState.Dead;
    t.send(1, { t: 'mark', x: p.x, y: 0, z: p.z });
    t.wait(0.1);
    expect(t.of('mark')).toHaveLength(0);
    p.state = MoveState.Downed; // on the floor you can still point
    t.send(1, { t: 'mark', x: p.x, y: 0, z: p.z });
    t.wait(0.1);
    expect(t.of('mark')).toHaveLength(1);
  });
});
