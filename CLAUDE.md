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
Not scaffolded yet — session 1 creates them and must update this section
(`npm run dev | build | start | test | typecheck | lint`).
