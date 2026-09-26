// Keyboard, mouse and touch. Produces the per-frame input object for Run.step.
export class Input {
  constructor(canvas) {
    this.keys = {};
    this.pointer = null;       // screen x while a finger/mouse is down on the canvas
    this.hold = { brake: false, dive: false };
    this.edge = { emp: false, od: false, pause: false };
    addEventListener('keydown', e => {
      if (e.repeat) return;
      this.keys[e.code] = true;
      if (e.code === 'Space' || e.code === 'Digit1' || e.code === 'KeyE') this.edge.emp = true;
      if (e.code === 'Digit2' || e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyQ') this.edge.od = true;
      if (e.code === 'Escape' || e.code === 'KeyP') this.edge.pause = true;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code) && document.body.classList.contains('in-run')) e.preventDefault();
    });
    addEventListener('keyup', e => { this.keys[e.code] = false; });
    addEventListener('blur', () => { this.keys = {}; this.pointer = null; this.hold.brake = this.hold.dive = false; });
    const down = e => { this.pointer = e.clientX; this.pid = e.pointerId; try { canvas.setPointerCapture(e.pointerId); } catch (_) {} };
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', e => { if (this.pointer !== null && e.pointerId === this.pid) this.pointer = e.clientX; });
    const up = e => { if (e.pointerId === this.pid) this.pointer = null; };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
  }

  bindHold(el, name) {
    const on = e => { e.preventDefault(); this.hold[name] = true; el.classList.add('on'); };
    const off = () => { this.hold[name] = false; el.classList.remove('on'); };
    el.addEventListener('pointerdown', on);
    el.addEventListener('pointerup', off);
    el.addEventListener('pointerleave', off);
    el.addEventListener('pointercancel', off);
  }

  frame(renderer) {
    const k = this.keys;
    let axis = 0;
    if (k.ArrowLeft || k.KeyA) axis -= 1;
    if (k.ArrowRight || k.KeyD) axis += 1;
    let targetX = null;
    if (this.pointer !== null && !axis) targetX = renderer.camX + this.pointer / renderer.scale;
    const out = {
      axis, targetX,
      brake: this.hold.brake || !!(k.ArrowUp || k.KeyW),
      dive: this.hold.dive || !!(k.ArrowDown || k.KeyS),
      emp: this.edge.emp, od: this.edge.od,
    };
    this.edge.emp = this.edge.od = false;
    return out;
  }
}
