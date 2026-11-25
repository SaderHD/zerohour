# Zero Hour

Browser-based, first-person, round-based co-op zombie survival game (1–4 players), retro low-poly,
all assets generated in code. TypeScript + Three.js client, Node + `ws` authoritative server.

**Read `docs/PLAN.md` before doing anything.** It holds the design, architecture, the 14 build
sessions and the progress checklist (section 9). All 14 sessions are done: the game is shipped
(`README.md` is the player's and host's guide). Later work is maintenance: keep the plan true in
the same commit as any change to what it describes.
A second map, "The Longest Night", is being built: PLAN 4.12 is its design, "The second map" in
section 9 its ten sessions (M1-M10; M1 to M7 are done: all five storeys, from the subway to the roofs, are
blocked out in `shared/src/map/longestNight.ts`, a hidden map until it is finished, and all of it is dressed;
nothing is sold on it yet: mounts, bots, sound and signs are M8).

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
- `npm run bot -- <ROOM> [count]` — headless bot players that join a room and play (shoot, shop, revive).
- `npm run soak -- [seconds] [--shut]` — in-process server + 4 WebSocket bots + 32 zombies; fails if
  a zombie stops making progress for 10 s or the tick goes over budget. (`npm test` runs the same
  soak on a fake clock.)
- `npm run campaign -- [rounds=25] [--god] [--runs=n] [--seed=n] [--players=n] [--accuracy=0.75] [--map=id] [--downs] [--trace] [--ledger]` — a whole
  game played by bots on a fake clock (an hour of play in about a minute). `--god`: the endurance
  run, fails on a stuck zombie, slow tick or fat snapshot. Without it the bots are mortal and it
  reports how far a team gets: run it with `--runs=32` before and after any balance change (eight seeds can be off by rounds)
  (`--downs` tallies what each bot was after, and where, when it went down; `--trace` prints where they and the horde are every ten seconds; `--ledger` what the team earned and spent).
- `npm run ship [-- --here]` — the acceptance run: fresh clone of the last commit, `npm ci`, build,
  `npm start` (no debug commands), four browser players on the autopilot through ten rounds, nothing
  that looks like an error in any console or the server log. About 20 minutes. `--here` uses this
  checkout's build. Writes `test-results/ship-*.png`.
- `npm run rounds` — after a build: two browser players through the round loop (round 1, points,
  late join, down, revive, scoreboard, game over, back to lobby). Writes `test-results/rounds-*.png`.
- `npm run economy` — after a build: one browser player through the purchases (wall gun and ammo,
  door, solo Second Wind, master switch, tonic, Forge, upgraded damage, self-revive). Writes
  `test-results/economy-*.png`.
- `npm run horde` — after a build: browser walk-through of the zombie features (tear, vault,
  attack, damage, rebuild, hit zones, crawler, full horde). Writes `test-results/horde-*.png`.
- `npm run wonders` — after a build: one browser player through session 11 (Cache roll, take, Jinx and move;
  the six power-ups; every Cache gun in the hand; Arclight and Gravewell against 24 zombies; the Siren;
  a howler round). Writes `test-results/wonders-*.png`.
- `npm run audio` — after a build: renders every sound offline to `test-results/audio/*.wav`, checks the
  volume sliders by measuring the output, then records a solo session through everything that makes a
  noise to `test-results/audio-session.webm` (voice limit, shake and damage arcs checked on the way).
- `npm run ux` — after a build: four browser players through session 13 (menu, how to play, settings and
  a rebound key surviving a reload, invite link, lobby chat, pause, in-game chat, ping marker; one
  client killed and restarted mid-round while raw sockets throw junk at the server; the server
  killed and restarted). Writes `test-results/ux-*.png`.
- URL flags for quick testing: `?autostart=1` (straight into a solo game), `?room=ABCD&autostart=1`
  (shared room across tabs), `?name=X`, `?debug=1`, `?auto=1` (the autopilot plays for you).
- `npm run map` — validate the map and rewrite the ASCII dump `docs/MAP.txt` (`npm run map -- <id>`
  checks and prints another map, e.g. `longest_night`, `stacks`, the three-storey proving ground, or `corner`, one block of a city, without writing anything).
- `npm run maps` — after a build: two browser players and a bot; the host picks another map in the lobby,
  pages and seats follow, the game runs on it; a server without debug offers one map. Writes `test-results/maps-*.png`.
