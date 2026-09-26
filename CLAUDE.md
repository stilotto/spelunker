# Spelunker

Descent roguelite at https://stilotto.github.io/spelunker/ (GitHub Pages serves `main`).
Plain ES modules, no build step. See README.md for the file map.

- Run `./bump.sh` before each commit (cache-busts every module and the
  stylesheet so phones get the new code), then push straight to `main`.
- `js/run.js` is pure simulation and runs headless in Node for balance tests.
- Keep the "More games from Stilotto" link on the title screen and hangar footer.
