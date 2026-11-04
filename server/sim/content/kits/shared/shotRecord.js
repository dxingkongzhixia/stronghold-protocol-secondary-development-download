// server/sim/content/kits/shared/shotRecord.js — per-shot records: what a ranged attack does is decided at LAUNCH and
// applied when that arrow lands (冻河 T2: 「施加触发型效果后的下次普通攻击」 arms exactly that next attack, though a
// second arrow launched meanwhile must keep its own decision). The engine stamps every damage instance of one attack with
// its `attackId` (server/sim/ai.js) and passes it to the per-victim hit hooks; a record is keyed by (attackId, target).
const MAX_SHOTS = 64;

/** Record what `unit`'s attack `attackId` does to `target` when it lands. */
export function queueShot(unit, attackId, target, payload) {
  if (!unit?.mem || !target || attackId == null) return;
  const q = unit.mem.shots || (unit.mem.shots = []);
  q.push({ attackId, targetId: target.id, payload });
  if (q.length > MAX_SHOTS) q.splice(0, q.length - MAX_SHOTS); // loop-cap: a stale shot cannot grow the queue
}

/** Take (and remove) the record for (`attackId`, `target`), or null. */
export function takeShot(unit, attackId, target) {
  const q = unit?.mem?.shots;
  if (!q || !target) return null;
  for (let i = 0; i < q.length; i++) {
    const r = q[i];
    if (r.attackId === attackId && r.targetId === target.id) {
      q.splice(i, 1);
      return r.payload;
    }
  }
  return null;
}
