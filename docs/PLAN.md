# Zero Hour — Design, Architecture & Build Plan

A browser-based, first-person, round-based co-op zombie survival game (1–4 players) with a
deliberately retro low-poly look. Every asset — models, animation, textures, sound — is generated
in code. No binary assets are checked in.

This document is the single source of truth for any agent working on the project. Read sections
1–7 once, then work the session you were assigned in section 8.

---

## 1. Scope and ground rules

**The genre loop we are building:** survive endless rounds of zombies; earn points for hits and
kills; spend points on doors, wall weapons, perks, a random weapon crate and weapon upgrades; turn
on the power; grab timed power-ups; revive downed teammates; game ends when everyone is down.

**Originality rule (hard requirement).** We reuse the *mechanics* of the round-based zombies genre.
We do **not** reuse any existing game's names, characters, maps, weapon designs, perk
names/jingles/machine designs, logos, UI look, or audio. Everything in this doc already uses
original names — keep it that way and never "fix" a name to match a known game.

**Cuts made on purpose** (do not add unless asked): jumping/mantling, multi-floor walkable
geometry, PvP, persistent accounts/progression, easter-egg quests, mobile/touch controls,
matchmaking (room codes only), host migration.

**Targets:** 60 fps on an integrated-GPU laptop in Chrome/Firefox; 4 players + 32 live zombies;
playable at 150 ms ping.

---

## 2. Tech stack

| Concern | Choice | Why |
|---|---|---|
| Language | TypeScript (strict) everywhere | Shared types/data between client and server |
| Rendering | Three.js (WebGL2) | Primitives + flat shading are easy to author in code |
| Client build | Vite | Fast, zero-config TS |
| Server | Node 22 + `ws` | One process serves the built client and WebSockets |
| Tests | Vitest (unit/sim), Playwright (smoke) | Sim is headless-testable |
| Layout | npm workspaces: `shared`, `server`, `client` | |
| Audio | Web Audio API, synthesized | No asset files |

No other runtime dependencies without a strong reason. No physics engine, no ECS library, no
netcode library, no UI framework (HUD/menus are plain DOM + CSS over the canvas).

```
zerohour/
  CLAUDE.md               agent quick-start (commands, rules)
  docs/PLAN.md            this file
  package.json            workspaces + root scripts
  shared/src/
    constants.ts          tick rates, speeds, economy numbers
    protocol.ts           all message types (client<->server)
    data/                 weapons.ts perks.ts powerups.ts props.ts rounds.ts
    map/                  types.ts  harrowRidge.ts  compile.ts  validate.ts
    nav/                  grid.ts  flowfield.ts  los.ts
    math/                 vec.ts  rng.ts (seeded)
  server/src/
    index.ts              http static + ws upgrade
    lobby.ts              rooms, codes, join/leave
    game/                 Game.ts (tick loop) + one file per system:
                          players, zombies, spawner, rounds, combat, economy,
                          doors, barricades, perks, cache, forge, powerups, power
    bot.ts                headless bot client for load/soak tests
  client/src/
    main.ts  net/ (socket, interpolation)  input/
    render/               renderer.ts (retro pipeline), worldBuilder.ts, materials.ts
    models/               zombie.ts player.ts weapons/*.ts props/*.ts  rig.ts anim.ts
    game/                 localPlayer.ts viewmodel.ts entities.ts interact.ts fx.ts
    audio/                synth.ts sfx.ts music.ts
    ui/                   hud.ts menu.ts lobby.ts scoreboard.ts settings.ts
    debug.ts              window.__zh test hooks
```

---

## 3. Art direction — "draw it in code"

**Look:** late-90s console horror. Chunky, readable, moody.

- **Retro pipeline:** render the scene to a 480×270 target (configurable 1×/2×), upscale with
  nearest-neighbour to the window. Optional ordered-dither/colour-quantise post pass. This hides
  low detail and makes everything cohere.
- **Geometry:** boxes, wedges, cylinders (≤8 sides), extruded 2D profiles. Flat shading only.
  Budget: zombie ≤ 150 tris, prop ≤ 100, weapon viewmodel ≤ 250.
- **Colour:** vertex colours from a fixed ~32-colour palette (`materials.ts`). No image files.
  Where surface detail is needed (floor tiles, planks, snow, signage), generate small 16–64 px
  `CanvasTexture`s procedurally with `NearestFilter`.
