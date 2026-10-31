// keel-item sim: a custom item's behaviour lives here, not in a buff.
//
// The record is content/items.json (`custom: true`, `buffs: []`); `unitView.items` carries the equipped ids, so the
// module can read who wears it. This example marks carriers with a custom status for 5 s and counts their kills.
const ITEM = 'item_x_keel_item_demo';

export default {
  setup({ api }) {
    api.state.patch({ carriers: 0, kills: 0 });
  },
  hooks: {
    'sim.battleStart'(_ctx, api) {
      const carriers = api.units({ side: 'ally', alive: true }).filter((u) => (u.items ?? []).includes(ITEM));
      api.state.patch({ carriers: carriers.length });
      for (const u of carriers) api.status.apply(u.id, 'x_keel_item_mark', { duration: 5 });
    },
    'sim.kill'({ killer }, api) {
      if (!killer || killer.id == null) return;
      const [who] = api.units({ id: killer.id });
      if (who && (who.items ?? []).includes(ITEM)) api.state.patch({ kills: Number(api.state.get().kills) + 1 });
    },
  },
};