- `npm run tour [view...]` — after a build: screenshots of every zone to `test-results/tour-*.png`
  (views are listed in `scripts/tour.cjs` with the height of the floor each stands on; add one when you add
  something worth looking at; a name in its `ON` list is taken again with the power on).
- `npm run site` — after a build: one browser player over Harrow Ridge's heights (the yard's slope and bluff,
  the lab stairs, the tunnel's ramps, the gallery, the dock, the vault's two flights; shots and prompts by floor;
  zombies following up and down). Writes `test-results/site-*.png`.
- `npm run heights` — after a build: one browser player on the Stacks (server started with `ZH_MAP=stacks`,
  the map its rooms start on; the client follows its room's map, or takes `?map=stacks`): up the ramp and the stairs, the ledge, shots
  and prompts by floor, a zombie climbing three storeys. Writes `test-results/heights-*.png`.
  `npm run tour -- --stacks` photographs every part of it (`tour-stacks-*.png`); `npm run tour -- --corner` the Corner (`tour-corner-*.png`), `npm run tour -- --night` The Longest Night
  (`tour-night-*.png`; a view named `air-*` is the free camera at that height).
- `npm run smoke` — after a build: boots the server, drives headless Chromium, checks handshake
  and rendering, writes `test-results/smoke.png`. Uses the globally installed `playwright`; do not
  add it as a dependency in the cloud environment.

## Layout notes
- `@zh/shared` is consumed as TypeScript source by both sides (no build step). Config files
  (`vite.config.ts`) cannot import it.
- Coordinates: metres, x east, z south, y up, 0.5 m cells. Yaw 0 looks north (−z), positive turns
  left.
- Maps: `shared/src/map/maps.ts` lists them (`MAPS`; `hidden` ones are proving grounds only a debug server
  offers). A room has a map, picked by its host in the lobby; never assume the station: take the map from the
  game (`g.map`), the room, or `compiledMap(id)`. What is the place and not the engine is `MapDef.scene` (sky,
  what the solid is from outside, what stands beyond the map, snow, default fog, the menu's vista) and `ZoneDef.air` (its drone, a name in
  `audio/ambience.ts`); numbers one map needs different go in `MapDef.rules`, read with `rulesOf(def)`. The
  client builds one map per page load (`followMap` in `main.ts` reloads for another).
- A city's outside (PLAN 6.1; the Corner, `map/corner.ts`, proves it): with `scene.built: 'city'` the solid is
  buildings. `MapDef.blocks` give each its height, face (a wall style) and tint; `massing(map)` (shared) is the
  top of every column; `render/city.ts` draws each building from where the street's walls stop (`Room.ceil` of the
  outdoor room, 4 m) up to it: windows, cornice, parapet, snowed roof, tanks. Give a block the wall style and tint
  of the half-metre strip room in front of it, or the seam shows; a shop front is the strip alone. A walked roof is
  an outdoor room a storey up in a block with `parapet: 0`: its edge over a street or a lower roof is open (put a
  `rail`), against a taller block it is that block's wall. `render/towers.ts` is the ring beyond the map,
  `paintCity` in `render/sky.ts` the sky. Sight and shots know the heights: above `map.skyline` (the massing's
  tops) a point in no cell is in the air (`map.aloft`), so `lineOfSight`, `rayWorld` and grenades pass over a
  lower roof or parapet. Never write "under the sky, so no top": ask `map.cap[i]` (a cell's air ends at its
  ceiling, or at the underside of a floor that hangs over it; `map.deck` marks such a floor).
