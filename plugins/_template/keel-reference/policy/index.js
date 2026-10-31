// A Keel-native policy: deploy while the hand has room and there is gold, otherwise save. The decision log lives in the
// module's own state (never in the page), and `api.setView` is what a HUD would read.
export default {
  setup({ api }) {
    api.state.patch({ decisions: [] });
  },
  hooks: {
    'policy.decide'(ctx, api) {
      const s = api.state.get();
      const obs = ctx.observation ?? {};
      const action = (obs.gold ?? 0) >= 4 && (obs.hand ?? 0) < 6 ? 'deploy' : 'save';
      api.state.patch({ decisions: [...s.decisions, action] });
      api.setView({ last: action, gold: obs.gold ?? 0 });
    },
  },
};
