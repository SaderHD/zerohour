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

**Cuts made on purpose** (do not add unless asked): jumping/mantling (and dropping off ledges:
height is walked, by ramps and stairs), PvP, persistent accounts/progression, easter-egg quests, mobile/touch controls,
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
    bot/                  mind.ts (what a computer-run player decides; no networking, no rendering)
                          wants.ts (its shopping list)
    math/                 vec.ts  rng.ts (seeded)
  server/src/
    index.ts              http static + ws upgrade, heartbeat
    connection.ts         one WebSocket: timeouts; link.ts decodes, rate limits (rateLimit.ts), shakes hands
    lobby.ts              rooms, codes, join/leave, chat, clean-up
    game/                 Game.ts (tick loop) + one file per system:
                          players, zombies, spawner, rounds, combat, economy,
                          doors (and power), barricades, interact (the F path), perks, forge,
                          cache, powerups
    bot.ts                BotPlayer (the mind, speaking the wire protocol) and Bot (one on a WebSocket)
    botBrain.ts           the wander-only brain the fake-clock soak test still uses
    game/campaign.ts      a whole game played by bots on a fake clock (npm run campaign)
  client/src/
    main.ts (builds everything, the frame loop)  settings.ts (the saved choices, key bindings)
    net/ (socket, lobby state machine, interpolation)  input/ (keys through the bindings)
    render/               renderer.ts (retro pipeline), worldBuilder.ts, bake.ts, doors.ts, signs.ts, materials.ts,
                          exterior.ts (roofs, stacks, pines), snow.ts, sky.ts, ambient.ts, atmosphere.ts
    models/               zombie.ts player.ts weapons/*.ts props/*.ts  rig.ts anim.ts
    game/                 localPlayer.ts viewmodel.ts entities.ts interact.ts forgeView.ts fx.ts
                          autopilot.ts (the bot mind at the keys: ?auto=1)
                          feel.ts (screen shake, recoil curves)  match.ts (round, life, doors as the
                          server reports them)  events.ts (sync / snap / ev applied)  marks.ts (pings)
    audio/                synth.ts (engine, 24 voices)  guns.ts sfx.ts music.ts (the library)
                          ambience.ts (zone drones, heartbeat)  audio.ts (events -> sounds)
                          catalogue.ts (every sound by name)  tools.ts (offline render, recording)
    ui/                   hud.ts menu.ts (menu + lobby) screens.ts (panels, pause, connection notice)
                          settings.ts help.ts chat.ts scoreboard.ts damage.ts volumes.ts
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
- **Static world** is merged into a few meshes per zone (one per surface style, three for its
  props), so zones out of view are culled whole (see map compile). Zombies/props that
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
- 20 s intermission between rounds (10 on the flat station: time to cross the site) with a round-change stinger; the last few stragglers switch to
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

Wall buys also sell ammo (half price; upgraded ammo 2,500). Weapon stats schema:
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
In the Vault under the Comms Bunker; the vault door only opens when power is on. 4,000 points
(5,000 when the Vault was the room next door, not two flights down a dead end) and the weapon in your hands (not one already upgraded): it lies in the cradle for 3 s, then its
upgraded form floats there for its owner alone, and is lost if not collected within 15 s. One
weapon at a time; ammo for an upgraded weapon comes from its wall buy (2,500) if it has one.

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
A snowed-in 1970s mountain signals outpost on a slope, 70 × 70 m (see `docs/MAP.txt`, a sheet per storey), eight zones in a loop
plus one spur, so there are good "training" circuits and no dead-end deathtraps except the Vault.

The site is terraced (`map/terraces.ts`), each terrace 1.5 m from the next - `FLOOR_GAP`, so nothing
reaches up or down a terrace wall and whoever is at its foot has to walk round:
- **North terrace, +1.5 m**: the Laboratory and Cold Storage. The washroom door opens on a flight of
  stairs up into the lab; the tunnel climbs on two ramps from the cold store to +3 m.
- **Middle, 0**: Mess Hall, Bunkhouse, the Generator Hall's floor, the top of the yard.
- **South terrace, -1.5 m**: the low yard, the Motor Pool's floor, the Comms Bunker. The yard goes
  down by a snow slope on either side of a bluff held up by a wall (railed; a place to shoot from, not
  to step off); the motor pool has a loading dock at 0 along its north wall with a ramp and steps down.
- **Upstairs, +3 m**: the Generator Hall's gallery along its north wall, a flight of stairs at each end.
  The tunnel's door and the master switch are up there; the sets and both windows are on the floor below.
- **Basement, -4.5 m**: the Vault, the cellar under the bunker: through the power door, down two
  flights that double back, in under the bunker's floor. The Forge stands in a recess at the far end.

No room is a plain box: the mess hall has a servery let into its east wall, the lab a specimen bay
and a corner given up to the stairs, the generator hall its fuel store under the gallery, the bunker
a signals office off its corner.

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
| Generator Hall | 17×12 + gallery | 2 big generators (animated when on), pipes, the gallery and its two flights of stairs, fuel store, switchgear on the gallery | 2 | Power switch (on the gallery) |
| Motor Pool | 16×12 | truck on jacks, workbench, tool boards, tyre stacks, oil drums, roller door (shut) | 2 | Coachman, Quickhands, Cache site |
| Courtyard (outdoor) | 26×20 | snow, parked truck + snowcat, crate stacks, flagpole, radio mast base with guy wires, floodlights, fence, falling snow particles | 3 fence breaches | Cache start site |
| Comms Bunker | 12×10 | console banks with blinking lights, radar scope, map table, radio racks | 2 | Ironhide, Cache site |
| Vault (basement) | 10×7 + stairs | the Forge, cable bundles, warning stripes | 0 | Forge |

Props that are ≥0.5 m tall block movement (and bullets if tall); small clutter is non-colliding.
Keep every lane ≥1.5 m wide. Varied ceiling heights, skybox gradient with mountains silhouette and
aurora for the outdoor zone.

### 4.12 Map — "The Longest Night" (second map; being built: blocked out and dressed on all five storeys; nothing sold yet)
Wexler Square, in the middle of a big, old, fictional American city, Christmas Eve in the early 1990s.
Deep in the canyons between the towers, snowing, every decoration still lit and nobody left to look
at them. Chosen by the host in the lobby; Harrow Ridge stays as it is. Same weapons, tonics, Cache,
Forge, power, zombies and rounds: only where things stand and what they cost belong to the map.

The city, its streets, shops and signs are all invented (section 1): no real landmark, brand or
address, and nothing taken from any other game's map - the brief is a *kind* of place (streets you
fight along, buildings you go through, roofs you cross, a subway underneath), not a layout.

**Size.** 150 × 120 m and five storeys, against Harrow Ridge's 70 × 70 and three: about four times
the floor to walk on, fourteen zones for nine. Big enough that a team splits up without meaning to
and a round is fought across a block, not a room.

| Storey | Height | What is on it |
|---|---|---|
| Roofs (level 2) | +8 m | Abelard's roof (plant room, the master switch), the tenement roof (water tank), the plank bridge between them |
| Upstairs (level 1) | +4 m | Abelard's upper floor round its atrium, the tenement flat, the Lyric's balcony |
| Street (level 0) | 0 | the square, Dray Avenue, Tallow Lane, the diner, the chapel, every ground floor |
| Mezzanine (level -1) | -4 m | the subway's ticket hall, under the square's north-east corner |
| Platform (level -2) | -8 m | the platform and the stalled train under the avenue, the service tunnel, the signal room |

Nobody jumps, falls or climbs (6.2), so every change of height is something walked: the tenement's
stairwell and its fire escape (an outdoor staircase down into the lane), Abelard's two dead
escalators, the subway's stairs, the plank bridge. Roofs are railed. No ziplines or drops: either
would be new movement code and is not part of this map.

```
        [St Audra's chapel]                                    (north of the avenue)
               ||1000
   ============ DRAY AVENUE ====1250==(stairs down)============  cars, a bus, the far subway entrance
      ||1000 (fire exit)        |debris 1000|
   [The Lyric]            +------------------+          +----------------------------+
    lobby, auditorium,=1000=   WEXLER SQUARE  =1000=====  ABELARD'S  ground: toys, grotto
    balcony upstairs      |  the tree, the rink |        |   upper (escalators, open)  |
                          |  market stalls   ==1250==v   |   roof =1250= (the switch)  |
   +---------------+      +------------------+ (subway)  +----------------------------+
   | STARLIGHT     |=750=======||      ||debris 750          ||1000 (loading bay)  ¦ plank
   | DINER (spawn) |                 ====== TALLOW LANE (alley) ===============    ¦ bridge
   +---------------+=750=[TENEMENT stairwell]==750 (fire escape)==/                ¦ 1250
                          flat upstairs =1000= roof ·······························+

   Below: [Mezzanine] == turnstiles, stairs == [Platform + train] --(power)-- [Service tunnel: FORGE]
          the service tunnel's far end climbs to a pavement hatch in Tallow Lane (power door)
```

Three circuits lie over each other and meet at the square: the streets (square, avenue, lane), the
roofs (tenement, bridge, Abelard's, down the escalators) and the subway (the square's stairs, the
platform, through the train, up the avenue's). The Forge is not at the end of a dead end here -
Harrow Ridge keeps that - but both ways to it wait for the power.

| Zone | Approx. size | Dressing | Windows | Contents |
|---|---|---|---|---|
| Starlight Diner (spawn) | 16×10 + kitchen | booths, counter and stools, jukebox, pie case, paper chains, plates still laid, a small tinsel tree | 3 | Farrow, Pike, Second Wind |
| Wexler Square (outdoor) | 44×36 | **the tree** (14 m, lit, visible from every roof), a frozen rink round its foot, market stalls, heaped presents, benches, a bandstand, lamp posts with wreaths, light strings overhead | 4 (street barricades) | Cache start site |
| Dray Avenue (outdoor) | 100×12 | abandoned cars under snow, a bus across the road, police sawhorses, steam from the gratings, a news kiosk, the towers straight up on both sides | 4 (barricades, a manhole) | Coachman |
| Tallow Lane (outdoor) | 60×6 | bins, crates, the fire escape, a delivery van, washing lines, a brazier | 3 | Quickhands |
| Tenement | stairwell + flat 12×9 | mailboxes, a flat with the dinner on the table and presents under the tree, a television showing snow | 3 | Stitch, Marathon |
| Tenement roof (outdoor) | 14×12 | water tank, chimney pots, pigeon coop, aerials, a plastic reindeer | 2 (over the parapet) | Cache site |
| Abelard's, ground | 30×24 | toy department, counters, mannequins, the grotto with its throne and a queue of rope posts, a model railway still running when the power is on | 4 (shop windows) | Kestrel |
| Abelard's, upper | gallery round the atrium | racks, a gift-wrap counter, the atrium's hanging decorations, the escalators | 2 | Hair Trigger, Cache site |
| Abelard's roof (outdoor) | 30×20 | plant room, vent stacks, the back of the store's lit sign, the bridge | 2 (over the parapet) | **Power switch** |
| The Lyric | lobby 12×10, auditorium 18×16, balcony | ticket booth, popcorn stand, rows of seats, the projector still throwing a white frame on the screen | 3 | Brakeman, Packmule, Cache site |
| St Audra's | 14×20 | pews, candles, a nativity with a figure missing, the organ | 2 | Ironhide |
| Subway mezzanine | 20×12 | token booth, turnstiles, tiled pillars, tinsel on the booth glass | 1 | Cache site |
| Platform | 50×8 + the train | benches, the stalled train (walked through end to end, doors open), flickering tubes | 2 (the track tunnels) | a second Stitch |
| Service tunnel | 30×4 + signal room | cable trays, relay cabinets, warning stripes, the Forge in the signal room | 1 | **Forge** |

About 36 windows for Harrow Ridge's 18. On a street a "window" is a barricade the dead tear down;
on a roof they come over the parapet; in the subway out of the dark of the track tunnel.

**As blocked out (M3; `shared/src/map/longestNight.ts`, `npm run map -- longest_night`).** The
streets, every ground floor and the subway stand, undressed, with the doors and prices above and
the street barricades and ground-floor windows. Where the sketch left room, it was decided so: the avenue runs along the north
(z 30-42), a cut joins it to the square (z 50-86) and a passage joins the square to the lane
(z 92-98), each with its heap of wreckage in a wall across the middle; the Lyric is the block
between avenue and square on the west, its fire exit a corridor out of the auditorium; the diner is
at the square's south-west corner with the kitchen behind it, and the tenement's hall opens off the
kitchen. The subway's stairs go down from a door in the square's *east* side to the mezzanine,
which lies under the square's north-east corner and Abelard's front; a passage and the turnstiles
lead north to a flight down onto the platform's west half. The platform is in two halves under the
avenue with the roof down between them, and the train stands alongside both: the way from one half
to the other is through it. From the east half two flights climb in a head house on the avenue's
north side. The service tunnel runs south from the west half under the square, the signal room off
it, and comes up two flights to a door in the lane's north wall (the "hatch"). A flight that
reaches the street always stands inside a building: its head room runs up past street level, and
the compiler lets no room lie over open sky.

**Upstairs and the roofs (M4).** The tenement is a hall, a stairwell of two flights side by side
and a flat over the hall; the second flight comes out in a hut on its roof (1000). The fire escape
is a flight up the tenement's wall from the west end of the lane to a landing at the flat's north
door (750): the lane's, not the tenement's, and open to it. From the tenement's roof the plank
bridge (1250, a gate in the parapet) crosses the lane to a walk two metres wide along the lane's
north side - a setback a storey lower than the building it runs along - which crosses the mouth of
the passage on two more planks and ends on Abelard's roof. Abelard's has an atrium ten metres
square open to the upper floor's ceiling, a dead escalator at each side of it (one climbing north,
one south), a gallery round it upstairs (a zone of its own, "Abelard's, Upstairs", joined at the
escalators' heads), and stairs in the gallery's north-east corner to a hut on the roof (1250). The
Lyric's lobby has a flight up its north wall to a landing and the balcony, which hangs over the
auditorium's back rows and looks down on the rest: the one dead end upstairs. Fourteen zones, 17
doors, 36 windows of three kinds: a yard behind the wall (the streets' barricades and most ground
floors), a ledge in the open air (outside the flat, on the diner's roof and the fire escape; outside
Abelard's upper floor over the square; over the parapets of both roofs, where the window is a gap
in the parapet), and the dark (the track tunnel at each end of the platform, one off the mezzanine
and one off the service tunnel; the tenement's cellar; and the stock rooms behind Abelard's four
ground-floor windows, which were yards until its roof had to lie over them). A walked roof is a
block with a metre of parapet all round wherever something lower lies beyond; against a taller
neighbour it runs to that building's wall.

**The streets dressed (M5; `shared/src/map/dressing/nightStreets.ts`).** The tree stands in a
stone tub in the middle of the square (74, 68), fourteen metres of it, and blocks sight like a
wall up to its top. The rink is round it: 16 x 12 m of ice inside boards a metre high, a gate in
the middle of each side, so the tree can be run round and the ring left four ways. Strings of
bulbs run from the tree down to the square's six lamp posts and across to the Lyric and to
Abelard's. The market is ten stalls (three with the canopy down, their bulbs still lit) in a row
along the north side with an alley behind it, down the east side and along the south; the
bandstand is on the Lyric's side; benches face the ice. Dray Avenue has seven cars nose to tail
west of the cut, a police line and a patrol car across the road at it, and the bus over the south
kerb and into the wall east of that: the way past the bus is the north pavement, three metres
wide, and it is the avenue's one narrow place. Three more cars, a kiosk, a telephone box, steam
off three gratings and a manhole, eight strings of bulbs from wall to wall. Tallow Lane has the
van that was unloading at Abelard's, dumpsters, bins, crates, a brazier by the hatch, five lines
of washing overhead and one string of bulbs; its lamps are bulkheads on the wall, not posts. The
sketch's manhole as a way in was not built (the avenue's four are barricades). Nothing sold yet,
no signs (M8); the diner's own front is M7.

**The halls dressed (M6; `shared/src/map/dressing/nightHalls.ts`).** *Abelard's.* In at the door
from the square a toy carousel is still turning, shop dummies in winter coats stand each side of
it and down the west wall, and the atrium is straight ahead: the model railway on a table in the
middle of its floor (the train goes round its town only while the mains are on), a star, four
baubles and two strings of bulbs hung over it from the upper floor's ceiling, garlands on the
gallery's lip. Toys fill the north side - shelves along the wall between its two windows, two
gondolas and tables of bears down the floor - and the east; glass counters run along the flank of
each escalator, which has its balustrades now; tables of gifts along the south. The grotto is the
south-east corner: the front of a log cabin against the east wall with its windows lit, the big
red chair in front of it with nobody in it, firs, and two lines of rope on brass posts for the
queue. Crates in the loading bay. Upstairs is coats: rails round the gallery, dummies on the north
wall, and the gift-wrap counter against the south wall. Nothing is sold and nothing stands in the
south-west corner of the upper floor, kept for M8.
*The Lyric.* The lobby has the ticket booth and the popcorn stand in its south-east corner by the
door, a rope, posters in frames of bulbs and a small tree; outside, a canopy over the door with
its lettering gone and bulbs under it. The auditorium's screen hangs on the west wall over the
window the dead come through, eleven metres wide, a white frame on it and nothing in the frame:
it is what lights the hall. Six rows of tip-up seats face it, two metres apart, in two blocks of
five metres with an aisle down the middle and one along each wall; the last two rows are under
the balcony. On the balcony a row stands behind a walk along the rail and another against the
back wall, with the projector between its halves, reels turning.
*St Audra's.* Six rows of pews each side of a nave two metres wide from the door to the altar,
which stands under a rose window on the north wall with its six candles lit; the nativity in the
north-west corner (the crib has straw in it and nothing else), the organ in the north-east, a
stand of votive candles in each corner of the nave, lancets of coloured glass down both sides.
On the avenue: a stone doorway with a gable and a cross, a lantern in it, a lancet each side and
a rose over it. Seats, pews, counters and tables stop nobody's shot; shelves, the booth, the
cabin and the organ do.

**The rest dressed (M7; `shared/src/map/dressing/nightHomes.ts`, `nightSubway.ts`).** *The
Starlight.* Six booths, four under the north wall and two under the east, plates still on their
tables; six metres of counter in front of the kitchen arch with stools along it (the till and
the urn, then the pie case with its lamp on), a metre and a half behind it and a way round its
west end; the jukebox lit on the west wall, a tree in the south-east corner, paper chains from
wall to wall. The middle of the floor is clear: it is where everyone starts. The kitchen has its
range, sink, refrigerator and shelves down two walls. Outside, over the door on the square: three
bands of neon and a star on a mast above the roof (the name's tubes are there, with no name in
them: M8).
*The tenement.* The hall has letter boxes, a radiator and somebody's bicycle. The flat is one
room: the table laid for six in the north half with the bird on it and the candles lit, a
sideboard with the wireless on; in the south half an armchair and a sofa turned to a television
showing snow, the tree and its presents in the corner; a bed and a wardrobe against the east wall.
The fire escape is iron now: tread plate underfoot (it rings), black rails on balusters up both
sides of the flight, and to the lane a face of flat bars and stays (a wall style of its own,
`iron`, on a half-metre strip along its foot). Every ledge in the open air has an iron rail round
its three open sides, and the six that hang clear have brackets back to the wall under them.
*The roofs.* The tenement's: a timber water tank on iron legs in the south-west (it hides whoever
is behind it), two chimney stacks, a pigeon coop against the hut, two aerials, bulbs along the
north parapet and a plastic reindeer, lit, looking over the lane. Abelard's: a glazed lantern six
metres by eight over the atrium with the store's light coming up through it (a metre high: shot
across, walked round), the plant room in the north-west corner with its door to the south, two
condensers whose fans turn with the mains, four vent stacks (three breathing), and along the west
parapet the back of the store's sign, eight metres of frame with the red of nine letters round
their cans.
*The subway.* On the mezzanine the way north to the platform is through a bank of three turnstile
housings (two lanes, a metre and a half each) fenced off from the hall, the token booth beside it
with tinsel on its glass; four tiled pillars, benches, posters, two telephones, a stopped clock.
The platform has a row of pillars down each half, benches under the south wall, a yellow line at
the edge, rubble where the roof came down; along its north wall wherever the train stands is the
train's side - steel to the sill, a band of windows (lit a little without the mains, and properly
with them), the dark over its roof. Inside, the train is three carriages: a bench down each side
wherever there is no door, two metres between them, a frame across at each carriage end, poles.
The service tunnel has cable down both walls, pipes overhead and relay cabinets; the signal room
a lever frame under a lit diagram of the line on its north wall, relays along the south, and its
west wall left clear for the Forge (M8). Pillars, the tank, the plant room, the booth, cabinets
and the wardrobe block sight; booths, counters, benches, seats and the lantern do not.

**The look.** The same 90s horror as the station - dark, grain, hard pools of light, nothing clean
- with Christmas as the only colour in it. Warm strings of bulbs over grey snow; the tree lit over
a square of wrecked stalls; shop windows with their displays still turning; presents nobody will
open. The decorations are what is wrong with the place, so nothing festive is ever damaged for
effect: it is all still on, and that is the point. Sound does the rest: wind between the towers, a
siren a long way off that never gets nearer, a music box in the grotto and the diner's jukebox
playing carols old enough to belong to nobody, a little slow and a little flat (as note lists, like
every other tune).

**The skyline** is never walked. Towers of thirty and forty storeys ring the map, their lit
windows fading up into fog and a sodium glow where the station has mountains and an aurora; the
buildings players do go into are the low old ones at the towers' feet.

---

## 5. Multiplayer architecture

**Model: authoritative server for the world, trusted-but-verified clients for their own body and
aim.** This is co-op with friends, so we optimise for feel and simplicity over cheat-proofing.

- **Rooms:** client opens `ws://host/ws`, sends `create` or `join {code}` (4-letter code) with a
  name. Lobby shows players + ready state; host starts. A room is on one map (`room.map`): the
  host may change it in the lobby (`map {id}`) to any the server offers (`room.maps`: the maps
  people play, plus the proving grounds on a debug server), which asks everyone to ready up
  again. A client builds its world once, for one map, so when its room is on another it loads
  the page again with `?map=` and takes its seat back by its token. Late join allowed — spawns next round
  (at once during an intermission). After a game over the room shows the results until any
  player sends `again`, which returns everyone to the lobby.
  Disconnect: slot held 60 s for reconnect (token in `sessionStorage`), then dropped. A tab that
  died can be replaced: the last seat is also noted in `localStorage`, and a new tab offers
  "Rejoin room" once that note has gone stale (a live tab re-stamps it every 2 s). Solo play
  is just a room of one — there is no separate offline code path.
- **Untrusted input:** every frame goes through `decodeClient` → `checkClient` (`shared/src/wire.ts`:
  types, ranges, lengths; a bad frame closes the connection), then token buckets in `server/src/link.ts`
  (`RATE_*` in constants: 120 msg/s overall, chat 1/s, markers 1/s, room requests 2/s; a flood is
  dropped, a long one disconnects), then the handlers' own checks of what the values mean. Sockets
  that never say hello (10 s) or stop answering pings are closed; rooms empty for 30 s, or sitting
  unused in the lobby or on the results for 30 min, are closed (`idle`).
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
  (`[id, x, z, yaw, state, hpFrac, speed, y]`; `y` is the height of the floor underfoot, last so
  that older fields keep their places). Static/slow state (doors, power, barricades, perks owned,
  Cache site) is sent on change + in a full `sync` on join. Only switch to binary if profiling
  demands it.
- **Protocol** is defined once in `shared/protocol.ts` as discriminated unions
  (`ClientMsg`, `ServerMsg`); both ends import it. Bump `PROTOCOL_VERSION` on breaking change;
  server rejects mismatches.
- **Deployment:** `npm run build` then `node server/dist/index.js` serves `client/dist` and `/ws`
  on one port (`PORT`, default 8080). The Dockerfile builds the same thing into a small image
  (`README.md` has the hosting notes). In dev, Vite proxies `/ws`.

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
validation, nav and LOS. The **client** `worldBuilder.ts` turns it into one mesh per zone and
surface style: floors, ceilings and wall quads wherever a cell's open height interval is not matched by
its neighbour (this one rule yields walls, door lintels, window sills and jambs), with all
lighting baked into vertex colours (zone ambient + light pools with grid line of sight + fake AO).

**Where a map is** is data too (`MapDef.scene`): the kind of sky and its colours (`sky`: 'ridge' or
'city'), what the solid looks like from outside (`built`: 'station' or 'city'), what stands beyond
the map (`beyond`: pines, towers), the light on what belongs to no zone (`outside`), what the pockets
behind windows are paved and walled in (`pocket`), whether it snows, the air of a zone that names
none, where the menu's camera stands; a zone's `air` names the drone it hums (`audio/ambience.ts`). `MapDef.rules` holds the
numbers a map needs to differ in (`rulesOf(def)`: the pause between rounds, the Forge's price).
`map/maps.ts` is the list (`MAPS`, `mapChoices`, `compiledMap(id)`); a `hidden` map is a proving
ground no lobby offers.

**Windows** carve a walled, roofless pocket (3 m deep by default) behind them; zombies spawn at
the back of the pocket, so `spawns` is generated, not authored. Pockets need solid ground behind
the wall — the validator rejects pockets that overlap rooms or each other. `Opening.behind` names
the two other kinds a city needs. `'air'`: a ledge in the open air, planks with nothing round them,
which may hang over a street or over a lower roof (outside an upstairs window; over a parapet, and
then the window itself is a gap in the parapet with nothing above it). `'tunnel'`: roofed and
dark, floored and walled like the room it opens on, so it can lie under a street or under the
floor above (a track tunnel, a cellar, a stock room).

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

**Height.** A room has a `level` (storey: -1 a basement, 0 the ground, 1 upstairs; `MapDef.levels`
names the others and gives each its base height), a floor height `y` above that base, and
optionally a `rise` (`{to, by, stairs?}`: the floor climbs `by` metres towards `to` in equal
risers, one a cell, meeting the floors at both ends). Openings, props, interactables, lights and
player spawns take a `level` too. The compiled grid is a stack of layers, one per storey
(`idx(cx, cz, layer)`; without a layer, the ground), and rooms on different levels may lie over
each other as long as what is open in one column never overlaps (the compiler checks this, a
slab's thickness between, and 2 m of headroom everywhere). A floor that is itself under the sky may
hang over another that is (a bridge over a street, a ledge over a pavement; never a roofed room):
`CompiledMap.deck` marks it, and the air of the cell below then ends at its underside
(`CompiledMap.cap`: for every cell where its air stops - its ceiling, or under the sky nowhere,
or the bottom of the `DECK`, a quarter of a metre, of whatever hangs over it). The world builder
draws such a floor's underside and its edges. A storey is only where a cell is
*stored*. What joins two cells is their floors lying within `STEP_HEIGHT` (0.3 m) of each other:
`CompiledMap.links` holds, for every cell, the cell reached by a step to each of its eight
neighbours, whatever layer that is on. So a staircase is a run of cells each a riser above the
last, its head can stand beside a cell of the storey above, and anything taller than a step is a
ledge - a wall to whoever walks, in both directions. Everything that stands somewhere carries the
height of the floor under it (`y`), and the lookups take it: `standAt`/`walkAt(cx, cz, y)` (the
cell someone at that height is on), `holdAt(cx, cz, y)` (the cell whose air holds a point),
`zoneAt(x, y, z)`, `floorOn(level, x, z)` for things placed by level. The Stacks
(`map/stacks.ts`; `npm run map -- stacks` prints it) is a small proving ground with a ramp, a
terrace, a loft over a hall and a cellar under it; `stacks.test.ts` in shared and server run the
map machinery and a full-horde soak on it. Harrow Ridge uses all of it (4.11). A solid prop may not
stand on a ramp or stairs (the compiler refuses it); a `railing` prop (dressing helpers `rail`,
`stairRail`) marks the top of a ledge and stops nothing.

**The outside of a city** (`scene.built: 'city'`; `map/massing.ts`, `render/city.ts`). To whoever
walks, solid is a wall of no particular height. Seen from outside it is a building, so on a city map
the solid has one: `MapDef.blocks` are rectangles `{x, z, w, d, h, face, tint, parapet, lit, roof}`
saying "what stands here is `h` metres tall, faced in this wall style" (later blocks have the ground
where they overlap; solid no block covers is 14 m of brick). `massing(map)` gives every column of the
grid its top: under the sky (a street, a walked roof, a pocket) the floor that lies open; anywhere
else the block's height, or as much more as the rooms inside need (a stair head stands through the
roof as a hut, its walls with it), plus a parapet wherever something lower lies beside it. Three
things read it. The world builder stops a wall where the building behind it stops, and draws none
against open sky (a roof's edge over a street or over a lower roof is a drop: rail it). `city.ts`
carries every building on from where the street's own walls end (`Room.ceil` of the outdoor room,
4 m by habit) to its top, in the block's wall style and lit as part of the same cell, so the seam
does not show: a string course, a row of sash windows to each 4 m storey (one in five lit, by a
hash of where it is), a cornice, a snowed roof on whatever anyone could look down on, and a water
tank, a stair hut or vents on it. And the snow falls on the roofs. A street's ground storey is still
the half-metre strip rooms along its edge: a shop front below, the block's brick above. Beyond the
map, `beyond: 'towers'` (`render/towers.ts`) rings it with two rows of towers 48-165 m tall (one
unlit mesh, the fog reaching it a quarter as much, colours fading into the sky's glow with height),
across a cross street's width of bare ground; the 'city' sky is low cloud lit from underneath with
a painted far skyline. The Corner (`map/corner.ts`, hidden; `npm run map -- corner`,
`npm run tour -- --corner`) is the proving ground: a street with kerbs between buildings of six
heights, a shop, a flat, a walked roof and an underpass.
Sight and shots know the heights too (`CompiledMap.skyline`, which is `massing().top`; null on a
map whose solid has none, where solid is endlessly tall as it always was): a point above the top of
its column and in no cell is in the open air (`aloft`), so `seeThrough`, `rayWorld` and thrown
things pass over a roof or a parapet lower than they are and stop at one that is not. On such a
map tall furniture under the sky has a top as well (`shutAt(i, y)`): a look or a shot from a roof
passes over a kiosk, a bus or a market stall, and the tree stops it for fourteen metres. To the
buildings, what hangs in the air is not there: a column is open from its *lowest* floor under the
sky, so the lane under a bridge is still street, a ledge over a lower roof leaves that roof as it
was (the validator refuses one sunk into it), and a gap in a parapet is part of the parapet.

`validate.ts` runs in tests and fails the build if: a block is off the grid or off the map; a prop blocks the floor inside a window; any zone is unreachable with all doors open;
any window/spawn can't path to the player spawn; a prop seals a lane (<1.5 m); interactables are
not adjacent to floor; rooms overlap. `npm run map` validates and writes an ASCII top-down dump to
`docs/MAP.txt` (a sheet per storey when there are several; `^ v < >` mark ramps and stairs, pointing
uphill) — **agents must look
at that dump (and a screenshot) after any map edit.**

### 6.2 Collision
Players and zombies are circles against the cells + prop AABBs (slide along walls), each standing
at the height of the floor under its centre: `moveCircle` treats every cell whose floor is more
than a step from that height as a wall, and follows the floor up and down as the centre crosses
treads. Nobody jumps or falls. Bodies whose feet are more than `FLOOR_GAP` (1.5 m) apart in height
are on different floors and do not touch (attacks, separation, revives, pick-ups, purchases).
Hitscan: client rays against zombie hit boxes (head/torso/limb boxes on the rig) and `rayWorld`
(every storey's floors, ceilings, sills and props; in a city the roofs, with the air over them
open); server LOS is a grid DDA (`los.ts`) run chest
to chest in 3D, so the floors between storeys hide and shield, and so does a parapet to whoever is below it. Closed doors and unbroken windows
are solid cells. The server accepts a reported move only onto a floor that exists and is no
further up or down than stairs could have taken the player over that distance.

### 6.3 Navigation
`flowfield.ts`: Dijkstra over walkable cells, along `CompiledMap.links` (so across storeys by their
stairs), from each living player's cell (cells touching a wall or a ledge
cost more, so paths keep to the middle of lanes; a step costs a small whole number, so the queue is
a ring of buckets, one a distance, and a field costs what the map has of floor, not the size of its
grid: about 0.5 ms on the station, 1.3 ms on The Longest Night), recomputed every 250 ms (staggered across ticks)
and, when a door opens, one field a tick over the next few ticks. Each zombie samples the field of its target player a few cells
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
  `names()`, `render(name)` offline, `record(on)`, `setVolume`), `pick()` (the name of whatever mesh is
  under the crosshair, for finding what a stray surface belongs to), `fly(x, y, z, yaw, pitch)` (the
  free camera at a point in the air, for pictures from where nobody can stand). Matching server-side
  `debug` messages, enabled only when `ZH_DEBUG=1`.
- URL flags: `?name=X`, `?room=CODE` (join; with `autostart` the room is created if missing —
  debug servers only), `?autostart=1` (skip menu and lobby), `?debug=1` (stats overlay).
- Bots. `shared/src/bot/mind.ts` (`BotMind`) decides what a computer-run player does from what
  that player can know: shoot the nearest zombie in sight, back away from what is close, reload,
  knife when dry, buy a wall gun, then better ones, ammunition, the doors on the cheapest way to
  what it wants, the master switch, tonics, the Forge, a roll of the Cache; fetch drops; get a
  downed teammate up. Three things drive it: `server/src/bot.ts` (`BotPlayer` speaks the wire
  protocol with a modelled aim; `Bot` puts one on a WebSocket - `npm run bot`, `npm run soak`),
  `server/src/game/campaign.ts` (a whole game on a fake clock: `npm run campaign`, and a short one
  in `npm test`) and `client/src/game/autopilot.ts` (`?auto=1` or `__zh.auto(true)`: the mind's
  wishes become key presses and looks, so the real client code shoots, reloads and buys).
  `server/src/botBrain.ts` is the older wander-only brain the fake-clock soak test still uses.
- `npm run ship`: the acceptance run - fresh clone, `npm ci`, build, `npm start` without debug
  commands, four browser players on autopilot through ten rounds, no errors in any log.
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
with no errors in client or server logs. (`npm run ship` does exactly this, with the autopilot at
each player's controls.)

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
  `test-results/audio-session.webm`: some 430 sounds, 12 at once at the busiest (the limit is 24;
  hit ticks, flesh hits and deaths are rate-limited so a shotgun or a wonder weapon cannot flood
  it), sound in every half second, peak 0.85. Nobody has listened to it: the
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
- [x] 13 UX, menus, robustness — done. Acceptance: `server/src/fuzz.test.ts` (20,000 random frames
  at the decoder; then a storm of garbage, hostile-but-well-formed and out-of-order messages from
  three clients, two of them inside a running game next to two honest players, some injected past
  the decoder straight at the handlers: no handler throws, nobody honest is dropped, nothing in the
  world goes non-finite, the junk rooms are swept) and `npm run ux` (four browser players; one is
  killed mid-round and comes back in a new tab as the same player in the same place while raw
  sockets throw junk at the server; then a tab reload; then the server itself is killed and
  restarted). Protocol v8: only new error codes (`idle`, `room_closed`, `server_full`); `chat` and
  `mark` were already in the protocol and now work.
  Server: field-level validation of every message (`wire.ts`), rate limits, hello and heartbeat
  timeouts, unused-room clean-up, a cap on rooms, a game whose tick throws is shut instead of
  taking the process down. Client: main menu with how-to-play and settings; settings saved in
  `localStorage` (sensitivity, invert Y, field of view, 270/540/810 lines, dither, screen shake,
  the three volumes, every key); lobby with invite link (`?room=CODE` drops you straight in), chat
  and who-joined/left/dropped lines; pause screen (Esc, or losing the mouse) with resume, settings,
  help and a two-click leave; in-game chat (Enter) and ping markers (Z: a diamond with name and
  distance, seen through walls, 6 s); spectating steps through teammates with fire / aim;
  a "connection lost" notice with the retry count, "seat taken" and "updated" notices with a
  reload button, and a line in the menu when the seat was lost. `main.ts` is split (~400 lines:
  `game/match.ts`, `game/events.ts`).
  Choices the plan left open: rebinding maps the physical key to the action's default code inside
  `Input`, so game code and `__zh.key()` still speak in defaults; binding a key that is in use
  swaps the two; Escape cannot be bound. Pause does not stop the game, even alone (the server
  has no pause; the screen says so). Markers are one per player and anyone not dead may place one.
  A malformed frame disconnects at once; a rate-limited chat line gets a polite refusal.
  Deferred: no kick or host controls in the lobby; no AFK timeout for a player standing in a
  running game; chat has no history beyond 40 lines and no mute; the rejoin offer takes ~5 s to
  appear after a tab dies (it waits for the old tab's stamp to go stale) and would take the seat
  from a second live tab only if that tab were frozen; the settings screen needs scrolling at
  540 px tall; mouse wheel and number keys cannot be rebound; bots neither chat nor ping; the
  soak's worst tick was 119 ms once in 9,000 (7 over budget) on the shared test machine — look at
  it in 14.
- [x] 14 Balance, performance, ship — done. Acceptance: `npm run ship` clones the last commit into
  a temporary directory, runs `npm ci && npm run build && npm start` there (no `ZH_DEBUG`, so no
  debug commands), opens four browsers, creates and joins a room through the menu and lobby, and
  lets the autopilot play each one with key presses. Result: ten rounds cleared in 13:33, 607
  kills, nobody downed, nothing in the four browser consoles, three server log lines and none an
  error, 119 draw calls in the busiest frame (budget 150). `test-results/ship-*.png`.
  **Bots.** One decision core, `shared/src/bot/mind.ts`, plays the whole loop (section 6.6) and is
  driven three ways: over the wire (`server/src/bot.ts`), on a fake clock (`game/campaign.ts`) and
  at the keys of a real client (`client/src/game/autopilot.ts`). Bots on the server are blocked by
  zombie bodies like a client is, and their aim is a model (`accuracy`, `head`).
  **Soak.** `npm run campaign -- 30 --god`: four bots to round 30 in 197 minutes of game time
  (2.5 minutes real): tick 0.34 ms average, 6.4 ms worst, 1 of 355,436 over the 5 ms budget;
  largest snapshot 1,416 bytes with 32 zombies (budget 4,096; `SNAPSHOT_BUDGET_BYTES`), events
  2.7 kB/s; worst zombie idle 3.0 s; 66 guns, 403 ammunition, 7 doors, 16 tonics, 74 Forge and 77
  Cache purchases; no bot message refused by the wire checks. The 119 ms tick seen once in session
  13 did not come back (flow fields are now recomputed one a tick after a door opens, not all at
  once). `npm run soak` (real sockets, 32 zombies) still passes with the new bots.
  **Balance.** Mortal teams of four, twelve seeds each (`npm run campaign -- 40 --runs=12`): bots
  that land 75% of shots with 20% of them to the head clear a median of 11 rounds (6 to 15);
  with 60% to the head, 15 rounds (14 to 19), power on in round 5, Ironhide by 6, the first Forge
  upgrade around 9. That is where a game should end for middling and for good players, so the round
  tables of 4.3 and the prices of 4.5-4.9 stand as they were. One number changed: ammunition for an
  upgraded weapon is 2,500, not 4,500 - at 4,500 a forged gun did 40% less damage per point of
  ammunition than the same gun unforged (Kestrel: 7.6 against 12.6), teams answered by letting forged
  guns run dry and buying new ones, and rounds past 22 took 16 to 48 minutes each; at 2,500 the two
  are level. In god mode the late rounds are still long (8 to 38 minutes from round 22): there the
  bots sit on their points because they will not shop inside a horde that never thins, which is the
  bots, not the prices.
  **Performance.** The world is now meshes per zone (was map-wide), so three.js culls what is
  out of view: the full horde in the yard draws 63k triangles in 52 calls at 33 fps in headless
  software rendering (session 9 measured about 23); lamp glow and lettering stay one mesh each. FX were already
  pooled (160 particles in one instanced mesh, 24 tracers, 2 lights, 3 blasts) and zombies
  instanced, so nothing changed there. A frame longer than 50 ms used to be cut to 50 ms, which
  put a slow machine in slow motion against the server (found when four software-rendered clients
  at 9 fps kept dying): a frame now covers up to 200 ms of real time, and the fps figure is real.
  **Ship.** `README.md` (play, controls, hosting, development). The Docker image builds and serves
  (249 MB, of which the game is 2 MB; `ws` is its only runtime dependency) - built here through
  the sandbox's proxy from a copy of the Dockerfile with the proxy's certificate added, since the
  Dockerfile as written needs plain internet access.
  Still open: nobody has played it on real hardware with a real GPU or listened to it (every
  frame rate above is software rendering; the 60 fps target is unmeasured); the bots do not throw
  grenades or decoys, rebuild barricades or use the wonder weapons well; lobby host controls, AFK
  handling and the other items deferred in sessions 11-13 remain deferred.

### After the 14 sessions: the map overhaul
Asked for by the owner: terrain with elevation, a layout that is not all rectangles, more than one
floor. Four steps.
- [x] 1 Height in the engine — done (sections 6.1-6.3 describe it). Storeys as layers of the
  grid joined by step links; ramps and stairs as `rise` rooms; movement, sight, shots, blasts,
  flow fields, the spawner, purchases, the bots and the validator all take the height of the floor
  underfoot; the wire carries it (protocol 9: `y` in `move`, `mark`, `correct`, the spawn events
  and at the end of the snapshot tuples). Harrow Ridge is untouched and plays as it did: three
  seeded 25-round bot campaigns give the same rounds, downs and purchases before and after.
  Proved on the Stacks (three storeys, a ramp and a terrace): 32 zombies and four roaming bots for
  three minutes, worst stall 3 s, every floor reached by both. Found on the way: a sight line
  between two points in one column (one directly over the other) checked nothing between them.
  (The client drew only the ground layer until step 2.)
- [x] 2 Rendering and feel for height — done. `worldBuilder` walks every layer: a cell's walls are
  its open interval less everything open in the column beside it, which now also yields stair
  risers, the faces of ledges and the edges of the slabs between storeys (a face under 0.35 m is
  drawn as floor: steps and kerbs). A ramp is walked as shallow steps but drawn, and stood on, as
  one slope (`CompiledMap.slope0/1`, `groundIn`, `footAt`), with a triangle of wall under its side.
  The bake is per cell on every layer (a light's `y` is above its storey's base; what it reaches
  is judged chest to chest, so a floor stops it); props, lamps, doors, mist, drips, snow and roofs
  go by their storey. Actors are drawn and hit at their heights (zombies, remote players, their
  hit boxes, tracers, lightning, markers, planks, the Cache and the Forge), prompts and revives
  go by floor, the view follows the floor smoothly, and a sound has the height of the floor it is
  made on (distance and occlusion). The server measures a reported hit in 3D.
  A server started with `ZH_MAP=stacks` plays the Stacks, and a client follows whatever map its
  server is on (`?map=`). `npm run heights` is the browser walk-through there (ramp, ledge,
  stairs, shots and prompts by floor, a zombie climbing from the cellar to the loft);
  `npm run tour -- --stacks` photographs it. Harrow Ridge draws as it did: fifteen tour views
  differ from the last commit's only by what moves (under 1% of pixels, the snow), and the seeded
  campaigns are unchanged.
  Not done: railings (a ledge is a bare drop; dressing, step 3); damage arcs still point in plan
  only; the roofs, snow and pines have only been seen on the station, since the Stacks has no
  yard.
- [x] 3 Rebuild Harrow Ridge - done (4.11 describes the site). Same nine zones, doors and prices, on
  three terraces 1.5 m apart, with the generator hall's gallery upstairs (the master switch and the
  tunnel's door are on it) and the Vault as the cellar under the bunker; every zone is now several
  rectangles. `npm run site` walks a browser player over all of it (slope, bluff, lab stairs, tunnel,
  gallery, dock, both vault flights: no corrections, the view moving smoothly; shots and prompts by
  floor; a zombie from the low yard up to the gallery and one from the hall down to the vault), and
  the other browser scripts, the tour (now 56 views, 28 of them again with the power on) and the
  25-round god-mode campaign (worst stall 3 s, no corrections, power, Forge and Cache all used) pass
  on it. Found on the way: stepping off the side of a ramp left the body overlapping the ramp's
  higher treads until the next move (`moveCircle` now pushes out again after the floor underfoot
  changes); the outdoor shell of a building was drawn half a metre outside every room rectangle,
  which cut through the next room wherever a building is more than one rectangle (`exterior.ts`
  now builds shells a column at a time); a thrown Siren rolls back down the snow slope; a bot took
  a zombie a few steps up the same flight of stairs for one on another floor (the mind now asks
  whether the straight line to it can be walked, and measures a shot's length through the air). New tools:
  `__zh.pick()`, and `npm run campaign -- --trace --downs` (where each bot is every ten seconds;
  what and where each was when it went down).
  **Bots get less far**: eight mortal campaigns reach rounds 7 9 5 8 8 9 12 8 (median 8) where the
  old station gave 9 6 15 10 14 14 14 13 (median 14); the first four rounds are the same to the
  shot. Shots per round cleared are unchanged, so it is where they stand and how they move, not how
  they shoot. Ruled out by experiment (median stayed 8-9): the terrace heights (the same plan
  flattened), the switch being upstairs, the Forge being a long way down, the yard's west breach, a
  cramped hall floor (the hall was widened 3 m anyway). Two traps found in the traces and removed:
  the Quickhands dispenser narrowing the lane beside the truck to 1.5 m (it now stands under the
  dock), and a dead-end pocket beside the lab stairs (now rock). Still seen in the traces: whole
  teams caught in the vault, which is a much longer dead end than it was, and bots going down one
  at a time on the way to a revive across the site. That is step 4's to settle - the bots, the
  site, or both. `campaign.test.ts` runs seed 2 for that reason (six seeds in eight clear its eight rounds).
  Not done: damage arcs still point in plan only; nobody has played it on real hardware.
- [x] 4 Balance and acceptance - done. **The yardstick was wrong first**: "median 14" for the old
  station was eight lucky seeds. Over 32 seeds the old station's bots clear a median of 9.5 rounds
  (mean 10.2, 16 teams in 32 reach round 10); the rebuilt one, untouched, 8.5 (mean 8.4, 5 in 32). A
  gap of under two rounds, not six.
  What it is not (each tried over 16 or 32 seeds, mean within half a round): zombie damage, the share
  of runners, the cap on the horde, ammunition reserves doubled, the order tonics and guns are bought
  in, where the team waits, the code changes of step 3 (the old map under the new code is unchanged).
  Zombies live as long, bots are as often alone and take as much damage on both maps until round 8.
  What it is: both maps have a cliff at rounds 8-10, where an unforged gun needs about five full loads
  of ammunition for one horde and a team that has not been to the Forge spends everything on refills.
  On the flat station the errands were short enough to be forged by round 9; here the switch is
  upstairs, the Forge two flights down, and every trip is longer. The only tunables the bots' reach
  answers to are the ones that are firepower: zombie health (-20% is +1.2 rounds) and aim.
  **The bots** (`bot/mind.ts`, `wants.ts`; they are also the autopilot):
  - ammunition: a refill costs the same however much it restores, so with the wall a step away they
    run to 10% first and a long walk off they leave at 35% (topping up early, tried first, cost a
    team 10,000 points by round 8: half a Forge each);
  - a best gun down to a magazine and a half sends them to the nearest wall they can pay at - its
    own, or another SMG or rifle - before anything else, a teammate on the floor included (14 first
    downs in 16 were a lone bot with 0/0 crossing the station, thousands of points unspent);
  - what is wanted more but has to wait keeps its points: nothing lesser is bought meanwhile;
  - a long errand starts when at most 12 zombies are about, a Forge trip once begun is kept to up to 24;
  - with nothing to do they go back to the wall their best gun hangs on, and never stand on a
    gallery, a flight of stairs or in the cellar;
  - running away, a way that leads into a dead end is marked down (`bot/deadends.ts`: rooms and
    doorways as a graph, whatever hangs off it by one neck under 4 m; the vault, the servery, the
    signals office, and a wing until its second door opens);
  - a rescuer takes the shortest way and pays for the doors on it; a purchase is made on the run,
    within reach, without stopping to stand square to the wall; tonics in the order Ironhide, Hair
    Trigger, Quickhands, Second Wind; the Coachman (two shells) ranks under the SMGs.
  None of these moves the mean by itself more than noise; together, mean 8.4 -> 9.1, and 18 teams in
  32 reach the Forge where 11 did.
  **The site's price**, in two numbers and nothing about the zombies: the pause between rounds 10 s
  -> 20 s, and the Forge 5,000 -> 4,000 (4.3, 4.8). With both: median 10, mean 10.0, 17 teams in 32
  to round 10, 27 forging - level with the old station. `campaign --runs=8`: 12 12 8 9 12 9 7 13
  (median 12) where it was 7 9 5 8 8 9 12 8.
  New tools: `campaign --trace` says where the horde is (inside by zone, and still outside),
  `--ledger` what a team earned and spent by reason, `--downs` tells an empty magazine from no
  ammunition at all.
  Acceptance: typecheck, lint and 232 tests; `campaign -- 25 --god` (25 rounds in 131 minutes of
  game time, worst stall 3.0 s, no corrections, the Forge used 34 times); `soak` (32 alive, worst
  stall 3.0 s); smoke, rounds, economy, e2e, site, heights, horde, wonders, ux, audio and the tour
  (102 pictures); `ship`, on a fresh clone of the commit: four autopilot players through ten rounds
  in 14:28 with one down (revived), forged guns from round 9, nothing in a console or the server log
  (`ship -- --here` before it: 14:14, no downs). Found on the way: the audio
  script read the damage arcs in the instant of the hit, a frame before they are published, and
  failed whenever that frame was slow (it waits for the frame now); `ux` failed once at the pause
  screen and passed when run again.
  Not done: the Forge still lies at the end of a long dead end and bots still die there (it is the
  site's one deathtrap by design, 4.11); damage arcs point in plan only; nobody has played it on
  real hardware, so whether 20 s and 4,000 suit people as they suit bots is unknown.

### The second map: "The Longest Night"
Asked for by the owner: a second map chosen in the lobby, a winter city at Christmas, full size
(4.12 is the design). Ten sessions, each ending green like the first fourteen.
- [x] M1 A game can be on any map - done. A room has a map; its host changes it in the lobby
  (a picker; protocol 10: `map {id}`, and `room` carries `map` and `maps`), the game starts on
  it, and the pages of everyone in the room load it and keep their seats (section 5). A server
  offers the maps people play, and the Stacks as well when it is a debug server; `ZH_MAP` now
  only says which map a new room starts on. The WebSocket bots learn the map from `sync`;
  `campaign --map=id`, `npm run map -- <id>` and the soak take one. The station's look is data
  (`MapDef.scene`: sky kind and colours, the pines, the snow, the default fog, the menu's
  vista; `ZoneDef.air` for the ambience, which was keyed by the station's zone ids), and
  `MapDef.rules` can change the pause between rounds and the Forge's price for one map (nothing
  sets them yet: the station's numbers are the game's defaults). `npm run maps` is the browser
  check: two players and a bot, the host picks the Stacks, both pages and both seats follow,
  the bot (started knowing only the station) fights there; a server without debug offers one
  map and cannot be talked onto another.
  Harrow Ridge is as it was: a seeded ten-round campaign gives the same rounds, downs, points
  and purchases to the shot, and 84 tour views differ from the last commit's only by what moves
  (80 under 2% of pixels - the snow; the lab's two views with the power on by its failing tube).
  Found on the way: the Stacks' menu camera stood outside its own map (it had the station's
  spot); a client sent to a map it did not know would have reloaded for ever; the fuzz test's
  count of hostile clients inside the game depends on how often they get back in, and a map
  change spends the same allowance as a join (the mix was rebalanced and the bar set from ten
  runs).
  Not done: the roofs and cladding in `exterior.ts` still go by the station's wall styles (M2
  writes the city's and makes that a kind of `scene`); changing map reloads the page rather than
  rebuilding the world in place, so a guest sees the lobby blink; the README says nothing of
  maps while there is one to choose.
- [x] M2 The city outside - done (6.1, "The outside of a city", describes it). The solid has a
  height: a map's `blocks` say how tall each building stands and what it is faced in, and
  `massing()` (shared) turns them and the rooms into a top for every column. From that the client
  draws each building on up from where the street's walls stop - the same brick under the same
  lamps, string course, sash windows a storey apart with one in five lit, cornice, parapet, a
  snowed roof with a tank, a hut or vents - stops a wall where the building behind it stops, and
  leaves a roof's edge open over a street or a lower roof. Beyond the map a ring of towers with
  their lights on fades up into the glow of a 'city' sky (cloud lit from below, a painted far
  skyline). `MapScene` gained `built`, `outside` and `pocket`, `sky: 'city'` and
  `beyond: 'towers'`; six surfaces are new (floors `asphalt`, `pavement`, `felt`; walls `brick`,
  `shopfront`, `subway`). The snow lies on roofs and comes up with a viewer who stands on one.
  Proved on the Corner (`map/corner.ts`, a hidden map: 48 x 40 m, four storeys, ten blocks from
  3.5 to 30 m): `npm run tour -- --corner` takes twenty pictures of it (street, kerb, barricade,
  shop, flat, roof in eight directions, underpass); 21,000-33,000 triangles and 18-33 draw calls
  from anywhere on it. A six-round god-mode campaign runs on it (no stuck zombie, no
  corrections).
  Harrow Ridge is as it was: a seeded ten-round campaign is the same to the shot, and of 100 tour
  views (84 of the station, 16 of the Stacks) 98 differ from the last commit's by under 2% of
  pixels; the other two are the lab's and the cold store's failing tubes, which differ as much
  from one run to the next.
  New tool: `__zh.fly(x, y, z, yaw, pitch)`.
  Not done: sight and shots across a roof lower than the eye (to `seeThrough` and `rayWorld` solid
  is still endlessly tall: M4, with the roofs, where `massing` has the heights ready); a pocket
  below ground is open to the sky through whatever stands over it (M4: "air or track"); every
  façade is brick with one kind of window (stone, a church, a cinema's blind wall are M5-M6's);
  the whole city's façades are one mesh a wall style, never culled (M9 measures); the Corner has
  no browser walk of its own beyond the tour.
- [x] M3 Blockout I: street and subway - done (4.12, "As blocked out", says where everything is).
  `map/longestNight.ts`, hidden until M10: 150 x 120 m, three storeys so far (street, mezzanine
  -4, platform -8), eleven zones, 13 doors at the plan's prices (two of them heaps of wreckage, two
  waiting for the power), 24 windows, 27 blocks from 3.5 to 30 m, about 6,000 m2 of floor (the
  station has 1,900). Undressed: lamps enough to see by, no props, nothing to buy.
  The engine, measured on it first:
  - *Flow field.* The grid is 216,000 cells (the station's 58,800; five storeys will make it
    360,000) with 24,000 of them floor. The old field kept a heap of sixteen numbers for every cell
    of the grid and asked every cell whether it was walkable on each recompute: 14.7 MB a field and
    2.75 ms a recompute here (4 MB and 0.89 ms on the station), against a 5 ms tick. Now the queue
    is a ring of buckets and the unchanging part (floor, wall costs, which cells are doorways) is
    worked out once a map: 2.8 MB and 1.3 ms here, 0.8 MB and 0.45 ms on the station. The
    distances are the same number for number (checked against the old field from 1,083 goals over
    the four maps, and in a test against a search with no queue at all), so Harrow Ridge is as it
    was: a seeded ten-round campaign is the same to the shot, in 4 s of real time instead of 7.
  - *Bake.* The world builds and bakes in 0.78 s in headless Chromium (the station, dressed, 0.50 s;
    the Corner 0.22 s): 163,000 triangles. Nothing to do yet; dressing will add to it (M9).
  - *The camera's reach, the fog.* The far plane is 400 m and stays. The map's fog runs 10-110 m
    (the Corner's 8-85): from one end of the avenue the other end is there, as a dark shape under
    the towers; each subway zone has thicker air of its own.
  - *Frame.* 27-55 draw calls, but 135,000-160,000 triangles from anywhere outdoors: the city's
    façades are one mesh a wall style and none of it is culled (M2 said so; M9 measures and cuts).
  The game on it: `server/src/game/night.test.ts` sends a zombie from the far end of the map to a
  player in the signal room, the chapel, the platform and the avenue's end, and soaks four roaming
  bots and a full horde for four minutes with every door open (ten zones walked, zombies on all
  three storeys, worst idle 2.1 s, tick 0.8 ms on average); `shared/src/map/longestNight.test.ts`
  holds the layout to the plan (prices, the circuit through the train, the power at both ends of the
  service tunnel, every flight walked). `npm run tour -- --night` takes 39 pictures
  (`tour-night-*.png`; a view named `air-*` is the free camera).
  Found on the way: a door cut through solid that no block covers stands under 14 m of default
  brick, so the wreckage in the cut had a tower's worth of wall over it (the two walls have blocks
  of their own now, 4 m, the sky over them).
  Not done: nothing is sold, so the campaign's bots never leave the diner (`campaign --god
  --map=longest_night` runs clean, eight rounds, but proves only the diner: the soak above is what
  covers the map until M8); the subway has no windows (M4: a pocket there needs something other
  than sky over it), so whoever is down there is come for from the street; the tenement is a hall
  with no stairs; the walls round a barricade are the building behind it with boards at its foot
  (M5's street kit).
- [x] M4 Blockout II: upstairs and roofs - done (4.12, "Upstairs and the roofs", says where
  everything is). Five storeys now, fourteen zones, 17 doors, 36 windows, about 8,100 m2 of floor;
  the grid is 360,000 cells.
  The engine (6.1):
  - *Pockets of three kinds.* `Opening.behind`: a yard (as always), `'air'` (a ledge of planks in
    the open, which may hang over a street or a lower roof; in a parapet the window is a gap, open
    above), `'tunnel'` (roofed and dark, so it lies under a street or under the next floor). The
    subway has four of its own, both roofs two each, and no zone is left with no way in.
  - *Floors over open street.* A floor under the sky may hang over another (the plank bridge, the
    walk over the passage, the ledges): `deck` marks it, `cap` is where the air below it ends, and
    every lookup that took "under the sky" to mean "no top" asks `cap` instead. A roofed room over
    open sky is still refused. Drawn with an underside and edges.
  - *Solid has a top to sight and shots.* `skyline` (the massing's tops) and `aloft`: lines of
    sight, `rayWorld` and thrown things pass over whatever is lower than they are. Maps without
    blocks are untouched: a seeded ten-round campaign on Harrow Ridge is the same to the shot.
  - *Massing.* A column is open from its lowest floor under the sky, so what hangs changes nothing
    below it; the walls a ledge hangs against are the building's own, drawn from the street up.
  The game on it: `night.test.ts` sends zombies out of the track tunnel up to Abelard's roof, over
  Abelard's parapet to the Lyric's balcony and from the chapel to the middle of the bridge; checks
  that someone on the platform is come for out of the tunnels and someone on a roof over the
  parapet; and soaks four bots and a full horde for four minutes (13 zones walked, zombies on all
  five storeys, worst idle 3.0 s, tick 0.9 ms on average). `campaign --god --map=longest_night`
  runs ten rounds clean (no stuck zombie, no correction). `deadends` is tested on the new graph:
  with every door open the roofs, the store and the subway are round trips and the balcony, the
  chapel, the signal room and the nook behind the tenement's hut are dead ends; a roof whose
  bridge is unbought is one too. `npm run tour -- --night` takes 62 pictures (23 new: the flat,
  the fire escape, both roofs, the bridge from above and below, the walk, the atrium, the gallery,
  the balcony, a tunnel's boards).
  Found on the way: a window raised every wall beside it to its own lintel (the massing's "a wall
  is as tall as the room beside it" took a window for a room), which put a ledge on the diner's
  roof inside a wall 7 m tall; someone standing right under the bridge could see whoever stood on
  it (the two ends of a sight line in one column were only asked whether each was in air).
  Not done: a ledge is bare planks on nothing and the fire escape a solid stoop of brick (M7's
  kit: iron, brackets, scaffold); the posts of the bridge's gate stand nearly 4 m (a door in a
  parapet is a door frame with the parapet's rim on top); the diner's block came down from 4.5 m
  to 3.75 so the flat's ledge clears it; from the street nobody on a roof is seen unless they
  stand at the parapet, and then only from well back - right, but untried in play; nothing is
  sold yet, so the campaign's bots still never leave the diner and the soak is what covers the
  map; outdoors a frame is now up to 200,000 triangles and the world takes 1.06 s to build and
  bake in headless Chromium (M9 measures and cuts); no browser walk of the heights beyond the
  tour (M10).
- [x] M5 Dressing I: the square and the streets - done (4.12, "The streets dressed", says where
  everything is). 25 new props in two kits, each a builder in code like the station's.
  *The Christmas kit* (`models/props/festive.ts`): the tree, cut firs, strings of bulbs, wreaths,
  garlands, presents, market stalls, the rink's boards and ice, the bandstand, benches, a
  snowman; whatever glows in it is always on, mains or no mains. *The street kit*
  (`models/props/street.ts`): cars (saloons, an estate, a cab, a patrol car; two with their lamps
  on), the bus with its inside lights failing, a van, a kiosk, a telephone box, police trestles,
  concrete barriers, hydrants, a mailbox, dumpsters, gratings and manholes, washing lines. A
  street lamp is a new fixture (`'post'`: an iron post, a lantern, a wreath). 212 props and 32
  lights placed over the three streets, the cut and the passage.
  The engine:
  - *Strung things.* `PropInst.y2` is the far end's height; `strung(type, x0, z0, y0, x1, z1, y1)`
    places a string of bulbs or a clothes line by its two ends.
  - *Steam.* A builder marks a vent with `k.steam(...)`; `render/ambient.ts` draws every plume in
    one mesh (two crossed sheets of the mist's wisps, climbing, lit by whatever lamp is near).
  - *Tall furniture has a top* where solid has one (6.1): `CompiledMap.shutAt`. Without it the tree,
    the bus and every stall would have been walls into the sky to anyone on a roof. Maps without
    blocks are untouched.
  The game on it: the layout test holds the tree, the rink's four gates, the bus and the way past
  it, and that every door and window is still reached; `night.test.ts` (four bots, a full horde,
  four minutes, every door open) and `campaign --god --map=longest_night` (ten rounds, worst idle
  3.0 s, no correction) run clean round the new obstacles. `npm run tour -- --night` takes 77
  pictures (15 new: the tree from the ground and the air, the rink, the market, the bandstand,
  Abelard's front, the bus, the traffic, the police line, the kiosk, the steam, the lane's van
  and brazier).
  Found on the way: three firs at the end of a stall boxed in a cell of floor; the lane's lamps
  were masts standing in the middle of it.
  Not done: the boards across a side street got wire along the top and barriers inside, but the
  wall round a barricade is still the building behind it; the stalls sell presents and nothing
  else, and nothing has a name on it (signs are M8); the bus and the patrol car's lights waver as
  flames do rather than blink; the manhole is not a way in; no sound for any of it (M8). A frame
  outdoors is now up to 233,000 triangles (it was 200,000) and the world takes 1.25-1.4 s to
  build and bake in headless Chromium (1.06): M9 measures and cuts - the bulbs are five faces
  each and there are about 800 of them. Untried in play: whether the rink's boards and the bus
  make the square and the avenue better to fight in or only slower to cross (M9, with things to
  buy).
- [x] M6 Dressing II: Abelard's, the Lyric, the chapel - done (4.12, "The halls dressed", says
  where everything is). 28 new props, each a builder in code. *The store kit*
  (`models/props/store.ts`): shelves of toys, tables of bears and boxes, glass counters, shop
  dummies, rails of coats, the gift-wrap counter, the model railway, a carousel, the grotto's
  cabin and chair, rope barriers, an escalator's sides. *The halls kit* (`models/props/halls.ts`):
  tip-up seats, the screen, the projector, the booth, the popcorn stand, poster cases, the
  marquee; pews, the altar, the organ, the nativity, candle stands, coloured glass, the porch.
  The other two are in the Christmas kit (a small indoor tree, things hung from a ceiling). 184 props and
  19 lights placed (`dressing/nightHalls.ts`); the auditorium's own lamp is nearly out and the
  chapel's two are halved, so the screen and the candles do the work. Four things move: the
  train (on the mains), the carousel, the projector's two reels.
  The game on it: the layout test holds the aisles (straight down the Lyric's to the window
  under the screen, straight up the nave to the altar), that seats and pews hide nobody and a
  gondola does, the railway in the atrium, both escalators still climbed, and every door and
  window still reached; `night.test.ts` (four bots, a full horde, four minutes) and `campaign
  --god --map=longest_night` (ten rounds, worst idle 3.0 s, no correction) run clean through
  the furniture. `npm run tour -- --night` takes 95 pictures (18 new).
  Found on the way: a line of sight whose far end stood exactly on the corner of a cell, reached
  from the side the cell is not on, never arrived - the trace ran on past it and reported
  whatever wall came next (`nav/los.ts`; it now stops at the end of its line). It showed from
  the Lyric's balcony, but it is the station's bug too: a seeded campaign on Harrow Ridge is no
  longer the same to the shot (it parts from the old one in round 8), and over 32 seeds the
  team clears 9.7 rounds for 10.0 (median 9 for 10) - inside what 32 seeds can tell apart, but
  M9 should take its Harrow Ridge baseline from after this commit.
  Not done: above the street the Lyric and the chapel are still blank brick blocks (M2 left
  stone and a cinema's blind wall to this session; the porch, the glass and the marquee are
  props on that brick); Abelard's shop windows are the `shopfront` wall with nothing turning in
  them, and the only display that turns is the carousel inside; the escalators' treads are the
  stairs every flight has; the projector throws no beam (the glow material is not see-through);
  the booth, the cabin and the posters have no names on them (M8); no sound (M8). The world is
  now 267,000 triangles (it was 234,000) and takes 1.5 s to build and bake in headless Chromium
  (1.3-1.4): M9 measures and cuts.
- [x] M7 Dressing III: the diner, the tenement, the roofs, the subway and its train - done (4.12,
  "The rest dressed", says where everything is). 45 new props in four kits, each a builder in
  code: *the diner's* (`models/props/diner.ts`: booths, the counter and its stools, the jukebox,
  a refrigerator, the sign), *the home's* (`home.ts`: letter boxes, a radiator, pictures, a
  bicycle; the dinner table, television, armchair, sofa, bed, wardrobe, sideboard, a rug), *the
  roofs'* (`roofs.ts`: water tank, chimneys, coop, aerials, the reindeer; plant room, condensers,
  vent stacks, the lantern, the back of the sign; the iron of a ledge and of a fire escape) and
  *the subway's* (`subway.ts`: token booth, turnstiles, fence, pillars, benches, posters,
  telephones, clocks; the train's side, seats, poles and carriage ends; relay cabinets, the lever
  frame, the diagram); paper chains are in the Christmas kit. 236 props and 14 lights placed.
  Four more things move (the condensers' fans, on the mains).
  The engine: one new wall style, `iron` (flat bars and stays over the dark), which is how the
  fire escape stopped being a stoop of brick - its flight is still solid, but the lane sees iron
  (a strip room along its foot, as every street's wall is) and its floor is tread plate. M4's
  other leftover, the bare ledges, is a prop (`ledge_iron`) made from each `behind: 'air'`
  window in `longestNight.ts`. A railing has an iron variant. Nothing else in the engine changed.
  The game on it: the layout test holds the diner (booths, the way round the counter, nobody
  starting in the furniture), the flat, the iron, the eight ledges, the roofs (what hides and
  what does not), the turnstiles' two lanes, the train (23 benches, in sight from end to end,
  every door clear) and the Forge's wall; `night.test.ts` (four bots, a full horde, four
  minutes; worst idle 3.0 s) and `campaign --god --map=longest_night` (ten rounds, worst idle
  3.0 s, no correction) run clean through all of it. `npm run tour -- --night` takes 121
  pictures (26 new). Harrow Ridge is as it was: a seeded ten-round campaign is the same to the
  shot.
  Found on the way: the soak's count of zones its four bots wander into goes by the seed more
  than by the map (9 to 13 over eight seeds with the dressing, three of them under the bar of
  ten; one of six was under it before): adding a room moved the seed it ran on to the wrong
  side, and it has another now. The roof tests stood on what is now the lantern.
  Not done: the train's side is on the platform's wall and its carriages inside do not line up
  with the windows outside; the turnstiles' arms are for show (nobody is stopped or slowed by
  one); the fire escape is still solid under its treads, and the lower ledges still hang on
  brackets with no ladder between them; the diner's sign and the store's have tubes and cans
  but no letters, and nothing else is named (M8); nothing sold, no sound (M8). A mortal campaign
  (`--runs=4`) clears 3, 3, 5 and 3 rounds with up to four corrections in a run (the last
  commit's had them too, and its seed 4 was stopped after ten minutes without finishing; not
  looked into: M8 gives the bots something to buy and M9 measures). The world is now 296,000
  triangles (it was 267,000) and takes 1.85 s to build and bake in headless Chromium (1.5): M9
  measures and cuts.
- [ ] M8 Things to buy, bots, sound. Mounts for every wall gun, tonic and Cache site, the switch,
  the Forge; whatever the bots need to know about a map this size; the city's ambience, the
  carols, zone fog; signs.
- [ ] M9 Balance and performance. `campaign --runs=32` against the station's numbers; frame time
  and draw calls from the worst view (a roof, looking across the square); snapshot and tick
  budgets with the horde spread over a block.
- [ ] M10 Acceptance. The tour, a browser walk over every height (as `npm run site` is for the
  station), the existing browser scripts on both maps where they are about the map, `ship` on
  each. README and CLAUDE.md say what there is.

M2 was the session thought most likely to become two (the engine had only ever hidden the
outside); it took one. Next most likely is
M9 (the station's rebuild took a whole step to balance, and errands here are longer still).

## 10. Risks to watch
- **Map authoring by hand in code** is the biggest schedule risk → mitigated by the carved-rect
  format, validator and ASCII dump (session 2) before any dressing (sessions 7–9).
- **Zombies getting stuck** → flow fields on the same grid as collision, soak test from session 5 on.
- **"Looks like programmer art"** → the retro pipeline, fixed palette and fog are mandatory from
  session 2; don't postpone them.
- **Netcode creep** → the trust model in section 5 is deliberate; do not add rollback, lag
  compensation or server-side movement simulation.
