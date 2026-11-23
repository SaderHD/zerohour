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
- `npm run smoke` — after a build: boots the server, drives headless Chromium, checks handshake
  and rendering, writes `test-results/smoke.png`. Uses the globally installed `playwright`; do not
  add it as a dependency in the cloud environment.

## Layout notes
- `@zh/shared` is consumed as TypeScript source by both sides (no build step). Config files
  (`vite.config.ts`) cannot import it.
- Tests and visual checks go through `window.__zh` (`client/src/debug.ts`); extend it as features
  land.
