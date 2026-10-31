// A Keel-native sim module: every 30 frames spawn a refractor, every 10 frames a 3-target caster hits up to three
// enemies; refractors take half damage. `node tools/keel.mjs run _template/keel-multi-module --frames 60 --json`.
export default {
  setup({ api }) {
    api.state.patch({ ticks: 0, spawned: 0, hits: 0, kills: 0, ended: false });
  },
  hooks: {
    'sim.setup'(_ctx, api) {
      api.spawn({ id: 'first', side: 'enemy', enemyKey: 'enemy_x_keel_multi_module_demo', tag: 'refractor', hp: 120, maxHp: 120, x: api.rng('spawn').int(3), y: 0 });
    },
    'sim.tick'(_ctx, api) {
      const s = api.state.get();
      const next = { ticks: s.ticks + 1 };
      if (api.frame % 30 === 0) {
        const spawned = api.spawn({ id: `wave_${s.spawned}`, side: 'enemy', enemyKey: 'enemy_x_keel_multi_module_demo', tag: 'refractor', hp: 120, maxHp: 120, x: api.rng(`wave-${api.frame}`).int(3), y: 0 });
        if (spawned?.ok) next.spawned = s.spawned + 1;
      }
      if (api.frame % 10 === 0) {
        const targets = api.units({ side: 'enemy', alive: true, limit: 3 });
        let hits = s.hits;
        let kills = s.kills;
        for (const target of targets) {
          const amount = target.tags.includes('refractor') ? 15 : 30;
          const hit = api.damage({ target: target.id, amount, type: 'arts' });
          if (hit.ok) hits += 1;
          if (hit.killed) kills += 1;
        }
        next.hits = hits;
        next.kills = kills;
      }
      api.state.patch(next);
    },
    'sim.battleEnd'(_ctx, api) {
      api.state.patch({ ended: true, frame: api.frame });
    },
  },
};
