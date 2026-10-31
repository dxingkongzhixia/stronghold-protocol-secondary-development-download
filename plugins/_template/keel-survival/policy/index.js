// A tiny policy: upgrade when there is gold, otherwise save. The decision is kept in the module's own state.
export default {
  setup({ api }) {
    api.state.patch({ decisions: [] });
  },
  hooks: {
    'policy.decide'(ctx, api) {
      const s = api.state.get();
      const action = (ctx.observation?.gold ?? 0) >= 5 ? 'upgrade' : 'save';
      api.state.patch({ decisions: [...s.decisions, action] });
      api.setView({ last: action });
    },
  },
};
