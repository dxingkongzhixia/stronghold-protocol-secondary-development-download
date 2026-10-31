// keel-bond sim: one layer per kill, read back through api.bonds.
//
// The bond record lives in content/bonds.json; members are the operators/chess whose `bonds` list names
// `bond_x_keel_bond_demo`. This module is the example mechanic: +1 layer on a kill (the engine clamps at 999).
export default {
  setup({ api }) {
    api.state.patch({ kills: 0 });
  },
  hooks: {
    'sim.kill'(_ctx, api) {
      const kills = Number(api.state.get().kills) + 1;
      api.state.patch({ kills });
      api.bonds.addLayers('bond_x_keel_bond_demo', 1);
    },
  },
};