- The Longest Night (`map/longestNight.ts`; PLAN 4.12 "As blocked out"): streets are a room plus half-metre
  strips (`alongX`/`alongZ`: each stretch gives its wall a face and a tint; match the block behind). The subway
  is levels -1 (-4 m) and -2 (-8 m) under open street. A flight that reaches the street must stand inside a
  building (its room is tall: `FLIGHT`), one that climbs to a pavement rises `STOREY + KERB`. A door or a
  barricade cut through solid needs a block over it or it stands under 14 m of default brick. Upstairs is level 1
  (+4 m), the roofs level 2 (+8 m). A walked roof is a block with `parapet: 1` whose room stops half a metre
  short of every edge with something lower beyond (that strip is the parapet) and runs right up to a taller
  neighbour. A window's pocket is a yard, or `behind: 'air'` (the `ledge` helper: planks in the open, over a
  street or a lower roof; in a parapet the window is a gap) or `behind: 'tunnel'` (`dark`: roofed, under a
  street or the next floor). Only a floor that is itself outdoors may lie over an outdoor one (the bridge).
  Its dressing is `map/dressing/nightStreets.ts` (the square, the avenue, the lane), drawn by two kits:
  `models/props/street.ts` (cars, the bus, kiosk, trestles, gratings) and `models/props/festive.ts` (the tree,
  bulbs, wreaths, stalls, the rink; what glows there is `glow: 'on'`, never on the mains). Indoors it is
  `map/dressing/nightHalls.ts` (Abelard's on both floors, the Lyric, St Audra's), with `models/props/store.ts`
  (shelves, counters, dummies, the grotto, the railway) and `models/props/halls.ts` (seats, screen, projector,
  pews, altar, organ, glass); things upstairs go through its `up([...])`. The diner, the tenement and both roofs
  are `map/dressing/nightHomes.ts` (`models/props/diner.ts`, `home.ts`, `roofs.ts`), the subway
  `map/dressing/nightSubway.ts` (`models/props/subway.ts`: the train's side is `train_side` on the platform's
  wall, between its doors); a storey other than the street goes through `onLevel(n, [...])`, and a light there
  takes `level` and a height over that floor. The fire escape is iron by its surfaces (floor `metal`, the
  `iron` wall style on the strip `lane_iron` along its foot) and the prop `fire_escape`; each `behind: 'air'`
  window gets a `ledge_iron` from `ledgeIron(o)` in `longestNight.ts`. A street's wall face is
  the outer edge of its half-metre strip: stand a solid prop right on it or 1.5 m off. `strung('light_string' |
  'washing_line', x0, z0, y0, x1, z1, y1)` hangs something between two points (`PropInst.y2` is the far end);
  a street lamp is `fixture: 'post'`; `k.steam(x, y, z)` in a builder makes a plume (`render/ambient.ts`). Where
  solid has a top, so has a tall prop under the sky (`map.shutAt(i, y)`: ask that, not `shut`, when you have a
  height). Tests:
  `shared/src/map/longestNight.test.ts` (layout), `server/src/game/night.test.ts` (soak across it).
- Height (PLAN 6.1-6.3): the grid is a stack of layers, one per storey (`Room.level`, floor height
  `Room.y`, ramps and stairs as `Room.rise`). Cells join where their floors are within `STEP_HEIGHT`
  (`CompiledMap.links`); anything taller is a ledge nobody crosses. Whatever stands somewhere has a
  `y` (the floor underfoot) and every lookup takes it: `walkAt(cx, cz, y)`, `zoneAt(x, y, z)`,
  `moveCircle(map, open, x, y, z, ...)`, `lineOfSight(map, x0, y0, z0, x1, y1, z1)`,
  `field.costAt(x, y, z)`. Never test two bodies by x and z alone: compare `y` against `FLOOR_GAP`
  as well. `map.idx(cx, cz)` without a layer is the ground. On the client, draw things at
  `map.footAt(x, y, z)` (a ramp is drawn as a slope), ask `world.lightAt` at the thing's real height,
  and give a sound's `at` the `y` of the floor it is made on.
- Harrow Ridge is terraced (PLAN 4.11): `map/terraces.ts` has the floor heights (`TERRACE_N` +1.5 the lab and
  cold store, `TERRACE_S` -1.5 the low yard, motor pool and bunker, `GALLERY_Y` 3, `VAULT_Y` -4.5). Never write
  one as a number. A prop stands on whatever floor is under it; a light's `y` is absolute on the ground storey, so
  each wing lists its lights over its own floor and lifts them (`lift(TERRACE_N, labLights)`); things on the
  gallery or in the vault take `onLevel(1 | -1, [...])`. A room is several rectangles of one zone (`room(...)` in
  `harrowRidge.ts`); where a floor ends in a drop put a `rail(...)` just inside the edge (`stairRail` down a
  flight). Nothing solid stands on a ramp or stairs. In tests and scripts stand things on the floor that is there:
  `spawnZombie(g, null, x, TERRACE_S, z, ...)`, `teleport(x, z, yaw, y)`, `lookAt(e.x, e.y + 1.2, e.z)`.
