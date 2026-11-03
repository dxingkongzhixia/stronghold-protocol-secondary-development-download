// server/sim/battle/waves.js — line / wave projectiles (official 簇火-style attacks). A wave travels from a point along
// (dr, dc) at `speed` tiles/s, up to `distance`; the first enemy whose centre comes within `hitWidth` of the travelled
// segment detonates it there (a swept test: no tunnelling, and the reach is the perpendicular distance to the lane, so a
// diagonal wave is no axis-aligned box), dealing `damage` to every enemy within `blastRadius` of the contact point.
// Repeated hits of the same wave on one enemy use `repeatScale`.
// Kits call `battle.spawnWave({...})`; the official prefab for the wave is played by the client's fx data (the engine
// emits a `blast` fx event at the contact point).
export class BattleWaves {
  /**
   * The parameter t in [0, 1] of the closest point on segment a→b to p (a swept collision).
   */
  static _segT(ax, ay, bx, by, px, py) {
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    if (len2 <= 1e-12) return 0;
    const t = ((px - ax) * dx + (py - ay) * dy) / len2;
    return Math.max(0, Math.min(1, t));
  }

  /**
   * @param {{ owner: any, x: number, y: number, dr: number, dc: number, speed?: number, distance?: number,
   *   hitWidth?: number, blastRadius?: number, damage?: number, type?: string, element?: string|null,
   *   repeatScale?: number, waveId?: string|number|null, tags?: string[] }} o
   * @returns {{ cancel: () => void }}
   */
  spawnWave(o) {
    const owner = o.owner;
    const speed = Math.max(0.1, Number(o.speed) || 2.3);
    const distance = Math.max(0.1, Number(o.distance) || 5);
    const width = Math.max(0, Number(o.hitWidth) || 0.5);
    const radius = Math.max(0, Number(o.blastRadius) || 1.5);
    const repeat = Number.isFinite(o.repeatScale) ? o.repeatScale : 0.15;
    const type = o.type || 'arts';
    const tags = Array.isArray(o.tags) ? o.tags : ['skill', 'wave'];
    // Waves sharing a waveId share one hit set: further hits of the same wave on one enemy use repeatScale.
    this._waveHits ??= new Map();
    this._waveCount ??= new Map();
    if (o.waveId != null) {
      if (!this._waveHits.has(o.waveId)) { this._waveHits.set(o.waveId, new Set()); this._waveCount.set(o.waveId, 0); }
      this._waveCount.set(o.waveId, (this._waveCount.get(o.waveId) ?? 0) + 1);
    }
    const hit = o.waveId != null ? this._waveHits.get(o.waveId) : new Set();
    let ended = false;
    const finish = () => {
      if (ended) return;
      ended = true;
      if (o.waveId == null) return;
      const n = (this._waveCount.get(o.waveId) ?? 1) - 1;
      if (n <= 0) { this._waveCount.delete(o.waveId); this._waveHits.delete(o.waveId); }
      else this._waveCount.set(o.waveId, n);
    };
    let dist = 0;
    let entered = false;   // a wave may be born off the field (簇火 spawns 11 tiles behind its caster) and fly in
    return this.every(0.1, (b, sc) => {
      // The step's segment: where the wave was and where it is now (a swept collision, so a fast wave cannot skip an
      // enemy between two ticks).
      const px = o.x + o.dc * dist, py = o.y + o.dr * dist;
      dist += speed * 0.1;
      const x = o.x + o.dc * dist, y = o.y + o.dr * dist;
      const inside = b.grid.inRect(Math.round(y), Math.round(x));
      if (inside) entered = true;
      // before it has entered the field the edge means nothing; once it has, leaving = done (the map edge is its end)
      const outside = dist > distance || (entered && !inside);
      let contact = null, best = Infinity, cx = x, cy = y;
      for (const e of b.enemies) {
        if (!e.alive || e.side !== 'enemy' || e.isFlying) continue;
        const t = BattleWaves._segT(px, py, x, y, e.x, e.y);
        const qx = px + (x - px) * t, qy = py + (y - py) * t;
        const dx = e.x - qx, dy = e.y - qy;
        if (dx * dx + dy * dy > width * width || t >= best) continue;
        best = t; contact = e; cx = qx; cy = qy;
      }
      if (!contact) { if (outside) { finish(); sc.cancel(); } return; }
      for (const e of b.enemies) {
        if (!e.alive || e.side !== 'enemy' || e.isFlying) continue;
        const dx = e.x - cx, dy = e.y - cy;
        if (dx * dx + dy * dy > radius * radius) continue;
        const mul = hit.has(e.id) ? repeat : 1;
        hit.add(e.id);
        const el = typeof o.elementFor === 'function' ? o.elementFor(e) : o.element;
        b.dealDamage(owner, e, {
          amount: (Number(o.damage) || 0) * mul, type: el ? 'element' : type,
          ...(el ? { element: el } : {}), isSkill: true, tags,
        });
      }
      b.fx('blast', { x: cx, y: cy, r: radius, id: owner?.id ?? null, ...(o.waveTag ? { wave: o.waveTag } : {}) });
      finish();
      sc.cancel();
    }, { owner });
  }
}