- **Lighting:** hemisphere + one dim directional + distance fog do most of the work. Bake fake AO
  and light pools into vertex colours at world-build time. At most ~6 real point lights active
  (nearest to camera), flickering ones for mood. Emissive materials for lamps, screens, perk
  dispensers, power-ups. Lights and emissives switch on when power is turned on.
- **Characters:** hierarchical box rigs (`rig.ts`): pelvis, torso, head, 2-segment arms and legs.
  Animation is procedural (`anim.ts`) — sine-driven walk/run/shamble cycles keyed off movement
  speed, additive attack swing, hit flinch, vault, crawl, and a short tween-to-ground death then
  fade. Zombies get per-instance variation from a seed (height, palette, missing arm, head tilt,
  gait) and glowing eyes so they read in the dark.
- **Viewmodels:** each weapon is a function returning a `Group` with named pivots (`muzzle`,
  `mag`, `slide`). Animations are code tweens: sway/bob, recoil kick, reload (mag drop/insert),
  pump/bolt, sprint lower, swap raise.
- **FX:** muzzle flash quad + 1-frame light, tracer lines, blood = small box particles, bullet
  impact puffs, power-up spin+glow+bob, lightning = jittered line segments.
- **Static world** is merged into a few meshes per zone (see map compile). Zombies/props that
  repeat use shared geometries.

---

## 4. Game design

All numbers live in `shared/src/data` and `constants.ts` so balance never requires code changes.

### 4.1 Player
- Walk 4.5 m/s, sprint 6.5 m/s (4 s stamina, 2 s regen delay), no jump. Capsule radius 0.35 m.
- 100 HP, a zombie hit deals 45 (two hits down you inside a short window); regen to full after 4 s
  without damage. Red vignette + heartbeat when hurt.
- Two weapon slots, knife melee (150 dmg, 0.6 s), 2 frag grenades (refill +1/round, max 4).
- Controls: WASD, mouse look (pointer lock), LMB fire, RMB aim (FOV zoom + tighter spread),
  R reload, Shift sprint, F interact/revive (hold), V melee, G grenade, Q/1/2/wheel swap,
  Tab scoreboard, Esc menu.
- **Downed:** crawl-speed 0, pistol only, 45 s bleed-out; teammate holds F for 3 s to revive.
  Going down loses all perks. Bled-out players spectate and respawn at the start of the next round
  with the starting pistol and 1,500 points minimum. All players down ⇒ game over.
  **Solo:** the Second Wind perk gives an automatic self-revive (max 3 purchases per game).

### 4.2 Points
| Event | Points |
|---|---|
| Non-lethal hit | 10 |
| Kill (body) / headshot / melee | 60 / 100 / 130 |
| Grenade or wonder-weapon kill | 50 |
| Rebuild one barricade plank | 10 (max 50 + 50×round per round) |
| Revive a teammate | +100 to the reviver |
| Go down | −5% points |

Start with 500.

### 4.3 Rounds
- Zombies per round come from a function in `rounds.ts`, scaled ×(1 + 0.5·(players−1)). Solo
  reference values to fit: R1 6, R2 8, R3 13, R5 24, R10 46, R20 110.
- Max alive at once: 24 solo, +3 per extra player (cap 32).
- Zombie HP: R1 150, +100 per round through R9, ×1.1 per round after.
- Speed mix: R1–2 all shamblers (1.0 m/s); from R3 a growing share of walkers (2.2 m/s); from R6
  runners (4.8 m/s); by R10 mostly runners. Spawn interval shrinks from 2.0 s to 0.25 s.
- 10 s intermission between rounds with a round-change stinger; the last few stragglers switch to
  runners so a round never stalls.
- **Howler round:** every 5–7 rounds, replaces zombies with ~`8·players + 2·r` "Howlers" —
  fast, low-HP, quadruped ghouls that spawn inside playable space with a lightning-strike tell. The
  last one killed always drops a Resupply.

### 4.4 Zombies
- Spawn outside the map at spawn points tied to a **barricade window** of an *active* zone (a zone
  with a player in it or adjacent through an open door). Walk to window → tear planks (1 per
  1.5 s, 6 planks) → vault → chase.
- Chase nearest reachable player by flow field (section 6.3), with separation steering. Attack
  when within 1.0 m: 0.5 s wind-up, hit if still within 1.3 m.
