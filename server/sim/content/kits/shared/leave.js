// server/sim/content/kits/shared/leave.js — settle a passive when its unit leaves the field, with the state it had as it
// left (国度 T2 此身为界: "依靠弹道存储触发天赋时的攻击力（缓存攻击力）与场上的“国度”状态"; 被击倒 "则会延迟 0.7 秒产生伤害",
// 撤退 / 强制离场 at once). The `kill` hook runs before the removal ends the running skill and drops its buffs, so the
// capture there is the exact ATK the talent fires with; a retreat has no `kill`, so the capture runs in `death` instead.
//
//   onLeave(battle, unit, (snap, ctx) => { ... }, { capture: () => ({ atk: unit.s.atk }) })
//
// `settle` runs once. Its timer is not owned by the unit (a knocked-out owner is released at the end of the step).
const KO_DELAY = 0.7;

/**
 * @param {object} battle
 * @param {object} unit
 * @param {(snap: any, ctx: { reason: string }) => void} settle
 * @param {{ capture?: () => any, delayOnKO?: number }} [opts]
 */
export function onLeave(battle, unit, settle, { capture = null, delayOnKO = KO_DELAY } = {}) {
  let snap;
  let captured = false;
  let settled = false;
  const grab = () => (capture ? capture() : null);
  battle.on('kill', (c) => {
    if (c.victim !== unit || captured) return;
    snap = grab();
    captured = true;
  }, { owner: unit });
  battle.on('death', (c) => {
    if (c.unit !== unit || settled) return;
    if (!captured) {
      snap = grab();
      captured = true;
    }
    settled = true;
    const run = () => settle(snap, { reason: c.reason });
    if (c.reason === 'killed' && delayOnKO > 0) battle.after(delayOnKO, run);
    else run();
  }, { owner: unit });
  return {
    /** Run the settle now with a fresh capture (a skill's own end that must fire before the buffs drop). */
    settleNow() {
      if (settled) return;
      if (!captured) {
        snap = grab();
        captured = true;
      }
      settled = true;
      settle(snap, { reason: 'end' });
    },
  };
}
