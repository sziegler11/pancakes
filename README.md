# Pancake Panic!

A NES-style 2D pancake-flipping game, playable in the browser.

**Play it:** https://sziegler11.github.io/pancakes/

## How to play

- **← / →** (or **A / D**) — move the chef
- **Space** — flip a pancake, grab a done one, place it on the plate, or scrape a burnt one

Each pan cooks a pancake. Flip it while the meter is golden (the **!** appears) —
too soon does nothing, too late and it burns. After enough good flips the pancake
is done (green arrow): carry it to the plate on the right. Stack the target number
of pancakes to clear the level. **Three burnt pancakes and the kitchen is ruined.**

Levels get progressively harder: more pans, faster cooking, more flips required,
and a shorter window before burning.

## Running locally

No build step, no dependencies — just open `index.html` in a browser,
or serve it:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Tech

- Vanilla JavaScript + `<canvas>`, rendered at 320×180 and scaled up with
  crisp pixels for the retro look
- All sprites drawn in code (no image assets), including a 3×5 bitmap font
- Chiptune-style sound effects via the Web Audio API
