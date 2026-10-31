// 玻利瓦尔：猎犬主导的「追猎 + 渴血」。
//
// 3 人：召唤 1 只猎犬；成员/猎犬攻击施加「猎物」6 s，对猎物 +15% 伤害；猎物死亡转火。
// 6 人：第 2 只猎犬；对猎物造成伤害回复 8% 生命；击杀猎物获得「渴血」5 s（+20 ASPD / +10% ATK，3 层）。
//
// 战功/追猎是模块 state，不是盟约层数（层数跨回合持久，还会被 fields.js 校验）。
const BOND = 'bond_x_bolivar_pack';
const HOUND = 'token_x_bolivar_hound';
const BLOOD = 'bolivar:bloodthirst';
const FPS = 30;
const MARK_FRAMES = 6 * FPS;
const BLOOD_FRAMES = 5 * FPS;
const RESPAWN_FRAMES = 12 * FPS;
const MAX_RESPAWNS = 2;

const stateOf = (api) => api.state.get() ?? {};
const bondsOf = (u) => (Array.isArray(u?.bonds) ? u.bonds : []);
const isMember = (u) => bondsOf(u).includes(BOND);
const isMarked = (st, id, frame) => Number(st.marks?.[id] ?? 0) > frame;

function nearest(enemies, from) {
  let best = null;
  let bestD = Infinity;
  for (const e of enemies) {
    if (!e || e.id === from.id) continue;
    const d = (e.x - from.x) ** 2 + (e.y - from.y) ** 2;
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
}

function spawnHound(api, members, index) {
  const anchor = members[index % Math.max(1, members.length)] ?? members[0];
  if (!anchor) return null;
  const offsets = [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [-1, -1], [1, -1], [-1, 1]];
  for (const [dy, dx] of offsets) {
    const row = Math.round(anchor.y + dy);
    const col = Math.round(anchor.x + dx);
    if (!Number.isInteger(row) || !Number.isInteger(col)) continue;
    const r = api.spawn({ kind: 'token', tokenId: HOUND, row, col, owner: anchor.id });
    if (r?.ok) return r.id;
  }
  return null;
}

export default {
  setup({ api }) {
    api.state.patch({ marks: {}, hounds: [], blood: {}, members: 0, respawns: 0, respawnAt: 0 });
  },
  hooks: {
    'sim.battleStart'(_ctx, api) {
      const allies = api.units({ side: 'ally', alive: true });
      const members = allies.filter(isMember);
      const count = new Set(members.map((u) => u.id)).size;
      const want = count >= 6 ? 2 : count >= 3 ? 1 : 0;
      const hounds = [];
      for (let i = 0; i < want; i++) {
        const id = spawnHound(api, members, i);
        if (id) hounds.push(id);
      }
      api.state.patch({ members: count, hounds, respawns: 0, respawnAt: 0 });
    },

    'sim.beforeAttack'(ctx, api) {
      const attacker = ctx.attacker;
      if (!attacker || attacker.side !== 'ally') return;
      const st = stateOf(api);
      const member = isMember(attacker);
      const hound = (st.hounds ?? []).includes(attacker.id);
      if (!member && !hound) return;
      const now = api.frame;
      const marks = { ...(st.marks ?? {}) };
      for (const t of ctx.targets ?? []) {
        if (t && t.side === 'enemy' && t.alive) marks[t.id] = now + MARK_FRAMES;
      }
      api.state.patch({ marks });
      // 猎犬优先咬被标记的猎物（射程内）。
      if (hound && Array.isArray(ctx.targets)) {
        const prey = ctx.targets.filter((t) => marks[t.id] > now);
        if (prey.length) ctx.targets = prey;
      }
    },

    'sim.hit'(ctx, api) {
      const src = ctx.source;
      const tgt = ctx.target;
      if (!src || !tgt || !ctx.dmg) return;
      const st = stateOf(api);
      const member = isMember(src);
      const hound = (st.hounds ?? []).includes(src.id);
      if (!member && !hound) return;
      if (!isMarked(st, tgt.id, api.frame)) return;
      ctx.dmg.amount = Math.max(0, Number(ctx.dmg.amount ?? 0)) * 1.15;
      if (Number(st.members ?? 0) >= 6) {
        api.heal({ target: src.id, amount: Math.max(0, Number(ctx.dmg.amount ?? 0)) * 0.08 });
      }
    },

    'sim.kill'(ctx, api) {
      const st = stateOf(api);
      const killer = ctx.killer;
      const victim = ctx.victim;
      if (!victim || victim.side !== 'enemy') return;
      const marked = isMarked(st, victim.id, api.frame);
      if (!marked) return;
      // 追猎：标记转移到最近的敌人。
      const others = api.units({ side: 'enemy', alive: true }).filter((e) => e.id !== victim.id);
      const next = nearest(others, victim);
      const marks = { ...(st.marks ?? {}) };
      delete marks[victim.id];
      if (next) marks[next.id] = api.frame + MARK_FRAMES;
      api.state.patch({ marks });
      if (!killer) return;
      const member = isMember(killer);
      const hound = (st.hounds ?? []).includes(killer.id);
      if (!member && !hound) return;
      if (Number(st.members ?? 0) < 6) return;
      // 渴血：击杀猎物叠层（5 s，最多 3 层），刷新同一条 buff。
      const blood = { ...(st.blood ?? {}) };
      const cur = blood[killer.id] ?? { stacks: 0, expiry: 0 };
      const stacks = api.frame <= cur.expiry ? Math.min(3, Number(cur.stacks ?? 0) + 1) : 1;
      blood[killer.id] = { stacks, expiry: api.frame + BLOOD_FRAMES };
      api.state.patch({ blood });
      api.buffs.apply({
        target: killer.id,
        buff: BLOOD,
        duration: BLOOD_FRAMES / FPS,
        value: { mods: { atkPct: 0.10 * stacks, aspd: 20 * stacks }, visible: true },
      });
    },

    'sim.tick'(_ctx, api) {
      const st = stateOf(api);
      const now = api.frame;
      const marks = {};
      let changed = false;
      for (const [id, exp] of Object.entries(st.marks ?? {})) {
        if (Number(exp) > now) marks[id] = Number(exp);
        else changed = true;
      }
      if (changed) api.state.patch({ marks });

      const want = Number(st.members ?? 0) >= 6 ? 2 : Number(st.members ?? 0) >= 3 ? 1 : 0;
      const hounds = (st.hounds ?? []).filter((id) => api.units({ id, alive: true }).length > 0);
      if (hounds.length < want && now >= Number(st.respawnAt ?? 0) && Number(st.respawns ?? 0) < MAX_RESPAWNS) {
        const members = api.units({ side: 'ally', alive: true }).filter(isMember);
        const id = spawnHound(api, members, hounds.length);
        if (id) {
          api.state.patch({
            hounds: [...hounds, id],
            respawns: Number(st.respawns ?? 0) + 1,
            respawnAt: now + RESPAWN_FRAMES,
          });
        }
      }
    },
  },
};
