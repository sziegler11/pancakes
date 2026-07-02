# AGENTS.md

## Project overview

Pancake Panic! is a single-page browser game: vanilla JS + canvas, zero
dependencies, no build step. Two source files:

- `index.html` — page shell, canvas element, CSS scaling (pixelated, 16:9)
- `game.js` — the entire game (font, audio, state, update loop, rendering)

## Conventions

- Internal resolution is 320×180 (`W`/`H` in game.js); the canvas is scaled up
  by CSS. All drawing uses integer pixel coordinates via the `px()` helper.
- Text is rendered with the built-in 3×5 bitmap font (`FONT` + `drawText`).
  Only uppercase A–Z, digits, and a few punctuation marks exist — add glyphs
  to `FONT` if you need more.
- Sprites are drawn in code with `fillRect` — no image assets. Keep it that way.
- Sounds are short Web Audio beeps defined in the `sfx` object.
- Input is tracked by physical key via `e.code` (`ArrowLeft`, `KeyA`, `Space`)
  in the `KEYS` map — do not switch to `e.key`.
- Game states: `title | play | won | lost`. Difficulty scaling lives entirely
  in `levelCfg(n)`.

## Verification

There is no test suite or linter. Verify changes by loading the game headlessly
with Playwright and checking for page errors plus a screenshot:

- Install Playwright in a scratch dir outside the repo (keep this repo
  dependency-free — no package.json/node_modules).
- Load `file:///.../index.html`, listen for `pageerror`, press Space to start.
- Game state (`state`, `chef`, `pans`, `plated`, `burns`, `cfg`) is readable
  and writable from `page.evaluate()` since everything is top-level in a
  classic script — useful for cheating to a specific state (e.g. set
  `plated = cfg.target - 1` to test the win flow).

## Deployment

Hosted on GitHub Pages from the `main` branch (root folder) at
https://sziegler11.github.io/pancakes/. Every push to `main` redeploys
automatically; there is no CI or build step.
