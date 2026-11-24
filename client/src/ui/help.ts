import { ACTIONS, type Settings } from '../settings';

const SECTIONS: [string, string][] = [
  ['The job', 'Zombies come through the windows in rounds, more and tougher every time. Hold out as long as you can. The game ends when everyone is down at once.'],
  ['Points', 'Every hit pays a little and every kill more; headshots and the knife pay best. Nailing a plank back on a window pays too. Points buy everything else.'],
  ['Doors and power', 'Most of the station is shut. Doors and rubble cost points and stay open for everyone. Find the master switch and throw it: the lights, the tonic dispensers and the Forge all need the mains.'],
  ['Guns', 'Chalk outlines on the walls sell the gun drawn there, and ammunition for it afterwards. The Cache gives a random weapon for 950, sometimes a rare one, and sometimes a Jinx that sends it off to another spot. The Forge, deep in the station, rebuilds the gun in your hands into something much worse to face.'],
  ['Tonics', 'The dispensers sell tonics: more health, faster hands, a third gun and others. Four at most, and you lose them when you go down.'],
  ['Drops', 'Now and then a zombie leaves something glowing behind. Walk over it before it fades: full ammunition, double points, one-hit kills and more, for the whole team.'],
  ['Going down', 'With no health left you fall, with only a pistol. A teammate can hold the use key beside you to get you up before you bleed out. If you bleed out you watch until the next round and come back with the starting pistol.'],
  ['Talking', 'The ping key drops a marker where you are looking that your team can see through walls. The chat key opens the text chat.'],
];

/** The how-to-play screen. Rebuilt each time it opens so the keys shown are the ones bound now. */
export function buildHelp(settings: Settings, onBack: () => void): void {
  const root = document.getElementById('help')!;
  const text = document.createElement('div');
  text.className = 'columns';
  const left = document.createElement('div');
  for (const [title, body] of SECTIONS) {
    const h2 = document.createElement('h2');
    h2.textContent = title;
    const p = document.createElement('p');
    p.textContent = body;
    left.append(h2, p);
  }
  const right = document.createElement('div');
  const h2 = document.createElement('h2');
  h2.textContent = 'Keys';
  const keys = document.createElement('div');
  keys.className = 'keys';
  for (const a of ACTIONS) {
    const row = document.createElement('div');
    row.className = 'keyrow';
    const name = document.createElement('span');
    name.textContent = a.label;
    const key = document.createElement('b');
    key.textContent = settings.label(a.id);
    row.append(name, key);
    keys.append(row);
  }
  for (const [name, key] of [['Pick a weapon', '1 2 3'], ['Menu', 'Esc']] as const) {
    const row = document.createElement('div');
    row.className = 'keyrow';
    const n = document.createElement('span');
    n.textContent = name;
    const k = document.createElement('b');
    k.textContent = key;
    row.append(n, k);
    keys.append(row);
  }
  right.append(h2, keys);
  text.append(left, right);
  const title = document.createElement('h1');
  title.textContent = 'HOW TO PLAY';
  const back = document.createElement('button');
  back.id = 'help-back';
  back.textContent = 'Back';
  back.onclick = onBack;
  root.replaceChildren(title, text, back);
}
