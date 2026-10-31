// test/fixtures/keel-demo/sim/index.js — a tiny Keel sim module: spawn an ally, hit the enemy every 10 frames,
// count ticks/hits/kills. The numbers are asserted by test/keel/runtime.test.js and cli.test.js.
export default {
  setup({ api }) {
    api.state.patch({ ticks: 0, hits: 0, kills: 0, ended: false });
  },
  hooks: {
    'sim.setup'(_ctx, api) {
      api.spawn({ id: 'ally', side: 'ally', hp: 10, maxHp: 10, atk: 1, x: 0, y: 0 });
    },
    'sim.tick'(_ctx, api) {
      const s = api.state.get();
      const next = { ticks: s.ticks + 1 };
      if (api.frame % 10 === 0) {
        const [target] = api.units({ side: 'enemy', alive: true });
        if (target) {
          const hit = api.damage({ target: target.id, amount: 30, type: 'true' });
          next.hits = s.hits + 1;
          if (hit.killed) next.kills = s.kills + 1;
        }
      }
      api.state.patch(next);
    },
    'sim.battleEnd'(_ctx, api) {
      api.state.patch({ ended: true, frame: api.frame });
    },
  },
};
