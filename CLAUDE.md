# Zero Hour

Browser-based, first-person, round-based co-op zombie survival game (1–4 players), retro low-poly,
all assets generated in code. TypeScript + Three.js client, Node + `ws` authoritative server.

**Read `docs/PLAN.md` before doing anything.** It holds the design, architecture, the 14 build
sessions and the progress checklist (section 9). Work exactly one session at a time and tick it off
when its acceptance checks pass.

## Rules
- Original content only: reuse genre mechanics, never another game's names, characters, maps,
  art, UI or audio.
- No binary assets. Models, textures and sounds are code.
- Game data lives in `shared/src/data`, tunables in `shared/src/constants.ts`.
- Server is authoritative for everything except a player's own movement and hit reports
  (see PLAN section 5). Don't add heavier netcode.
- After any map edit, run the validator and look at the ASCII dump and a screenshot.
- Finish every session with typecheck, tests and build green.

## Commands
- `npm run dev` — game server (tsx watch, port 8080, `ZH_DEBUG=1`) + Vite on http://localhost:5173
  (proxies `/ws`).
- `npm run build` — client to `client/dist`, server bundle to `server/dist/index.js`.
- `npm start` — production: one process serves the built client and `/ws` on `PORT` (default 8080).
- `npm test` — Vitest unit/sim tests (`*.test.ts` next to the code).
- `npm run typecheck` / `npm run lint`.
- `npm run e2e` — after a build: two browser players + two bots in one room; checks lobby flow,
  smooth remote motion, shooting (exact dummy damage, remote shots, ammo), reconnect and room-full
  handling. Writes `test-results/mp-*.png`.
- `npm run bot -- <ROOM> [count]` — headless bot players that join a room, roam and shoot zombies.
- `npm run soak -- [seconds] [--shut]` — in-process server + 4 WebSocket bots + 32 zombies; fails if
  a zombie stops making progress for 10 s or the tick goes over budget. (`npm test` runs the same
  soak on a fake clock.)
- `npm run rounds` — after a build: two browser players through the round loop (round 1, points,
  late join, down, revive, scoreboard, game over, back to lobby). Writes `test-results/rounds-*.png`.
- `npm run horde` — after a build: browser walk-through of the zombie features (tear, vault,
  attack, damage, rebuild, hit zones, crawler, full horde). Writes `test-results/horde-*.png`.
- URL flags for quick testing: `?autostart=1` (straight into a solo game), `?room=ABCD&autostart=1`
  (shared room across tabs), `?name=X`, `?debug=1`.
- `npm run map` — validate the map and rewrite the ASCII dump `docs/MAP.txt`.
- `npm run tour [view...]` — after a build: screenshots of every zone to `test-results/tour-*.png`
  (views are listed in `scripts/tour.cjs`; add one when you add something worth looking at;
  views named `*-on` are taken with the power on).
- `npm run smoke` — after a build: boots the server, drives headless Chromium, checks handshake
  and rendering, writes `test-results/smoke.png`. Uses the globally installed `playwright`; do not
  add it as a dependency in the cloud environment.

## Layout notes
- `@zh/shared` is consumed as TypeScript source by both sides (no build step). Config files
  (`vite.config.ts`) cannot import it.
- Coordinates: metres, x east, z south, y up, 0.5 m cells. Yaw 0 looks north (−z), positive turns
  left.
- World lighting is baked into vertex colours by `client/src/render/bake.ts` (`Baker`); the scene's
  white ambient light only passes it through. Lights that change (mains lights before/after the
  power, flames, failing tubes) are extra baked attributes scaled by uniforms in `materials.ts`.
- Props: add the footprint to `shared/src/data/props.ts`, a builder to `client/src/models/props`
  (drawn with `Kit` boxes/prisms, front towards -z, registered in its `index.ts`) and place it in
  `shared/src/map/dressing/<wing>.ts`. Solid props are whole 0.5 m cells in the collision grid:
  leave gaps of nothing or at least 1.5 m, then run `npm run map`. Lamps are drawn from
  `LightDef.fixture`. Door shutters and debris live in `render/doors.ts`.
- Server: `lobby.ts` (rooms, seats, reconnect; transport-agnostic via `Peer`) and `game/Game.ts`
  (the match; `step(dt)` is pure so tests drive it without timers). Client: `net/net.ts` is the
  connection/lobby state machine, `main.ts` wires everything.
- Dynamic models: build from `models/rig.ts` boxes and tint each frame with `world.lightAt()`.
- Combat: stats in `shared/src/data/weapons.ts`, maths in `shared/src/combat.ts`. The client
  (`game/weapons.ts`) resolves its own shots against `game/entities.ts` hit boxes and
  `rayWorld`, predicts ammo and sends `fire`; `server/src/game/combat.ts` validates rate, ammo,
  distance and line of sight. Server enemies live in `game/entities.ts` (types, damage, the
  dummy), thrown/launched things in `game/projectiles.ts`.
- Zombies (server): `game/zombies.ts` (brain and movement), `spawner.ts` (queue → windows of
  active zones), `barricades.ts` (planks, rebuild), `nav.ts` (a `FlowField` per player),
  `players.ts` (damage, regen), `doors.ts` (buying doors, power). Window geometry for both sides comes from `mapWindows()`.
  Sim tests use `game/testkit.ts`.
- Rounds and players (server): `game/rounds.ts` fills the spawn queue each round from the tables in
  `shared/src/data/rounds.ts`; `economy.ts` is the only place points change (`award`);
  `players.ts` owns down / revive / bleed-out / respawn and the game-over check; `debug.ts` the
  debug commands. `makeGame()` in the testkit starts with the round loop stopped
  (`makeGame(seed, { rounds: true })` to run it).
- Client HUD: `ui/hud.ts` (numeral, banner, downed overlay), `ui/scoreboard.ts` (points list,
  Tab table, results). Scripts that are not about rounds call `__zh.rounds(false)` first.
- Zombies (client): `models/zombie.ts` poses a box rig in code; `models/zombieHorde.ts` draws all
  of them with one instanced mesh per body part — never give a zombie its own meshes.
  `game/entities.ts` owns the actors and their hit boxes, `game/barricades.ts` the planks,
  `game/interact.ts` the "Hold F" prompt.
- The first-person weapon (`game/viewmodel.ts`) is its own scene drawn over the world after a
  depth clear. Gun models come from `models/weapons/` (`Kit` boxes, muzzle at -z, origin at the
  grip); add new guns to the table in `models/weapons/index.ts`.
- Try things in a debug game from the console: `__zh.give('pike')`, `__zh.dummy()`,
  `__zh.spawnZombies(8, { interval: 0.3 })`, `__zh.god(true)`, `__zh.killZombies()`, `__zh.setRound(10)`, `__zh.rounds(false)`,
  `__zh.openDoor('d_mess_bunk')`, `__zh.powerOn()`.
- Tests and visual checks go through `window.__zh` (`client/src/debug.ts`); extend it as features
  land.
