# Spelunker

Drop into an enemy world and fall toward its core. You won't make it the first
time. Collect salvage and data, upgrade between runs, train your AI crew, and
get a little deeper every time. Destroy a core to unlock the next target.

Play: https://stilotto.github.io/spelunker/

- Steer: drag anywhere, or A / D. Brake: W. Dive: S.
- EMP: Space. Overdrive: Q (once researched).
- Progress saves in your browser.

## Code

Plain ES modules, no build step. Serve the folder with any static server.

- `js/data.js`: masses, enemies, upgrades, research, crew, relics (all tuning)
- `js/state.js`: save/load and derived stats
- `js/run.js`: one descent, pure simulation (runs headless in Node)
- `js/render.js`: canvas drawing
- `js/hangar.js`: between-run UI
- `js/tour.js`: tap-the-ship tour of the rooms
- `js/voices.js`: crew advice lines and the logic that picks them
- `js/main.js`: loop, screens, HUD
- `tools/balance.mjs`: headless balance sim, autopilot plays the campaign (`node tools/balance.mjs`)
- `IDEAS.md`: parked ideas for later