- Hit zones: head ×4 (weapon-specific), torso ×1, limbs ×0.75. Legs destroyed by explosives ⇒
  crawler (slow, low attack).
- Players in the same window area can hold F to rebuild planks (1 per 1.0 s) when no zombie is
  attacking it.

### 4.5 Weapons (all names fictional)
| Weapon | Class | Source | Cost | Notes |
|---|---|---|---|---|
| M9 "Warden" | pistol | start | — | 8+32, semi |
| "Dockhand" .38 | revolver | box | — | high dmg, 6 rounds |
| "Farrow" M1 | semi rifle | wall (Mess Hall) | 500 | |
| "Pike" 12 | pump shotgun | wall (Mess Hall) | 500 | 8 pellets |
| "Stitch" SMG | SMG | wall (Bunkhouse) | 1000 | |
| "Coachman" | double-barrel | wall (Motor Pool) | 1200 | |
| "Kestrel" AR | assault rifle | wall (Laboratory) | 1500 | |
| "Brakeman" SMG | fast SMG | wall (Cold Storage) | 1500 | |
| "Halberd" LMG | LMG | box | — | 100-round belt |
| "Longwatch" | bolt sniper | box | — | pierces 3 |
| "Ferrier" auto-shotgun | shotgun | box | — | |
| "Thumper" | grenade launcher | box | — | splash, self-damage |
| **"Arclight"** | wonder weapon | box only | — | bolt chains to up to 8 zombies within 5 m; kills through R30+ |
| **"Gravewell"** | wonder weapon | box only | — | slow orb; on impact a 3 s singularity pulls zombies in, then implodes |
| "Siren" decoy | tactical (replaces grenades slot 2) | box only | — | thrown lure; zombies chase it 6 s, then it explodes |

Wall buys also sell ammo (half price; upgraded ammo 4,500). Weapon stats schema:
`damage, headMult, rpm, auto, magSize, reserve, reloadTime, spreadHip, spreadAim, pellets, range,
falloff, pierce, moveSpeedMult, recoil, projectile?`. Every weapon has an upgraded variant
(new name, ×2–3 damage, bigger mag, recoloured model with emissive trim; wonder weapons gain a
stronger effect).

### 4.6 Perks — "Tonics"
Bought from wall-mounted tonic dispensers (glowing canister machines, one colour each). Require
power. Max 4 per player. Lost on down.

| Tonic | Cost | Effect | Location |
|---|---|---|---|
| Ironhide | 2500 | Max HP 100 → 250 | Comms Bunker |
| Second Wind | 1500 (solo 500) | Revive 2× faster; solo self-revive | Mess Hall (works without power in solo) |
| Quickhands | 3000 | Reload 2× faster | Motor Pool |
| Hair Trigger | 2000 | +33% fire rate | Laboratory |
| Marathon | 2000 | Sprint 2× longer, +8% speed | Bunkhouse |
| Packmule | 4000 | Third weapon slot (lost with the perk) | Cold Storage |

### 4.7 The Cache (random weapon crate)
950 points. Lid opens, weapons cycle for 4 s, result floats for 10 s for the buyer to take (F).
Weighted table excluding weapons the buyer holds; wonder weapons ~4% each, max one of each in the
game at a time. After 4–8 uses the roll can produce a **Jinx** (a cackling skull): points are
refunded and the Cache relocates to another of its 5 possible sites, marked by a sky beam. Works
without power.

### 4.8 The Forge (weapon upgrade)
In the Vault behind the Comms Bunker; the vault door only opens when power is on. 5,000 points,
3 s process, upgraded weapon must be collected within 15 s.

### 4.9 Power
Master switch in the Generator Hall. Turning it on: lights/emissives up, tonic dispensers and the
Forge activate, the Vault door opens, one global audio sting. Permanent.

### 4.10 Power-ups
2% drop chance per zombie kill (inside playable space only), max 4 per round, each type once per
cycle before repeating. Float for 30 s (blink in the last 8). Team-wide.

| Power-up | Effect |
|---|---|
| Resupply | All players' reserve ammo and grenades full |
| Reaper | 30 s: any hit kills |
| Double Up | 30 s: double points |
| Firestorm | Kills all live zombies, +400 each player |
| Rebuild | All barricades restored, +200 each player |
| Clearance | 30 s: the Cache costs 10 and appears at every site (only drops after the Cache has moved once) |

