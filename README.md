# Zero Hour

Round-based co-op zombie survival in the browser, for one to four players. First person, retro
low-poly, on two maps: a snowed-in mountain signals station, and a city square on Christmas Eve.
Everything you see and hear - models, animation, textures, lighting, sound, music - is generated
in code: there is not one binary asset in the repository.

Hold out against endless rounds. Points for hits and kills buy doors, wall guns and ammunition,
tonics, a roll of the Cache and a turn at the Forge. Turn the power on. Get your friends back up.
The game ends when everyone is down.

## Play

You need Node 22 or newer.

```bash
npm ci
```

```bash
npm run build
```

```bash
npm start
```

Open http://localhost:8080, pick a name and press **Create game**. Friends join with the four-letter
room code or the invite link from the lobby; anyone on your network can use
`http://<your address>:8080`. One player is fine too.

The host picks the map in the lobby:

- **Harrow Ridge Station** - the signals station: nine zones on terraces up a mountainside, the
  generator hall's gallery over them and a vault under the bunker. Close quarters; the Forge is at
  the end of a dead end.
- **The Longest Night** - Wexler Square, deep in a big old city, snowing, every decoration still
  lit. About four times the station's floor on five storeys: the square, an avenue and an alley;
  a diner, a tenement, a department store, a cinema and a chapel to go through; two roofs joined
  by a plank bridge; a subway underneath with a stalled train. The master switch is on the
  store's roof and the Forge is down in the signal room. A team splits up here without meaning
  to, and rounds run longer.

Weapons, tonics, the Cache, the Forge and the rounds are the same on both.

| | |
|---|---|
| Move / sprint | `W A S D` / `Shift` |
| Fire / aim | left / right mouse |
| Reload / swap weapon | `R` / `Q`, `1`-`3`, wheel |
| Use, buy, rebuild, revive (hold) | `F` |
| Knife / grenade / decoy | `V` / `G` / `E` |
| Ping a spot for the team / chat | `Z` / `Enter` |
| Scores / pause and settings | `Tab` / `Esc` |

Every key can be changed under **Settings**, along with sensitivity, field of view, resolution
(270, 540 or 810 lines), dither, screen shake and the three volumes. **How to play** in the menu
explains the rest.

## Host it

One process serves the built client and the game's WebSocket (`/ws`) on one port.

| Variable | Default | |
|---|---|---|
| `PORT` | `8080` | port to listen on |
| `CLIENT_DIST` | `client/dist` next to the server | where the built client is |
| `ZH_MAP` | `harrow_ridge` | the map a new room starts on (`longest_night` for the city); the host can still change it |
| `ZH_DEBUG` | unset | `1` enables the debug commands (`window.__zh` cheats). Leave it off in public. |

`GET /healthz` answers `ok` for health checks. Stop it with `SIGTERM` or `SIGINT`.

With Docker:

```bash
docker build -t zerohour .
```

```bash
docker run --rm -p 8080:8080 zerohour
```

Things to know before putting it on the internet:

- **Behind a proxy**, forward WebSocket upgrades on `/ws` (nginx: `proxy_http_version 1.1`, the
  `Upgrade` and `Connection` headers, and a `proxy_read_timeout` over 30 s). Serve it over HTTPS and
  the client uses `wss://` by itself. Browsers only give the mouse to a page (pointer lock) and
  only start sound after a click; both work over plain `http://` too.
- **State is in memory.** A restart ends every game; clients notice, say so, and return to the menu
  when the server is back. Run one instance - rooms are not shared between processes.
- **Load.** A full room (4 players, 32 zombies) costs about 0.5 ms of one core per 30 Hz tick and
  sends each player roughly 25 kB/s. The server opens at most 500 rooms, closes empty ones after
  30 s and unused ones after 30 minutes.
- **Trust.** The server owns the world; a client owns only its own movement and hit reports, which
  are sanity-checked. That is right for playing with friends, not for strangers who cheat. Every
  message is validated and rate-limited, and a game that fails is closed without taking the others
  with it.

## Develop

```bash
npm install
```

```bash
npm run dev
```

That runs the game server (port 8080, debug commands on) and Vite on http://localhost:5173.
`?autostart=1` drops you straight into a solo game; `?debug=1` shows frame rate and draw calls.

| | |
|---|---|
| `npm run typecheck` / `npm run lint` / `npm test` | types, ESLint, unit and simulation tests |
| `npm run campaign -- 25 --god` | four bots play a whole game on a fake clock, to round 25 |
| `npm run campaign -- 40 --runs=32` | the same, mortal: how far does a team get (the balance report); `--map=longest_night` for the city |
| `npm run soak` | four bots and a full horde over real sockets for five minutes |
| `npm run ship` | fresh clone, production build, four browser players through ten rounds (`-- --map=longest_night`: the host picks the city) |
| `npm run smoke`, `e2e`, `rounds`, `economy`, `horde`, `wonders`, `audio`, `ux`, `maps`, `tour` | browser walk-throughs of each feature, with screenshots in `test-results/` (after a build); `economy`, `horde`, `wonders` and `tour` take `-- --night` for the city |
| `npm run site`, `npm run city` | one browser player over every slope and stair of the station, and of the city |
| `npm run map` / `npm run map -- longest_night` | validate a map and print it as text |
| `npm run bot -- ROOM 3` | three bot players join your room |

The browser scripts use a globally installed Playwright. `?auto=1` (or `__zh.auto(true)` in the
console) hands your controls to the autopilot that the `ship` run uses.

`docs/PLAN.md` is the design, the architecture and the record of how it was built; `CLAUDE.md` is
the short guide to where things live. The code is three workspaces: `shared` (data, map, maths,
protocol - used as source by both sides), `server` (rooms and the authoritative game) and `client`
(Three.js renderer, input, sound, interface).
