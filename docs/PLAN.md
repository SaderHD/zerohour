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
    combat.ts             damage/falloff/fire-rate maths used by both sides
    data/                 weapons.ts perks.ts powerups.ts props.ts rounds.ts
    map/                  types.ts  harrowRidge.ts  dressing/*.ts (props + lights per wing, mounts.ts =
                          interactables and what stands at them)  compile.ts  validate.ts
    nav/                  grid.ts  flowfield.ts  los.ts  ray.ts (3D ray vs cell grid)  collide.ts
    math/                 vec.ts  rng.ts (seeded)
  server/src/
    index.ts              http static + ws upgrade
    lobby.ts              rooms, codes, join/leave
    game/                 Game.ts (tick loop) + one file per system:
                          players, zombies, spawner, rounds, combat, economy,
                          doors (and power), barricades, interact (the F path), perks, forge,
                          cache, powerups
    bot.ts                headless bot client for load/soak tests
  client/src/
    main.ts  net/ (socket, interpolation)  input/
    render/               renderer.ts (retro pipeline), worldBuilder.ts, bake.ts, doors.ts, signs.ts, materials.ts,
                          exterior.ts (roofs, stacks, pines), snow.ts, sky.ts, ambient.ts, atmosphere.ts
    models/               zombie.ts player.ts weapons/*.ts props/*.ts  rig.ts anim.ts
    game/                 localPlayer.ts viewmodel.ts entities.ts interact.ts forgeView.ts fx.ts
                          feel.ts (screen shake, recoil curves)
    audio/                synth.ts (engine, 24 voices)  guns.ts sfx.ts music.ts (the library)
                          ambience.ts (zone drones, heartbeat)  audio.ts (events -> sounds)
                          catalogue.ts (every sound by name)  tools.ts (offline render, recording)
    ui/                   hud.ts menu.ts lobby.ts scoreboard.ts settings.ts damage.ts volumes.ts
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
- **Lighting:** baked. Zone ambient, light pools (with grid line of sight) and fake AO go into
  vertex colours at world-build time; distance fog does the rest. Lights that change are baked
  into three extra colour attributes that the world shader scales by a uniform each: mains lights
  (40% until the power is on), flames (always on, wavering) and failing tubes (mains, stuttering).
  No realtime lights for the world. Emissive faces for lamps, screens, specimen tanks and embers
  follow the same three levels.
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
- **Outside the walls:** `render/exterior.ts` puts a roof shell over every building (pitched over
  the timber ones, flat with a parapet over block and metal), a stack over every stove and
  engine, and snow-laden pines on the rock beyond the wire — one mesh, lit as part of the yard.
  The sky is a textured cylinder (gradient, stars, moon, aurora, two ridges); snow falls as one
  cloud of points wherever a cell is open to the sky (`render/snow.ts`).
- **Sound** is drawn the same way (`client/src/audio`): a voice is a few oscillators and noise
  bursts through envelopes and filters, placed by pan, distance and a wall check, with a send to
  one generated reverb. At most 24 voices sound at once; the least important is cut for a new one.
  Two buses (effects; music, which also carries the zone drones and the heartbeat) sum into a
  limiter, then the master volume. Tunes are note lists in `music.ts`.
- **Static world** is merged into a few meshes per zone (see map compile). Zombies/props that
  repeat use shared geometries. The few world parts that move (fans, flywheels, a swinging lamp)
  are one small mesh each (`render/ambient.ts`), as are all drips together and the floor mist.

---

## 4. Game design

All numbers live in `shared/src/data` and `constants.ts` so balance never requires code changes.

### 4.1 Player
- Walk 4.5 m/s, sprint 6.5 m/s (4 s stamina, 2 s regen delay), no jump. Capsule radius 0.35 m.
- 100 HP, a zombie hit deals 45 (two hits down you inside a short window); regen to full after 4 s
  without damage. Red vignette + heartbeat when hurt.
- Two weapon slots, knife melee (150 dmg, 0.6 s), 2 frag grenades (refill +1/round, max 4).
- Controls: WASD, mouse look (pointer lock), LMB fire, RMB aim (FOV zoom + tighter spread),
  R reload, Shift sprint, F interact/revive (hold), V melee, G grenade, E decoy, Q/1/2/wheel swap,
  Tab scoreboard, Esc menu.
- **Downed:** crawl-speed 0, pistol only, 45 s bleed-out; teammate holds F for 3 s to revive.
  Going down loses all perks. Bled-out players spectate and respawn at the start of the next round
  with the starting pistol and 1,500 points minimum. All players down ⇒ game over.
  **Solo:** the Second Wind perk gives an automatic self-revive (max 3 purchases per game): the
  player lies downed for 8 s, the game carries on, and they get up with what they carried (bar
  the tonics). Nothing hurts a player for 2 s after any revive.

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
  when within 1.0 m: 0.5 s wind-up, hit if still within 1.3 m, then 0.7 s recovery. A chaser
  that gets nowhere for 3 s tries another player for a while.
- One zombie works a window at a time; the rest queue in the pocket behind it.
- Hit zones: head ×4 (weapon-specific), torso ×1, limbs ×0.75. Legs destroyed by explosives ⇒
  crawler (slow, low attack): a blast worth ≥30% of max HP that does not kill. Players take 20%
  of blast damage.
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
| "Siren" decoy | tactical (its own slot beside the grenades: 3 from a roll, E throws) | box only | — | thrown lure; zombies within 30 m of walking chase it 6 s, then it explodes |

Wall buys also sell ammo (half price; upgraded ammo 4,500). Weapon stats schema:
`damage, headMult, rpm, auto, magSize, reserve, reloadTime, spreadHip, spreadAim, pellets, range,
falloff, pierce, moveSpeedMult, recoil, projectile?, forged {name, damage, magSize, reserve}`.
Every weapon has an upgraded variant
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
| Packmule | 4000 | Third weapon slot (the gun in it is lost with the perk) | Cold Storage |

### 4.7 The Cache (random weapon crate)
950 points. Lid opens, weapons cycle for 4 s, result floats for 10 s for the buyer to take (F).
Weighted table excluding weapons the buyer holds; wonder weapons ~4% each, max one of each in the
game at a time (carried, set aside while downed, in the Forge or mid-roll all count). On a use
picked between the 4th and the 8th at a site the roll produces a **Jinx** (a cackling skull):
points are refunded and the Cache relocates to another of its 5 possible sites, marked by a sky
beam. Works without power. The table (`shared/src/data/cache.ts`) holds every weapon but the
starting pistol - Cache-only ones weighted above the wall guns - and the Siren.

### 4.8 The Forge (weapon upgrade)
In the Vault behind the Comms Bunker; the vault door only opens when power is on. 5,000 points
and the weapon in your hands (not one already upgraded): it lies in the cradle for 3 s, then its
upgraded form floats there for its owner alone, and is lost if not collected within 15 s. One
weapon at a time; ammo for an upgraded weapon comes from its wall buy (4,500) if it has one.

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
| Clearance | 30 s: the Cache costs 10 and appears at every site, each with its own roll; no Jinx meanwhile (only drops after the Cache has moved once) |

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
  name. Lobby shows players + ready state; host starts. Late join allowed — spawns next round
  (at once during an intermission). After a game over the room shows the results until any
  player sends `again`, which returns everyone to the lobby.
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
  One-shot events (`zombieHit`, `zombieDied`, `fired`, `points`, `powerupTaken`) are discrete
  messages, not snapshot state. Each player's snapshot carries their own ammo as
  `[lastFireSeq, slot, mag, reserve]`; the client adopts it only when that seq matches the last
  shot it sent and no reload is in flight.
- **Fire-rate check:** the server keeps a per-player "next shot due" time on a wall clock
  (messages arrive between ticks). A shot may arrive up to `FIRE_RATE_SLACK` early to absorb
  jitter, but the schedule advances by a full interval per shot, so the average rate can never
  exceed the weapon's rpm.
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
  props: PropInst[];    // {type, x, z, rot, variant?, y?, s?, text?}  footprint/collision come from data/props.ts
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

**Props** (`data/props.ts`: footprint, height, solid, tall) are placed per zone in
`map/dressing/*.ts`. Solid props turn in quarter turns, sit on the 0.5 m grid and take their cells
out of the floor (`CompiledMap.block`), so collision, flow fields and the validator need no
separate prop pass; `tall` ones also block sight and light, and every solid prop stops shots that
pass below its height (`propH`, used by `rayWorld`). Gaps between solid props are therefore
nothing or at least 1.5 m. Clutter (papers, tipped chairs, pipes, signs) collides with nothing.
A door with `style: 'debris'` is a heap to clear instead of a shutter to raise.

A wall takes its look from the open cell in front of it, so the yard is one big room plus
half-metre strips round its edge (`yard_n_mess`, `yard_e_motor`...): each strip gives its stretch
of wall the face of what stands behind it (fence, the mess hall's boards, the motor pool's block).

**Interactables** (`map/dressing/mounts.ts`): each wall buy, tonic and Cache site is one line that
yields both the prop players see (`wallbuy`, `tonic`, `cache_site`) and the `Interactable` they
will press F at; the power switch is the lever on a `switchgear` and the Forge is its own prop.
`TONICS` there fixes the tonic ids, their order (= the dispenser's `variant`) and glow colours.

`validate.ts` runs in tests and fails the build if: a prop blocks the floor inside a window; any zone is unreachable with all doors open;
any window/spawn can't path to the player spawn; a prop seals a lane (<1.5 m); interactables are
not adjacent to floor; rooms overlap. `npm run map` validates and writes an ASCII top-down dump to
`docs/MAP.txt` — **agents must look
at that dump (and a screenshot) after any map edit.**

### 6.2 Collision
2D only. Players and zombies are circles against the cell grid + prop AABBs (slide along walls).
Hitscan: client rays against zombie hit boxes (head/torso/limb boxes on the rig) and world meshes;
server LOS is a grid DDA (`los.ts`). Closed doors and unbroken windows are solid cells.

### 6.3 Navigation
`flowfield.ts`: Dijkstra over walkable cells from each living player's cell (cells touching a wall
cost more, so paths keep to the middle of lanes), recomputed every 250 ms (staggered across ticks)
and immediately when a door opens. Each zombie samples the field of its target player a few cells
ahead, adds separation from neighbours (a plain pair loop — 32 bodies need no spatial hash) and a
little per-zombie lateral noise so hordes don't single-file. Within 3 m and in sight it runs
straight at the player. Zombies re-pick target every 1 s (nearest by field distance;
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
`interact {id}`; the server re-checks range (and that the player is on the side it faces), cost,
power and state, and answers a refusal with `denied {reason}` to that player. One generic path
(`server/game/interact.ts`, `client/game/interact.ts`) for doors,
wall buys, tonics, Cache, Forge, power switch, barricade rebuild and revive.

### 6.6 Testing & debug hooks (required — this is how agents verify work)
- `window.__zh` in dev: `state()`, `teleport(x,z)`, `give(weapon|perk|points)` (`give(weapon, true)`
  for the Forge upgrade), `setRound(n)`,
  `setRound(n, true)` for a howler round, `give('siren')`, `powerup(kind)`, `cacheNext(weapon|'siren'|'jinx')`,
  `rounds(bool)` (stop/resume the round loop), `spawnZombies(n, opts)` (`opts.kind: 'howler'`), `killZombies()`, `god(bool)`, `freeCam()`, `openAllDoors()`, `powerOn()`, `dummy(x,z)` (target
  dummy), `lookAt(x,y,z)`, `press(code)` (mouse buttons are `Mouse0`/`Mouse2`), `audio` (`play(name)`,
  `names()`, `render(name)` offline, `record(on)`, `setVolume`). Matching server-side
  `debug` messages, enabled only when `ZH_DEBUG=1`.
- URL flags: `?name=X`, `?room=CODE` (join; with `autostart` the room is created if missing —
  debug servers only), `?autostart=1` (skip menu and lobby), `?debug=1` (stats overlay).
- `server/src/bot.ts`: headless WS client that joins a room, walks to random spots along a flow
  field and shoots the zombies it sees — used for 4-player soak tests and perf checks. Its brain
  (`botBrain.ts`) has no networking, so sim tests drive it directly.
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
- [x] 3 Rooms, lobby, player sync — done. Notes: the server extrapolates each player's last
  reported position by up to 100 ms when building snapshots (20 Hz moves vs 15 Hz snapshots
  otherwise beat visibly); late joiners spawn immediately until rounds exist (session 6); bots
  only wander for now. Each player model is ~12 draw calls — fine for 4 players, but zombies
  (session 5) must use far fewer per body (merge static parts or instance) to stay under 150.
- [x] 4 Weapons and combat core — done. All 12 conventional guns have stats and fire; Warden,
  Dockhand, Farrow, Pike and Stitch have bespoke models, the other seven use a parametric long-gun
  builder until session 11 (third-person reuses the same builders without hands). Additions to the
  plan: `ZombieKind 'dummy'` (debug-spawned, 1000 HP, stands back up 3 s after being destroyed),
  `sync.zombies`, per-player `snap.ammo`, shared `rayWorld`. Deferred: explosions do not hurt
  players until player damage exists (session 5); points for hits/kills (session 6); weapons are
  only obtainable through the debug `give` until wall buys (session 10); shotgun reloads are
  whole-magazine, not shell-by-shell; no sounds (session 12). Four armed players cost ~50 draw
  calls in software rendering — still fine, but zombies must not copy that pattern.
- [x] 5 Zombies — done. Soak (`npm run soak`, 4 WebSocket bots, 32 zombies, 5 min): worst zombie
  idle 2.2 s, server tick 0.73 ms average (7 of 9,003 ticks over 5 ms, worst 23 ms); the same soak runs on a fake clock in `npm test`
  (doors open and shut). "Idle" means no progress: not moving 0.5 m, tearing a plank or
  swinging; queueing outside a window and crowding within 2.5 m of the target do not count.
  Client: 32 zombies are 8 draw calls (one instanced mesh per body part, ~150 tris a body); fps was
  only measured in headless software rendering (~35 with the full horde against ~45 empty).
  Additions to the plan: `ZombieState.CrawlAttack`, debug `spawnZombies {hp, speed, interval, x, z}`
  and `killZombies`, `npm run horde` (browser walk-through with screenshots), the local player
  cannot walk through zombies (client-side push-out only). Interim until session 6: a player at
  0 HP is put straight back at a spawn point; the spawner is fed by the debug hook (rounds will
  feed the same queue); no points for kills or planks. Zombies do not swipe through windows, and
  a barricade cannot be rebuilt while a zombie is at it (as section 4.4 says).
- [x] 6 Round loop, points, downs — done. `npm run rounds` plays it in two browsers (round 1,
  scoring, late join, down, revive, scoreboard, game over, back to lobby). Choices the plan left
  open: zombie counts are straight lines through the section 4.3 reference values (the last slope
  continues past round 20); round 1 starts 5 s after the game does; stragglers (3 or fewer left,
  none queued) turn into runners after 20 s, crawlers excepted; a downed player holds only the
  starting pistol and gets their loadout back on revive; the down penalty is rounded to 10; a
  killing hit pays the kill only, and each shotgun pellet that lands pays as a hit; the game is over
  the moment no connected player is on their feet (so a solo down ends it until Second Wind exists,
  session 10); after a game over any player can send the room back to the lobby (`again`).
  Additions: protocol v5 (`again`, `reviving` event, `sync.over`, debug `rounds`), `__zh.setRound`
  and `__zh.rounds(on)`. Deferred: Howler rounds (session 11); the perk tray and power-up timer
  row are empty containers; spectating is a plain chase camera behind the first standing teammate
  (session 13); bots lie still when downed and never revive; no brief protection after a revive.
  `client/src/main.ts` is ~480 lines, over the 400 guideline — split it when session 10 adds the
  interactables.
- [x] 7 Map I: prop kit, doors, west wing — done. 38 prop types (kit + mess, bunkhouse/washroom,
  lab) drawn by `client/src/models/props`, 114 placed; doors are bought with F (`d_bunk_lab` is
  debris), zombies path through and the next zone's windows wake up (`doors.test.ts`); the tour has
  power-off and power-on views of all three zones. Changes to the plan: flicker and power are
  baked light channels scaled by uniforms, not realtime point lights (section 3); solid props are
  whole cells in the collision grid (section 6.1); all props are merged map-wide into three meshes
  (lit, glowing, lettered) rather than per zone, so the whole map still draws in 18-35 calls;
  chairs are clutter only (tipped over) because a walkable-around 0.5 m chair cannot keep 1.5 m
  lanes; zombies now need a clear walking line, not just sight, before they stop following the
  flow field. Additions: `Opening.style`, `LightDef.fixture`, `lineWalkable`, `Game.power` with
  the debug `powerOn` (opens power doors; the switch itself is session 10), `__zh.powerOn()`,
  `emitTo` for per-player `denied` events, `DOOR_OPEN_SECONDS` (the client plays the opening and
  only then lets the player through; the server opens at once). Deferred: the cabinet, shelf and
  bunk models run to 130-160 triangles against the 100 guideline; yard floodlights stand on plain
  masts and the east wing still has bare bulbs (sessions 8-9); no door or power sounds (12);
  mounts for wall buys, tonics and the Cache (9-10).
- [x] 8 Map II: industrial wing — done. 27 more prop types (65 in all), 246 placed; Cold Storage
  (racking aisles, lake ice under a meat rail, the refrigeration plant, icicles, the shored-up
  tunnel), Generator Hall (two generator sets, fuel tanks, switchgear, an unreachable catwalk and
  its ladder, extractor fans) and Motor Pool (a truck on stands, roller door, fitters' bench and
  tool board, tyre stacks, a brazier) are dressed; the tour has power-off and power-on views of
  each. Moving parts are `Mover`s: a prop builder calls `k.mover(...)` and that part becomes its
  own small mesh turned by `render/ambient.ts` (7 so far: 2 generator shafts, 3 extractor fans, the
  chiller fan, the swinging work lamp); generator shafts only run with the power on, fans windmill
  until then. The same file animates roof drips (one mesh for all) and the mist on the cold-store
  floor (two additive layers, lit by the bake). `ZoneDef.fog` thickens and tints the distance fog
  while the viewer stands in a zone (`render/atmosphere.ts`). Worst viewpoint in the wing is about
  40 draw calls. Changes to the plan: a truck is two props (tall cab, low bed) because a footprint
  is one rectangle with one height; cells inside a tall prop borrow the lights of the prop cells
  round them so big machines are not black in the middle. Deferred: the swinging lamp's pool of
  light is baked and does not swing with it; the frost fog switches by the viewer's zone, so the
  cold store seen from the lab doorway is clear until you step in; the generator, truck and rack
  models are well over the 100-triangle guideline (not counted); the power switch on the switchgear is
  session 10; machine and drip sounds are session 12.
- [x] 9 Map III: exterior, Comms, Vault, whole-map pass — done. 22 more prop types (87 in all),
  406 placed. Courtyard: the radio mast and its three guy wires, a snowed-in truck, a snowcat, the
  flagpole (its flag is a mover), a watch fire, sandbags inside each fence breach, stores along the
  walls, drifts, ruts, wire along the fence tops, five floodlights. Comms: two operators' desks, a
  plotting scope with a turning sweep, the map table, four radio racks, a teleprinter. Vault: the
  Forge between capacitor banks and transformers, hazard lines, its switchgear. Outside:
  `render/exterior.ts` (roof shells, stacks, pines), a moon in the sky, falling snow. Whole map:
  `interactables` is filled (6 wall buys, 6 tonics, 5 Cache sites, power switch, Forge) and each has
  its mount; `< POWER` arrows lead to the generator hall along both routes and `FORGE` arrows to
  the vault; every building has its name painted on. The tour has 17 views of the new work (8 more with the
  power on). Soak, 150 s real time each: doors open — worst idle 2.2 s, tick 0.78 ms average
  (9 of 4,509 ticks over 5 ms), zombies in all nine zones; doors shut — worst idle 3.0 s, 0.38 ms.
  Worst viewpoint is 53 draw calls. Changes to the plan: the yard is one room plus edge strips so
  its walls can differ (section 6.1) and there is a seventh wall style, `siding`; mounts are props
  generated together with their interactables (section 6.1); the sign atlas is 1024 px and signs
  can carry arrows; the three fence breaches are the yard's ordinary windows (planks, pocket) with
  sandbags inside rather than a separate kind of barricade. Moved to fit the mounts: the mess
  shelves (0.5 m south), a lab crate, and the bunkhouse barrel by the mess door (removed).
  Deferred: the world is now ~75k triangles and headless software rendering gives ~23 fps with the
  full horde in the yard (no real GPU was available to measure on — check in session 14, the pines
  and the mast are the cheapest things to thin); tonic cabinets and wall-buy boards are final
  enough to keep but show no weapon model or price yet (session 10); a Cache site is a bare pallet
  until the Cache exists (11); guy wires and the flood masts have no collision; snow does not
  settle on anything that moves; the mast lamp does not blink (glow modes are on / mains / flame /
  failing tube only).
- [x] 10 Economy: wall buys, power, tonics, Forge — done. `npm run economy` plays it alone in a
  browser (wall gun, ammo, door, solo Second Wind, master switch, tonic, Forge, upgraded damage,
  self-revive); `purchases.test.ts` and `perks.test.ts` cover cost, power, reach and limits and
  each tonic's effect. Every F press goes through `game/interact.ts` on the server. Choices the
  plan left open: tonic numbers live in `shared/src/data/perks.ts` and are read where they apply
  (`maxHpWith`, `reloadMultWith`, ...); upgrades are a `forged` block per weapon (new name, x2.2-3
  damage, magazine, reserve), reached through `weaponStats(id, upgraded)`; ammo from a wall buy
  fills the reserve only; the Forge takes the weapon out of your hands while it works (with
  nothing left you still have the knife and grenades); Second Wind alone gets you up after 8 s;
  2 s of safety after any revive (deferred in session 6); Ironhide fills health when bought.
  Protocol v6 (`denied` reasons `owned`/`full`/`upgraded`, debug `give {upgraded}`, a `reviving`
  event with `by` = `id` for a self-revive, `sync.forge` is real). Client: wall-buy boards show
  each weapon's own chalk outline and its price; upgraded guns wear a violet finish with glowing
  trim (first and third person); a tonic is drunk from a canister in the left hand; the tray shows
  the tonics held. Deferred: the master lever and the dispensers do not move when used; firing is
  not blocked while drinking; purchases are not checked for line of sight, only reach and side;
  bots buy nothing; no purchase sounds or tonic stings (12); `client/src/main.ts` is still ~500
  lines (the debug hooks moved to `debug.ts`; the event switch is what is left to split, 13).
- [x] 11 Cache, power-ups, wonder weapons, Howlers — done. `npm run wonders` plays it alone in a
  browser (a roll, the take, a Jinx and the move; all six power-ups and their timers; every Cache
  gun in the hand; one Arclight bolt through 8 of a 24-zombie horde, 14 forged; one Gravewell orb
  taking all 24; the Siren; a howler round). Unit tests: `shared/src/data/cache.test.ts` (weights,
  uniqueness, the drop cycle, chain targeting) and `cache`, `powerups`, `wonder`, `howlers` tests
  beside the server code. Protocol v7 (`sync.cache` is `{home, boxes}`, `cacheHome`, `strike`,
  `chain {by, targets}`, debug `powerup` / `cache` / `give {tactical}` / `setRound {special}` /
  `spawnZombies {kind}`). Choices the plan left open: the Cache is a state per site, so during
  Clearance every site rolls on its own; the Jinx falls on one use picked from the 4th to the 8th
  at a site (not a chance per roll) and never during Clearance; what a roll will give is fixed when
  it is paid for and kept from clients until it lands; the Siren is a third throwable (3 per roll,
  E) rather than replacing a grenade slot; Arclight and Gravewell do a flat 12,000 / 15,000 per body
  (zombie health passes that around round 36) and their upgrades add reach (14 bodies at 7 m; a
  4 s, 8 m singularity) on top of x3 damage; a singularity holds whatever is in reach and in sight
  and its implosion does not hurt players; Double Up doubles hits, kills and planks only; Reaper
  does not apply to the target dummy; Firestorm kills pay nothing but the 400; drops need a kill by
  a player inside the walls and come from a second RNG stream (`Game.luck`) so the first is
  undisturbed; howlers have 35% of the round's zombie health, bite for 30, arrive 1.2 s after their
  lightning 6-22 m of walking from a player, and are not crippled by blasts. The seven placeholder
  guns have their own models (`models/weapons/longarms.ts`, `heavy.ts`), as do the two wonder
  weapons (`wonder.ts`, with glowing parts). Howlers are the zombie rig on all fours through the
  same instanced meshes (no new draw calls); worst view in the walk-through is 53 calls.
  Deferred: no sounds for any of it (12); bots neither use the Cache nor pick up drops on purpose;
  the Cache's roll shows any weapon, including ones the buyer holds; the "10" on the Clearance
  pick-up reads mirrored from behind; a Siren thrown where zombies cannot walk (out of a window) is
  ignored; `client/src/main.ts` is now ~565 lines (split due in 13). `npm run e2e` sampled its
  first position between frames and could read that as a jump; it now starts on a frame.
- [x] 12 Audio and feel — done, client only (no protocol change). `npm run audio` renders all 106
  catalogue sounds offline to `test-results/audio/*.wav` (each is there and does not clip), moves
  the three sliders and measures the output (effects 0 silences a shot, music 0 a sting, master 0
  everything, master 50% halves it; they survive a reload), then plays a solo session of about
  140 s through everything that makes a noise while recording it to
  `test-results/audio-session.webm`: some 530 sounds, never more than 24 at once (a dozen or two
  cut short for a more important one), sound in every half second. Nobody has listened to it: the
  checks are levels and counts, so "sounds complete" still needs a pair of ears, and the balance
  was set from rendered peaks, not by ear.
  Sounds: 14 guns (a recipe per class, adjusted per gun; forged guns add a falling whine), reload
  in three stages timed to the hands, dry fire, pump, swap, knife, throws, three kinds of blast;
  footsteps on six floors (ours in step with the view bob, other players' by distance covered);
  zombie groans pitched per zombie (runners higher and shorter), swings, deaths, howler howls and
  barks, thunder; planks, doors, debris, the master switch, drips and fires near the listener; hit,
  headshot, kill and headshot-kill ticks, the till, the refusal buzz; a phrase for each tonic; the
  Cache's music box (slowing as it chooses), its offer, the Jinx, leaving and landing; a cue for
  each power-up; round start (four notes over a drum), howler round, round end, game over; a
  drone per zone that changes when the power comes on (the generator hall gets its engine); a
  heartbeat and a dulling of everything under 45% health or when downed. Sounds behind a wall are
  quieter and muffled. Feel: trauma-based screen shake (shots, hits taken, blasts and lightning
  by distance, the power, a knife landing); recoil curves in `game/feel.ts` (automatics jump,
  settle, then weave in a fixed pattern; single-shot guns climb when worked fast) with sideways
  kick eased into the yaw; 70 ms of hit stop on a knife that lands; a gold, larger marker and a
  ring for a headshot kill; damage arcs round the crosshair that keep pointing at the source as
  you turn; the viewmodel leans into a strafe, twists with each shot, flinches when hit and nods
  on an empty trigger. Choices the plan left open: the volume sliders are a small panel shown
  whenever the mouse is free (the full settings screen is 13) and are saved in `localStorage`;
  the announcer is stingers and the banner text, no voice; ambience and heartbeat are on the
  music slider. Deferred: no machine sound comes from the fans or the swinging lamp, and the
  generator is part of its hall's drone rather than a source you can walk round; other players'
  reloads, swaps and forged guns are not heard (the events do not say); remote shots are placed
  where the player stands, not at the muzzle; a sound's pan and occlusion are fixed when it
  starts; shake has a `scale` but no setting yet (13); bots are deaf. `client/src/main.ts` is
  ~600 lines (split due in 13).
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