### 4.11 Map — "Harrow Ridge Station"
A snowed-in 1970s mountain signals outpost. One walkable level, 70 × 70 m (see `docs/MAP.txt`), eight zones in a loop
plus one spur, so there are good "training" circuits and no dead-end deathtraps except the Vault.

```
                 [Laboratory]====1250====[Cold Storage]
                      ||                       ||
                     1000                     1000
                      ||                       ||
   [Bunkhouse]==750==[Mess Hall]         [Generator Hall]  <- POWER
                      (spawn)                  ||
                        ||                    1250
                       750                     ||
                        ||                     ||
                   [Courtyard]=====1000=====[Motor Pool]
                        ||
                       1250
                        ||
                  [Comms Bunker]--(power)--[Vault: FORGE]
   Bunkhouse also connects to Laboratory via the Washroom corridor (door 1000 is that link).
```

| Zone | Approx. size | Dressing (must be visibly furnished) | Windows | Contents |
|---|---|---|---|---|
| Mess Hall (spawn) | 14×10 | long tables, benches, serving counter, stove, pots, notice board, overturned chairs | 3 | Farrow, Pike, Second Wind |
| Bunkhouse + Washroom | 16×8 + 6×4 | bunk beds, lockers, footlockers, pot-belly stove, sinks, stalls | 2 | Stitch, Marathon, Cache site |
| Laboratory | 16×12 | lab benches, glass specimen tanks (emissive), tape-reel computers, chalkboards, toppled shelves | 2 | Kestrel, Hair Trigger |
| Cold Storage | 20×7 | shelving aisles, crates, ice blocks, hanging hooks, frost fog | 2 | Brakeman, Packmule, Cache site |
| Generator Hall | 14×12 | 2 big generators (animated when on), pipes, catwalk overhead (visual only), fuel tanks, switch panel | 2 | Power switch |
| Motor Pool | 16×12 | truck on jacks, workbench, tool boards, tyre stacks, oil drums, roller door (shut) | 2 | Coachman, Quickhands, Cache site |
| Courtyard (outdoor) | 26×20 | snow, parked truck + snowcat, crate stacks, flagpole, radio mast base with guy wires, floodlights, fence, falling snow particles | 3 fence breaches | Cache start site |
| Comms Bunker | 12×10 | console banks with blinking lights, radar scope, map table, radio racks | 2 | Ironhide, Cache site |
| Vault | 6×6 | the Forge, cable bundles, warning stripes | 0 | Forge |

Props that are ≥0.5 m tall block movement (and bullets if tall); small clutter is non-colliding.
Keep every lane ≥1.5 m wide. Varied ceiling heights, skybox gradient with mountains silhouette and
aurora for the outdoor zone.

---

## 5. Multiplayer architecture

**Model: authoritative server for the world, trusted-but-verified clients for their own body and
aim.** This is co-op with friends, so we optimise for feel and simplicity over cheat-proofing.

- **Rooms:** client opens `ws://host/ws`, sends `create` or `join {code}` (4-letter code) with a
  name. Lobby shows players + ready state; host starts. Late join allowed — spawns next round.
  Disconnect: slot held 60 s for reconnect (token in `sessionStorage`), then dropped. Solo play
  is just a room of one — there is no separate offline code path.
- **Server sim:** fixed 30 Hz tick in `Game.ts`; systems run in a fixed order. Snapshots broadcast
  at 15 Hz. All randomness through a seeded RNG owned by the game.
- **Server owns:** zombies (position, state, HP), rounds, spawning, points, ammo counts, weapons
  inventory, perks, doors, barricades, power, Cache, Forge, power-ups, player HP/downs/revives.
- **Client owns (server sanity-checks):**
  - *Own movement.* Client simulates locally with shared collision code and sends
    `{pos, yaw, pitch, moveState}` at 20 Hz. Server rejects moves that exceed max speed ×1.5 or
    land in a blocked nav cell and replies with a `correct` snap.
  - *Hit detection ("favour the shooter").* Client raycasts against the zombies it is rendering
    and sends `fire {weapon, seq, hits:[{zombieId, zone, dist}]}`. Server validates fire rate and
    ammo (which it tracks), zombie alive, distance within range + slack, and coarse line of sight
    on the nav grid, then applies damage and awards points. Projectiles (grenades, Thumper,
    Gravewell, Siren) are fully server-simulated.
