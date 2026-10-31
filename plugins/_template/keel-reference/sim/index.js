// A Keel-native sim for the reference plugin: the content module's enemy joins the battle as a crystal shard.
//
// Every 20 frames a shard is spawned (up to 3 live shards), every 5 frames the shard aura hits up to two enemies.
// The `refractor` tag halves the damage a shard takes, so the same enemy record is used for both the spawned units and
// the damage rule. `node tools/keel.mjs run _template/keel-reference --frames 60 --json` prints the counters below.
export default {
  setup({ api }) {
    api.state.patch({ ticks: 0, waves: 0, hits: 0, kills: 0, mitigated: 0, ended: false });
  },
  hooks: {
    'sim.setup'(_ctx, api) {
      api.spawn({
        id: 'crystal_0', side: 'enemy', enemyKey: 'enemy_x_keel_reference_crystal', tag: 'refractor',
        hp: 120, maxHp: 120, x: 2, y: 0,
      });
    },
    'sim.tick'(_ctx, api) {
      const s = api.state.get();
      const next = { ticks: s.ticks + 1, waves: s.waves, hits: s.hits, kills: s.kills, mitigated: s.mitigated };
      if (api.frame % 20 === 0) {
        const live = api.units({ side: 'enemy', alive: true, tag: 'refractor' });
        if (live.length < 3) {
          const spawned = api.spawn({
            id: `crystal_${api.frame}`, side: 'enemy', enemyKey: 'enemy_x_keel_reference_crystal', tag: 'refractor',
            hp: 120, maxHp: 120, x: api.rng(`crystal-${api.frame}`).int(4), y: 0,
          });
          if (spawned?.ok) next.waves += 1;
        }
      }
      if (api.frame % 5 === 0) {
        for (const target of api.units({ side: 'enemy', alive: true, limit: 2 })) {
          const hard = target.tags.includes('refractor');
          const amount = hard ? 12 : 24;
          const hit = api.damage({ target: target.id, amount, type: 'arts' });
          if (hit.ok) {
            next.hits += 1;
            if (hard) next.mitigated += 1;
          }
          if (hit.killed) next.kills += 1;
        }
      }
      api.state.patch(next);
      // A read-only view is what a HUD (or the demo harness) can read; it never leaves the runtime.
      api.setView({ ticks: next.ticks, waves: next.waves, hits: next.hits, kills: next.kills });
    },
    'sim.battleEnd'(_ctx, api) {
      api.state.patch({ ended: true, frame: api.frame });
    },
  },
};
