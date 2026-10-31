// A tiny policy: upgrade when there is gold, otherwise save. The decision is kept in the module's own state and
// published as a view, so a UI module or the host can read it without touching the policy's internals.
export default {
  setup({ api }) {
    api.state.patch({ decisions: [] });
  },
  hooks: {
    'policy.decide'(ctx, api) {
      const state = api.state.get();
      const action = (ctx.observation?.gold ?? 0) >= 5 ? 'upgrade' : 'save';
      api.state.patch({ decisions: [...state.decisions, action] });
      api.setView({ last: action });
    },
  },
};