- **Client presentation:** other players and zombies are interpolated ~120 ms in the past from a
  snapshot buffer; own firing/reload/recoil play immediately and reconcile ammo from snapshots.
  One-shot events (`hitConfirm`, `zombieDied`, `pointsPopup`, `powerupTaken`, `sfx`) are discrete
  messages, not snapshot state.
- **Wire format:** JSON to start, with compact arrays for entity lists in snapshots
  (`[id, x, z, yaw, state, hpFrac]`). Static/slow state (doors, power, barricades, perks owned,
  Cache site) is sent on change + in a full `sync` on join. Only switch to binary if profiling
  demands it.
- **Protocol** is defined once in `shared/protocol.ts` as discriminated unions
  (`ClientMsg`, `ServerMsg`); both ends import it. Bump `PROTOCOL_VERSION` on breaking change;
  server rejects mismatches.
- **Deployment:** `npm run build` then `node server/dist/index.js` serves `client/dist` and `/ws`
  on one port (`PORT`, default 8080). Include a small Dockerfile. In dev, Vite proxies `/ws`.

---

## 6. Core technical designs

### 6.1 Map format — "carved from solid"
The map is data (`shared/map/harrowRidge.ts`), in metres, on a 0.5 m grid. Everything is solid
until carved:

```ts
interface MapDef {
  size: { w: number; d: number };
  rooms: Room[];        // {id, zone, x, z, w, d, ceil, floorStyle, wallStyle, outdoor?}  open floor rects
  openings: Opening[];  // {id, kind:'arch'|'door'|'window', x, z, w, d, cost?, needsPower?, zones:[a,b], out?, pocket?}
  props: PropInst[];    // {type, x, z, rot, variant?}  footprint/collision come from data/props.ts
  interactables: Inter[]; // wallbuy, tonic, cacheSite, powerSwitch, forge — {kind, ref, x, z, facing}
  playerSpawns: Vec2[]; lights: LightDef[];
}
```

`compile.ts` (shared, pure) rasterises this to a `CompiledMap`: a cell grid (solid / floor / door /
window / outside-pocket) with per-cell zone, open height interval, surface styles and tint, plus
the zone adjacency graph and generated zombie spawns. The **server** uses it for collision
validation, nav and LOS. The **client** `worldBuilder.ts` turns it into one mesh per surface
style: floors, ceilings and wall quads wherever a cell's open height interval is not matched by
its neighbour (this one rule yields walls, door lintels, window sills and jambs), with all
lighting baked into vertex colours (zone ambient + light pools with grid line of sight + fake AO).

**Windows** carve a walled, roofless pocket (3 m deep by default) behind them; zombies spawn at
the back of the pocket, so `spawns` is generated, not authored. Pockets need solid ground behind
the wall — the validator rejects pockets that overlap rooms or each other.

`validate.ts` runs in tests and fails the build if: any zone is unreachable with all doors open;
any window/spawn can't path to the player spawn; a prop seals a lane (<1.5 m); interactables are
not adjacent to floor; rooms overlap. `npm run map` validates and writes an ASCII top-down dump to
`docs/MAP.txt` — **agents must look
at that dump (and a screenshot) after any map edit.**

### 6.2 Collision
2D only. Players and zombies are circles against the cell grid + prop AABBs (slide along walls).
Hitscan: client rays against zombie hit boxes (head/torso/limb boxes on the rig) and world meshes;
server LOS is a grid DDA (`los.ts`). Closed doors and unbroken windows are solid cells.

### 6.3 Navigation
`flowfield.ts`: BFS/Dijkstra over walkable cells from each living player's cell, recomputed every
250 ms (staggered across ticks) and immediately when a door opens. Each zombie samples the field of
its target player, adds separation from neighbours (spatial hash) and a little per-zombie lateral
noise so hordes don't single-file. Zombies re-pick target every 1 s (nearest by field distance;
Siren decoys override). Outside the map, a zombie walks a straight line spawn → window.

### 6.4 Server system order (per tick)
`inputs → players (regen, stamina, bleedout, revive) → spawner → zombies (AI, move, attack) →
projectiles → combat resolution → powerups → interactables (doors, cache, forge, perks) →
rounds → events flush → snapshot (every 2nd tick)`

