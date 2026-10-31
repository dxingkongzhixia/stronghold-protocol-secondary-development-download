// server/keel/attach.js — bridge a Keel runtime to a live `Battle` hook bus.
//
// Each Battle event is turned into a plain view: no Unit, no `battle`, no hook handle crosses into a plugin. The few
// mutable fields the contract allows (`dmg`, `amount`, `targets`) are copied in and written back after the hook.
//
// The caller decides whether a room has a Keel descriptor. This module never attaches itself.

import { createKeelRuntime } from '../../shared/keel/index.js';
import { createStrongholdHost, unitView } from './stronghold-host.js';

const clone = (v) => {
  if (v === undefined) return undefined;
  try { return JSON.parse(JSON.stringify(v)); } catch { return null; }
};
const findUnit = (battle, ref) => {
  if (!ref) return null;
  const id = ref && typeof ref === 'object' ? ref.id : ref;
  return (battle.units ?? []).find((u) => u && u.id === id) ?? null;
};

/** The Battle event → Keel hook mapping. */
export const BATTLE_HOOKS = Object.freeze({
  battleStart: 'sim.battleStart',
  deploy: 'sim.deploy',
  tick: 'sim.tick',
  beforeAttack: 'sim.beforeAttack',
  hit: 'sim.hit',
  damaged: 'sim.damaged',
  heal: 'sim.heal',
  kill: 'sim.kill',
  death: 'sim.death',
  enemySpawn: 'sim.enemySpawn',
  enemyLeak: 'sim.enemyLeak',
  blocked: 'sim.blocked',
  battleEnd: 'sim.battleEnd',
});

/**
 * Attach a Keel runtime to a battle. Call before `battle.start()` so `battleStart` is not missed.
 * @param {any} battle
 * @param {{ manifest: any, modules: any[], seed?: number, budget?: any }} opts
 */
export function attachKeel(battle, opts) {
  if (!battle || typeof battle.on !== 'function' || typeof battle.offOwner !== 'function') {
    throw new TypeError('attachKeel needs a Battle with on/offOwner');
  }
  const manifest = opts?.manifest;
  const modules = opts?.modules ?? [];
  const host = createStrongholdHost(battle, { drive: false, playerId: opts?.playerId });
  const runtime = createKeelRuntime({ manifest, modules, host, seed: opts?.seed ?? battle.seed, budget: opts?.budget });
  const owner = `keel:${manifest.id}`;

  const handlers = {
    battleStart: () => ({ hook: 'sim.battleStart', view: {}, write: null }),
    tick: (ctx) => ({ hook: 'sim.tick', view: { dt: Number(ctx?.dt ?? 1 / 30) }, write: null }),
    deploy: (ctx) => ({ hook: 'sim.deploy', view: { unit: unitView(ctx?.unit), initial: !!ctx?.initial, move: !!ctx?.move }, write: null }),
    beforeAttack: (ctx) => {
      const view = {
        attacker: unitView(ctx?.attacker),
        targets: (ctx?.targets ?? []).map(unitView).filter(Boolean),
        isSkill: !!ctx?.isSkill,
        profile: clone(ctx?.profile),
      };
      return {
        hook: 'sim.beforeAttack', view,
        write: () => {
          if (!Array.isArray(ctx?.targets) || !Array.isArray(view.targets)) return;
          const next = view.targets.map((v) => findUnit(battle, v.id)).filter(Boolean);
          if (next.length !== ctx.targets.length || next.some((u, i) => u !== ctx.targets[i])) ctx.targets = next;
        },
      };
    },
    hit: (ctx) => {
      const view = { source: unitView(ctx?.source), target: unitView(ctx?.target), dmg: clone(ctx?.dmg) };
      return {
        hook: 'sim.hit', view,
        write: () => {
          if (!ctx?.dmg || !view.dmg || typeof view.dmg !== 'object') return;
          for (const key of ['amount', 'type', 'mul', 'tags', 'cancel', 'isSkill', 'isAttack', 'sourceless']) {
            if (Object.hasOwn(view.dmg, key)) ctx.dmg[key] = view.dmg[key];
          }
        },
      };
    },
    damaged: (ctx) => {
      const view = { source: unitView(ctx?.source), target: unitView(ctx?.target), amount: Number(ctx?.amount ?? 0), type: ctx?.type ?? null, dmg: clone(ctx?.dmg), credit: unitView(ctx?.credit) };
      return {
        hook: 'sim.damaged', view,
        write: () => {
          if (Number.isFinite(view.amount)) ctx.amount = Math.min(Number(ctx.amount ?? 0), view.amount);
        },
      };
    },
    heal: (ctx) => {
      const view = { source: unitView(ctx?.source), target: unitView(ctx?.target), amount: Number(ctx?.amount ?? 0), opts: clone(ctx?.opts) };
      return { hook: 'sim.heal', view, write: () => { if (Number.isFinite(view.amount)) ctx.amount = view.amount; } };
    },
    kill: (ctx) => ({ hook: 'sim.kill', view: { killer: unitView(ctx?.killer), victim: unitView(ctx?.victim) }, write: null }),
    death: (ctx) => ({ hook: 'sim.death', view: { unit: unitView(ctx?.unit), reason: ctx?.reason ?? null, killer: unitView(ctx?.killer), dying: !!ctx?.dying, revivedBy: ctx?.revivedBy ?? null }, write: null }),
    enemySpawn: (ctx) => ({ hook: 'sim.enemySpawn', view: { enemy: unitView(ctx?.enemy) }, write: null }),
    enemyLeak: (ctx) => ({ hook: 'sim.enemyLeak', view: { enemy: unitView(ctx?.enemy) }, write: null }),
    blocked: (ctx) => ({ hook: 'sim.blocked', view: { blocker: unitView(ctx?.blocker), enemy: unitView(ctx?.enemy) }, write: null }),
    battleEnd: (ctx) => ({ hook: 'sim.battleEnd', view: { result: clone(ctx?.result) }, write: null }),
  };

  for (const [event, map] of Object.entries(handlers)) {
    battle.on(event, (ctx) => {
      const { hook, view, write } = map(ctx);
      runtime.runHook(hook, view);
      if (write) write();
    }, { owner });
  }

  runtime.start({ battleStart: false });
  return {
    runtime,
    host,
    owner,
    snapshot: () => runtime.snapshot(),
    detach: () => battle.offOwner(owner),
  };
}

/** Keel is the only plugin runtime; the descriptor's presence is the switch. */
export const keelEnabled = () => true;
