// server/sim/battle/waves.js — line / wave projectiles (official 簇火-style attacks). A wave travels from a point along
// (dr, dc) at `speed` tiles/s, up to `distance`; when it first touches an enemy within `hitWidth` it detonates, dealing
// `damage` to every enemy within `blastRadius`. Repeated hits of the same wave on one enemy use `repeatScale`.
// Kits call `battle.spawnWave({...})`; the official prefab for the wave is played by the client's fx data (the engine
// emits a `wave` fx event with position/direction).
export class BattleWaves {
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
    const hit = new Set();
    let dist = 0;
    return this.every(0.1, (b, sc) => {
      dist += speed * 0.1;
      const x = o.x + o.dc * dist, y = o.y + o.dr * dist;
      if (dist > distance || !b.grid.inRect(Math.round(y), Math.round(x))) { sc.cancel(); return; }
      const contact = b.enemies.some((e) => e.alive && e.side === 'enemy' && !e.isFlying
        && Math.abs(e.y - y) <= width && Math.abs(e.x - x) <= width);
      if (!contact) return;
      for (const e of b.enemies) {
        if (!e.alive || e.side !== 'enemy' || e.isFlying) continue;
        const dx = e.x - x, dy = e.y - y;
        if (dx * dx + dy * dy > radius * radius) continue;
        const mul = hit.has(e.id) ? repeat : 1;
        hit.add(e.id);
        const el = typeof o.elementFor === 'function' ? o.elementFor(e) : o.element;
        b.dealDamage(owner, e, {
          amount: (Number(o.damage) || 0) * mul, type: el ? 'element' : type,
          ...(el ? { element: el } : {}), isSkill: true, tags,
        });
      }
      b.fx('blast', { x, y, r: radius, id: owner?.id ?? null });
      sc.cancel();
    }, { owner });
  }
}