Each system is a module with `update(game, dt)` operating on plain data in `GameState`. Keep
systems pure enough to unit-test with a fake clock and seeded RNG (no sockets, no timers inside).

### 6.5 Interaction
Server-side: each interactable has a position + radius + optional facing. Client shows the prompt
for the nearest valid one in view ("Hold F — Kestrel AR [1500]"); pressing F sends
`interact {id}`; the server re-checks range, cost, power and state. One generic path for doors,
wall buys, tonics, Cache, Forge, power switch, barricade rebuild and revive.

### 6.6 Testing & debug hooks (required — this is how agents verify work)
- `window.__zh` in dev: `state()`, `teleport(x,z)`, `give(weapon|perk|points)`, `setRound(n)`,
  `spawnZombies(n)`, `god(bool)`, `freeCam()`, `openAllDoors()`, `powerOn()`. Matching server-side
  `debug` messages, enabled only when `ZH_DEBUG=1`.
- URL flags: `?room=CODE&name=X&autostart=1&debug=1`.
- `server/src/bot.ts`: headless WS client that joins a room, walks the flow field away from
  zombies and shoots — used for 4-player soak tests and perf checks.
- Vitest for sim (rounds maths, points, damage, flow field, map validation, cache weights).
- Playwright smoke test: boot server, load client, start solo, assert canvas renders and HUD shows
  round 1; save a screenshot. Agents should also take and *look at* screenshots when changing
  visuals.

---

## 7. Working rules for agents

1. Do one numbered session (section 8) per working session/PR. Read this file and `CLAUDE.md` first; skim existing code before
   adding any.
2. Data in `shared/data`, numbers in `constants.ts`. No magic numbers in systems.
3. Server never imports from `client`; client never mutates authoritative state locally except
   own movement and cosmetic prediction.
4. Every session ends with: `npm run typecheck && npm test && npm run build` green, the session's
   acceptance checks demonstrated (screenshots for visual work), and the checkbox in section 9
   ticked with a one-line note of anything deferred.
5. If something in this plan proves wrong, change the plan in the same commit and say why — don't
   silently diverge.
6. Keep files under ~400 lines; split by system. Prefer boring code over abstractions.
7. Names must stay original (section 1).

---

## 8. Build sessions (14)

Each session is sized for one focused agent session, may contain several sub-tasks, and leaves
the game runnable. Sessions 2 and 7–9 are the map; do not compress them.

### Session 1 — Scaffold, toolchain, protocol
Workspaces, strict TS config, Vite client with a blank canvas, Node server serving static + `/ws`,
`shared` with `constants.ts`, `protocol.ts` (full message unions, even if most are unused yet),
math + seeded RNG. Root scripts: `dev`, `build`, `start`, `test`, `typecheck`, `lint`. Vitest and
a Playwright smoke test wired. `CLAUDE.md` updated with real commands. Dockerfile.
**Accept:** `npm run dev` shows a page that connects and logs a `hello` round-trip; all scripts
pass.

### Session 2 — Map compiler, renderer, first-person movement
`MapDef` types, `compile.ts`, `validate.ts` + ASCII dump. A **graybox of the full Harrow Ridge
layout** (all rooms, openings and doors at final positions; no props yet). Retro render pipeline,
palette/materials, procedural floor/wall textures, fog, sky. `worldBuilder` produces merged
meshes. Pointer-lock FPS controller with shared circle-vs-grid collision, sprint + stamina, head
bob. `__zh` debug hooks (teleport, freeCam, openAllDoors).
**Accept:** walk the entire graybox at 60 fps without clipping through walls; validator passes;
screenshots of three zones.

### Session 3 — Rooms, lobby, player sync
Lobby/room codes, create/join/ready/start, reconnect token, full `sync` on join. Client→server
movement updates with server sanity checks and `correct`. Snapshot broadcast, interpolation
buffer, low-poly player model with procedural walk/sprint/idle and name tags. Minimal menu + lobby
UI. Headless bot (walks randomly for now).
**Accept:** two browser tabs + two bots see each other move smoothly in the same room; a
disconnect and rejoin restores the slot.

