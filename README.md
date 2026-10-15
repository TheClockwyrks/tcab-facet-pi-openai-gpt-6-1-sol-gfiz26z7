# Facet

**Pressure finds the flaw.** Facet is a browser puzzle played on a lit lapidary bench. Swap neighboring stones into lines of three or more. Every clear strains the gems it leaves behind; at three strain, a stone becomes flawed, worth double, and ready to shatter with the next clear beside it. Turn that pressure into a cascade.

Four in a line earns a **brilliant**, which clears its surrounding ring. Cross two lines for a **star**, which clears its row and column. Five or more earns a kindless **prism**: swap it with a stone to clear that entire kind. Meet each level’s target to continue with a new board. A round ends when no productive move remains.

## Run

Requires Node.js 22 or newer and npm.

```sh
npm ci
npm run dev
```

Open the URL Vite prints. The game needs no server-side services, account, credentials, or external downloads.

```sh
npm run build
npm run preview
```

The complete static site is emitted to `dist/`. Serve that directory at an origin root or any sub-path; all assets are page-relative. The build only type-checks and bundles **committed** assets. No art or audio generation tool is needed to install, build, or run the published project.

## Controls

- **Mouse, pen, or touch:** press a stone, drag onto an orthogonal neighbor, and release to request the swap. Alternatively, tap a stone, then tap its neighbor. Carrying a held stone back to its original cell withdraws the offer.
- **Menus:** point and release on a button, or use **↑ / ↓** and **Enter / Space**.
- **P / Escape:** pause or resume. A drawn **PAUSE** button also opens the menu.
- **M:** mute or restore all music and effects.
- **Escape:** return from the guide or final score. Every screen also has pointer-accessible navigation.
- **Backquote:** toggle the engine’s diagnostic overlay.

Audio unlocks on the first interaction. The game remains fully playable muted.

## Checks

```sh
npm run typecheck
npm run lint
npm run format
npm test
```

The tests exercise maximal runs, prism seeding, breadth-first expansion waves, strain, cut placement and precedence, gravity, refill poses, scoring, timer boundaries, menus, pointer devices, debug validation, and full engine frames over native canvases and controlled clocks. Coverage is written to `coverage/`.

After building, `node tools/smoke.mjs` runs the local Playwright/Chromium against `dist/` mounted at a nested URL, exercises the live menus and board, checks for failed requests, and verifies a narrow-viewport resize. With the development server running, `node tools/capture.mjs` recreates the showcase screenshots and engine recording.

## Project map

- `src/game.ts`: the complete readonly state contract, initialization, engine input/audio integration, and frame transition.
- `src/simulation.ts`: render-free board rules and elapsed-time resolution.
- `src/controls.ts`: shared pointer/keyboard/menu paths and hit targets.
- `src/debug.ts`: pure snapshot readings and immediate state poses, returned through `engine.debug` only.
- `src/presentation.ts`: canvas typography, chrome, sprite animation, and live particle compositing. The renderer changes no game state.
- `src/assets.ts`: awaited engine-owned asset loading.
- `public/assets/`: original pixel-art stones, damage variants, animation frames, live particle systems, synthesized cues, sampled glass shatter, and two original music pieces with MIDI scores.
- `tools/produce_assets.py`: the one-time authoring recipe, using `draw`, `draw-sheet`, `particle-2d`, `sfx-synth`, `sfx-sample`, and `music`. This is provenance, **not a build step**. Those optional authoring binaries are not distributed with the game.
- `showcase/`: player description, captured screenshots, and a gzipped recording made by the engine’s own draw-command recorder.

Simple 2D owns the frame loop, canvas fit, pointer mapping, key actions, asset decoding, audio unlock/muting, diagnostics, and recording. Game state is an immutable value replaced by each update; no board or round state is stored in module globals. The supplied entry point, constants, toolchain, engine, and specification files are unchanged.