- World lighting is baked into vertex colours by `client/src/render/bake.ts` (`Baker`); the scene's
  white ambient light only passes it through. Lights that change (mains lights before/after the
  power, flames, failing tubes) are extra baked attributes scaled by uniforms in `materials.ts`.
- Props: add the footprint to `shared/src/data/props.ts`, a builder to `client/src/models/props`
  (drawn with `Kit` boxes/prisms, front towards -z, registered in its `index.ts`) and place it in
  `shared/src/map/dressing/<wing>.ts`. Solid props are whole 0.5 m cells in the collision grid:
  leave gaps of nothing or at least 1.5 m, then run `npm run map`. Lamps are drawn from
  `LightDef.fixture`. Door shutters and debris live in `render/doors.ts`.
- Things players buy: one line in `shared/src/map/dressing/mounts.ts` makes both the prop
  (`wallbuy`, `tonic`, `cache_site`) and the `Interactable`. The yard's walls take their look from
  the half-metre strip rooms round its edge (`yard_n_mess`...), not from the buildings behind.
- Outside the walls (never walkable): `render/exterior.ts` builds roofs, stacks and pines from the
  room list (a building's shell is worked out a column at a time, so rooms that abut share walls); `render/snow.ts` drops snow wherever a cell is open to the sky. Signs: `arrow()` in
  the dressing helpers paints `< TEXT` / `TEXT >`; tiles live in the atlas in `render/signs.ts`.
- Ambient motion: a builder draws a turning part through `k.mover(x, y, z, axis, motion)` (spin or
  swing; `powered` spins wait for the mains) and marks a roof leak with `k.drip(...)`;
  `render/ambient.ts` animates them and the floor mist of rooms with `mist: true`. Keep movers
  few: each is a draw call. `ZoneDef.fog` sets a zone's air (`render/atmosphere.ts`).
- Bots: `shared/src/bot/mind.ts` (`BotMind.think(view) -> intent`; its shopping list is `wants.ts`) is the only place a bot decides
  anything; teach it there when the game gains something to buy or do (`bot/deadends.ts` tells it which
  rooms lead nowhere). Judge a change to it, or to any balance number, over 32 seeds at least: eight say little. It is driven by
  `server/src/bot.ts` (`BotPlayer`: wire messages, modelled aim), `server/src/game/campaign.ts` (fake
  clock) and `client/src/game/autopilot.ts` (key presses through the real client code).
- World meshes are one per zone and surface style plus three per zone for props (`worldBuilder.ts`),
  so three.js culls whole zones; keep new static geometry in those buckets.
- Server: `lobby.ts` (rooms, seats, reconnect, chat; transport-agnostic via `Peer`) and `game/Game.ts`
  (the match; `step(dt)` is pure so tests drive it without timers). Client: `net/net.ts` is the
  connection/lobby state machine, `main.ts` builds everything and runs the frame loop,
  `game/match.ts` holds the round / life / doors as the server reports them and `game/events.ts`
  applies `sync`, `snap` and every `ev` (a new event's handling goes in its switch).
- Untrusted input: a new client message needs a line in `shared/src/wire.ts` (`CHECKS`, or the
  decoder turns it away) and, if it can be spammed, a bucket in `server/src/link.ts`. `Link` is the
  per-client path (decode, rate limit, handshake) that `fuzz.test.ts` drives; `connection.ts` is only
  the socket and its timeouts.
- Settings and keys: `client/src/settings.ts` (saved in `localStorage`; `ACTIONS` lists what can be
  rebound). Game code asks `Input` for an action's *default* code (`input.down('KeyF')`); `Input`
  maps the physical key to it, so never read `KeyboardEvent`s yourself. Prompts name a key with
  `settings.label('use')`. Screens over the game (`ui/screens.ts`: settings, help, pause, the
  connection notice) are switched by `body[data-panel|data-paused|data-net]` in CSS; while
  `screens.blocking` or `chat.open` the game takes no input.
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
- Buying (server): every F press lands in `game/interact.ts` — doors (`doors.ts`), then the map's
  interactables by id (wall buys there, tonics in `perks.ts`, the Forge in `forge.ts`, the master
  switch), else the barricade. Refusals go to the one player as `denied {reason}`.
  Tonic prices and effect numbers are in `shared/src/data/perks.ts`; read an effect through its
  helper (`maxHpWith(perks)`, `fireRateMultWith`, ...) on both sides. A held weapon's stats are
  `weaponStats(id, upgraded)`, never `weaponDef` (that is the unforged table entry).
- Buying (client): `game/interact.ts` picks the prompt and sends the press; `game/forgeView.ts`
  shows the weapon in the Forge; upgraded gun models come from `buildWeapon(id, hands, true)`.
- Cache, drops, wonder weapons (server): `game/cache.ts` (a box per site, `home`, the Jinx; table and
  weights in `shared/src/data/cache.ts`), `game/powerups.ts` (drops, pick-up, effects; timed ones are
  `Game.effects`, read with `g.effectOn(kind)`; list in `shared/src/data/powerups.ts`). Chance for
  these comes from `g.luck`, not `g.rng`. The Arclight is `arc()` in `combat.ts` (`chainTargets` in
  shared); the Gravewell's orb becomes a `well` projectile that `zombies.ts` drags bodies to; a Siren
  is a `siren` projectile that `nav.ts` turns into `nav.lure`. Howlers are `ZombieKind 'howler'`
  through the same brain: `spawner.ts` picks a spot inside, sends `strike`, and they arrive a moment later.
- Cache, drops, wonder weapons (client): `game/cacheView.ts`, `game/pickups.ts` (models in
  `models/pickups.ts`), `game/bolts.ts` (all lightning, one instanced mesh), `models/howler.ts`. A gun's
  glowing parts are `Kit.glow(...)` in `models/weapons/kit.ts`.
- Client HUD: `ui/hud.ts` (numeral, banner, downed overlay), `ui/scoreboard.ts` (points list,
  Tab table, results). Scripts that are not about rounds call `__zh.rounds(false)` first.
- Zombies (client): `models/zombie.ts` poses a box rig in code; `models/zombieHorde.ts` draws all
  of them with one instanced mesh per body part — never give a zombie its own meshes.
  `game/entities.ts` owns the actors and their hit boxes, `game/barricades.ts` the planks,
  `game/interact.ts` the "Hold F" prompt.
- The first-person weapon (`game/viewmodel.ts`) is its own scene drawn over the world after a
  depth clear. Gun models come from `models/weapons/` (`Kit` boxes, muzzle at -z, origin at the
  grip); add new guns to the table in `models/weapons/index.ts`.
- Try things in a debug game from the console: `__zh.give('pike')` (`give('pike', true)` upgraded,
  `give('ironhide')` a tonic, `give('siren')` decoys, `give(5000)` points), `__zh.dummy()`,
  `__zh.powerup('reaper')`, `__zh.cacheNext('arclight')` (or `'jinx'`), `__zh.setRound(6, true)` (a howler round),
  `__zh.spawnZombies(3, { kind: 'howler' })`,
  `__zh.spawnZombies(8, { interval: 0.3 })`, `__zh.god(true)`, `__zh.killZombies()`, `__zh.setRound(10)`, `__zh.rounds(false)`,
  `__zh.openDoor('d_mess_bunk')`, `__zh.powerOn()`, `__zh.chat('hi')`, `__zh.ping()`,
  `__zh.auto(true)`, `__zh.pick()` (what mesh is under the crosshair), `__zh.fly(24, 30, 20, 0, -1.2)` (the free camera in the air), `__zh.settings.set({ fov: 90 })`, `__zh.settings.bind('use', 'KeyE')`, `__zh.screens.setPaused(true)`.
- Sound (`client/src/audio`): `synth.ts` is the engine (a `Voice` of `tone`/`noise` layers; 24 at once,
  by `priority`; `at` places it in the world); the library is `guns.ts`, `sfx.ts`, `music.ts` (tunes as
  note lists) and `ambience.ts` (zone drones, heartbeat). `audio.ts` turns game events and each frame's
  state into calls on those — a new event's sound goes in its `event()` switch, which runs before the
  game applies the event. Every sound also gets a line in `catalogue.ts` so `npm run audio` checks it;
  hear one with `__zh.audio.play('shot-pike')` (`__zh.audio.names()` lists them). No audio files, ever.
- Feel: `game/feel.ts` (`Shake.add`/`blast`, `recoilFor`), `ui/damage.ts` (direction arcs); the viewmodel
  takes `hitStop`, `flinch`, `dryFire`.
- Tests and visual checks go through `window.__zh` (`client/src/debug.ts`); extend it as features
  land.