### Session 4 — Weapons and combat core
Weapon data + stats for all conventional guns; viewmodels and code animations for at least
pistol, Farrow, Pike, Stitch (the rest may share a base and be finished in session 11). Fire / aim /
reload / swap / melee / frag grenades, ammo tracked on server, `fire` validation path, tracers,
muzzle flash, impacts, recoil and spread. Third-person weapon + fire flash on remote players.
A static target dummy entity for testing damage. HUD: ammo, crosshair, hit marker.
**Accept:** unit tests for damage/falloff/fire-rate validation; both tabs see each other shoot;
dummy takes correct body/head damage.

### Session 5 — Zombies
Server zombie system: spawner at window spawn points, barricade tear-down and vault, flow-field
chase, separation, attack, hit zones, death, crawlers. Player damage, regen, hurt feedback.
Zombie model with seeded variation and full procedural animation set; blood/hit FX; barricade
plank visuals and rebuild interaction. Bots now shoot. `spawnZombies` debug hook.
**Accept:** 32 zombies path from windows to players across zones without getting stuck (soak test
with bots, 5 min, asserts no zombie idle >10 s); 60 fps client, server tick <5 ms.

### Session 6 — Round loop, points, downs
Round system (counts, HP scaling, speed mix, max alive, intermission, straggler rule), points
events + popups, down/bleed-out/revive/spectate/respawn, game over + results screen, restart to
lobby. Full HUD: round numeral, points list for all players, perk tray (empty), revive icons,
power-up timers (stub). Scoreboard on Tab.
**Accept:** a solo game is playable from round 1 until death with correct scoring (unit-tested
against section 4.2/4.3); two-player revive works.

### Session 7 — Map I: prop kit, doors, west wing
The map is the largest part of the game, so it gets three sessions. Each one fully finishes its
zones (props, lights, signage, clutter) rather than spreading thin.
1. Prop framework: `data/props.ts` (footprint, height, blocks-move/blocks-bullets) and
   `models/props/*` builders with seeded variants; shared "kit" props used everywhere (crates,
   barrels, shelves, tables, chairs, lockers, lamps, pipes, cables, signs, debris piles).
2. Purchasable doors/debris: cost prompts, open animation, nav + flow-field update, zone-activated
   spawning.
3. Lighting framework: vertex-baked light pools and fake AO, flicker lights, emissives, power
   on/off states (switch itself comes in session 10).
4. Fully dress **Mess Hall, Bunkhouse + Washroom, Laboratory** per section 4.11.
**Accept:** validator passes with props; screenshots of the three zones look furnished and
distinct; doors open and zombies path through; lanes ≥1.5 m.

### Session 8 — Map II: industrial wing
Fully dress **Cold Storage, Generator Hall, Motor Pool**: zone-specific props (generators with
animated parts, catwalk, fuel tanks, truck on jacks, workbench, tool boards, tyre stacks, shelving
aisles, ice blocks, hooks), frost fog in Cold Storage, per-zone light mood and ambient motion
(spinning fans, swinging lamp, dripping pipe particles).
**Accept:** same checks as session 7 for these zones; draw calls still <150 from any viewpoint.

### Session 9 — Map III: exterior, Comms, Vault, whole-map pass
1. Fully dress **Courtyard** (snow ground texture, truck, snowcat, crate stacks, flagpole, radio
   mast + guy wires, floodlights, fence with breach barricades, falling snow), **Comms Bunker**
   (console banks, radar scope, map table, radio racks) and **Vault** (Forge placeholder plinth,
   cables, warning stripes, power-locked door).
2. Skybox: gradient, mountain silhouette, aurora, stars. Exterior shells so nothing looks like a
   void through windows.
3. Whole-map pass: sightlines, training loops, spawn/window placement, signage that helps
   navigation (painted zone names, arrows to power), placeholder mounts at every wall-buy, tonic,
   Cache and switch position. Final ASCII dump committed to `docs/MAP.txt`.
**Accept:** validator passes; a screenshot tour of all nine zones shows no empty boxes; the
session-5 soak test passes on the finished map with all doors open and with doors closed.

### Session 10 — Economy: wall buys, power, tonics, Forge
Generic interactable path (section 6.5). Wall buys (chalk-outline style original art) incl. ammo.
Power switch and power-on world change. All six tonics with dispenser models, buy animation,
effects, 4-perk limit, loss on down, solo Second Wind rules. Vault door + Forge with upgraded
variants for every weapon. HUD perk tray.
**Accept:** unit tests per perk effect and for purchase validation (cost, power, limits);
play-through: buy door → wall gun → power → tonic → Forge.

