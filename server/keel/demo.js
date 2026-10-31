// server/keel/demo.js — a headless mode loop for the M2 demo plugin.
//
// It is deliberately not `server/match`: it drives match.*/policy.* hooks and a fake sim host so a plugin can be
// exercised end to end (10 rounds, lives, gold, policy decisions, HUD views) before the real match layer is wired.

import { createFakeHost, createKeelRuntime } from '../../shared/keel/index.js';

const valueOf = (snapshot, id) => (id && snapshot.state?.[id] ? snapshot.state[id].value : null);

/**
 * @param {{ plugin: { manifest: any, modules: any[] }, rounds?: number, seed?: number, framesPerRound?: number }} opts
 */
export function runKeelDemo(opts) {
  const { plugin } = opts;
  if (!plugin?.manifest) throw new TypeError('runKeelDemo needs a loaded Keel plugin');
  const rounds = Number.isInteger(opts.rounds) ? opts.rounds : 10;
  const framesPerRound = Number.isInteger(opts.framesPerRound) ? opts.framesPerRound : 60;
  const host = createFakeHost({ seed: opts.seed ?? 1, units: [] });
  const runtime = createKeelRuntime({ manifest: plugin.manifest, modules: plugin.modules, host, seed: opts.seed ?? 1 });
  const id = (kind) => runtime.modules.find((m) => m.kind === kind)?.id ?? null;
  const matchId = id('match');
  const simId = id('sim');

  runtime.start();
  runtime.runHook('match.onMatchStart', { rounds });
  const history = [];
  let played = 0;
  let lastKills = 0;
  for (let round = 1; round <= rounds; round++) {
    if (runtime.finished) break;
    played = round;
    runtime.runHook('match.onRoundStart', { round });
    const before = valueOf(runtime.snapshot(), matchId) ?? {};
    runtime.runHook('policy.decide', {
      observation: { round, lives: before.lives ?? 3, gold: before.gold ?? 0 },
      legal: [{ type: 'save' }, { type: 'upgrade' }],
    });
    for (let i = 0; i < framesPerRound; i++) runtime.tick();
    const simState = valueOf(runtime.snapshot(), simId) ?? {};
    const totalKills = simState.kills ?? 0;
    const result = { kills: Math.max(0, totalKills - lastKills), leaks: 0 };
    lastKills = totalKills;
    runtime.runHook('match.onRoundEnd', { round, result });
    runtime.runHook('match.checkEnd', { round });
    history.push({ round, ...result, match: valueOf(runtime.snapshot(), matchId), policy: valueOf(runtime.snapshot(), id('policy')) });
  }
  runtime.runHook('match.onMatchEnd', { played });
  runtime.end({ rounds: played });
  return {
    played,
    finished: runtime.finished,
    errors: runtime.errors,
    views: runtime.views,
    history,
    snapshot: runtime.snapshot(),
    hash: runtime.hash(),
  };
}
