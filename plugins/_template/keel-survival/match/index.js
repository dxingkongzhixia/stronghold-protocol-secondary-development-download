// 10-round survival: lives/gold/cleared live in the match module's state; the HUD reads ctx.setView.
export default {
  setup({ api }) {
    api.state.patch({ round: 0, lives: 3, gold: 10, cleared: 0, over: false });
  },
  hooks: {
    'match.onMatchStart'(_ctx, api) { api.state.patch({ started: true }); },
    'match.onRoundStart'(ctx, api) {
      const s = api.state.get();
      api.state.patch({ round: ctx.round });
      api.setView({ round: ctx.round, lives: s.lives, gold: s.gold, cleared: s.cleared });
    },
    'match.onRoundEnd'(ctx, api) {
      const s = api.state.get();
      const lives = Math.max(0, s.lives - (ctx.result?.leaks ?? 0));
      const gold = s.gold + 5;
      const cleared = s.cleared + (ctx.result?.kills ?? 0);
      api.state.patch({ lives, gold, cleared });
      api.setView({ round: s.round, lives, gold, cleared });
    },
    'match.checkEnd'(_ctx, api) {
      const s = api.state.get();
      if (s.lives <= 0) api.finish({ winner: null, reason: 'lives' });
      else if (s.round >= 10) api.finish({ winner: 'players', reason: 'survived' });
    },
    'match.onMatchEnd'(_ctx, api) { api.state.patch({ over: true }); },
  },
};