### Session 11 — Cache, power-ups, wonder weapons, Howlers
The Cache (roll animation, weights, Jinx relocation, beam). All six power-ups with drop rules,
pickup, timers on HUD. Remaining box weapon viewmodels. Arclight (chain lightning) and Gravewell
(singularity) incl. upgraded forms; Siren decoy. Howler enemy + special round.
**Accept:** unit tests for cache weights/uniqueness, drop cycle, chain targeting; each wonder
weapon demonstrated on a 24-zombie horde via debug hooks.

### Session 12 — Audio and feel
Synth engine (oscillators, noise, envelopes, filters, simple reverb) and an SFX library: every
weapon, reloads, footsteps by surface, zombie groans/attacks (positional), hit/kill ticks, door,
purchases, each tonic's short original sting, Cache jingle, power-up announcer cues (synth
stingers + on-screen text), round start/end music stings, low ambient drone per zone, heartbeat.
Feel pass: screen shake, recoil curves, hit stop on melee, kill feedback, damage direction
indicator, viewmodel polish.
**Accept:** no audio asset files; master/SFX/music sliders work; no more than ~24 simultaneous
voices; a recorded play session "sounds complete".

### Session 13 — UX, menus, robustness
Main menu, create/join flow, lobby polish, settings (sensitivity, FOV, render scale, dither
toggle, volumes, key rebinding) persisted in `localStorage`, pause/leave, spectate camera, late
join, reconnect UX, in-game text chat + ping marker, how-to-play screen, error states (room full,
version mismatch, server lost). Server: room cleanup, idle timeouts, input validation/rate
limiting on every message.
**Accept:** fuzz test sends malformed/out-of-order messages without crashing the server; a
4-client session survives a kill/restart of one client mid-round.

### Session 14 — Balance, performance, ship
4-bot soak to round 25+; tune tables against section 4 targets; profile client (draw calls <150,
merged statics, object pools for FX/zombies) and server (tick budget, snapshot size <4 KB at 32
zombies); fix top issues. Production build, Docker image, `README.md` with how to run/host, and a
final pass that this document matches the shipped game.
**Accept:** fresh clone → `npm ci && npm run build && npm start` → 4 players complete 10 rounds
with no errors in client or server logs.

---

## 9. Progress

- [x] 1 Scaffold, toolchain, protocol — done. Smoke test is a plain Node + Playwright script
  (`npm run smoke`), not `@playwright/test`. Dockerfile written but not built (no Docker in the
  authoring environment).
- [x] 2 Map compiler, graybox, renderer, movement — done. Deviations: map is 70 × 70 m (about
  1,600 m² walkable); windows carve an enclosed outdoor "pocket" and zombie spawns are generated
  from those pockets instead of being listed by hand; walls are per-cell quads with baked vertex
  lighting rather than greedy-merged (35k triangles, 13–19 draw calls); debug hooks for doors are
  client-local until the server owns door state in session 7. 60 fps was checked only in headless
  software rendering (~50 fps), not on real hardware.
- [ ] 3 Rooms, lobby, player sync
- [ ] 4 Weapons and combat core
- [ ] 5 Zombies
- [ ] 6 Round loop, points, downs
- [ ] 7 Map I: prop kit, doors, west wing
- [ ] 8 Map II: industrial wing
- [ ] 9 Map III: exterior, Comms, Vault, whole-map pass
- [ ] 10 Economy: wall buys, power, tonics, Forge
- [ ] 11 Cache, power-ups, wonder weapons, Howlers
- [ ] 12 Audio and feel
- [ ] 13 UX, menus, robustness
- [ ] 14 Balance, performance, ship

## 10. Risks to watch
- **Map authoring by hand in code** is the biggest schedule risk → mitigated by the carved-rect
  format, validator and ASCII dump (session 2) before any dressing (sessions 7–9).
- **Zombies getting stuck** → flow fields on the same grid as collision, soak test from session 5 on.
- **"Looks like programmer art"** → the retro pipeline, fixed palette and fog are mandatory from
  session 2; don't postpone them.
- **Netcode creep** → the trust model in section 5 is deliberate; do not add rollback, lag
  compensation or server-side movement simulation.
