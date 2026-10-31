// test/keel/stronghold-host.test.js — the real-Battle host and the hook bridge, on a small Battle double.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStrongholdHost } from '../../server/keel/stronghold-host.js';
import { attachKeel, BATTLE_HOOKS } from '../../server/keel/attach.js';

class StubBattle {
  constructor() {
    this.time = 0;
    this.seed = 7;
    this.units = [];
    this.players = [{ playerId: 1, bonds: { bond_x_demo: { layers: 1, active: true, tier: 1, count: 3 } } }];
    this._hooks = {};
    this._id = 0;
  }
  getPlayer(pid) { return this.players.find((p) => p.playerId === pid) ?? null; }
  addLayers(pid, bondId, n) {
    const b = this.getPlayer(pid)?.bonds?.[bondId];
    if (!b || !(n > 0)) return 0;
    const added = Math.min(n, Math.max(0, 999 - b.layers));
    b.layers += added;
    return added;
  }
  on(name, fn, opts = {}) { (this._hooks[name] ??= []).push({ fn, owner: opts.owner }); return { name, fn }; }
  offOwner(owner) { for (const k of Object.keys(this._hooks)) this._hooks[k] = this._hooks[k].filter((h) => h.owner !== owner); }
  emit(name, ctx) { for (const h of this._hooks[name] ?? []) h.fn(ctx, this); }
  makeDamage(d) { return { ...d }; }
  dealDamage(source, target, dmg) {
    this.emit('hit', { source, target, dmg });
    target.hp = Math.max(0, target.hp - dmg.amount);
    if (target.hp === 0) { target.alive = false; this.emit('kill', { killer: source, victim: target }); }
    this.emit('damaged', { source, target, amount: dmg.amount, type: dmg.type, dmg });
    return dmg.amount;
  }
  heal(source, target, amount) {
    this.emit('heal', { source, target, amount });
    target.hp = Math.min(target.maxHp, target.hp + amount);
    return amount;
  }
  addBuff(unit, b) { const buff = { ...b, timeLeft: b.duration }; unit.buffs.push(buff); return buff; }
  removeBuff(unit, key) { const before = unit.buffs.length; unit.buffs = unit.buffs.filter((b) => b.key !== key); return before - unit.buffs.length; }
  spawnEnemy(key, opts = {}) {
    const u = {
      id: ++this._id, side: 'enemy', kind: 'enemy', x: opts.pos?.[1] ?? 0, y: opts.pos?.[0] ?? 0,
      hp: 100, maxHp: 100, alive: true, deployed: true, buffs: [], base: { atk: 10, def: 0, res: 0 },
    };
    this.units.push(u);
    return u;
  }
  fx() {}
  step() { this.time += 1 / 30; this.emit('tick', { dt: 1 / 30 }); }
  start() { this.emit('battleStart', {}); }
}

const manifest = (permissions = ['sim.read', 'sim.damage.write']) => ({
  manifest: 3,
  id: 'demo',
  name: 'Demo',
  version: '1.0.0',
  app: '*',
  api: { sim: 1 },
  scope: ['room'],
  trust: 'sandbox',
  modules: [{ kind: 'sim', entry: 'sim/index.js', permissions }],
  state: { version: 1 },
});

test('the Stronghold host reads units through views and writes through engine methods', () => {
  const b = new StubBattle();
  const enemy = b.spawnEnemy('target', { pos: [1, 2] });
  const host = createStrongholdHost(b, { drive: false });
  const [u] = host.units({ side: 'enemy', alive: true });
  assert.deepEqual([u.id, u.side, u.x, u.y, u.alive], [enemy.id, 'enemy', 2, 1, true]);
  assert.equal(host.damage({ target: enemy.id, amount: 30, type: 'true' }).hp, 70);
  assert.equal(host.heal({ target: enemy.id, amount: 10 }).hp, 80);
  assert.equal(host.buffs.apply({ target: enemy.id, buff: 'mark', duration: 5 }).ok, true);
  assert.equal(host.buffs.has(enemy.id, 'mark'), true);
  assert.deepEqual(host.buffs.list(enemy.id).map((x) => x.buff), ['mark']);
  assert.equal(host.buffs.remove(enemy.id, 'mark'), 1);
  const spawned = host.spawn({ enemyKey: 'other', x: 3, y: 4 });
  assert.equal(spawned.ok, true);
  assert.equal(host.units({ id: spawned.id })[0].x, 3);
  assert.deepEqual([host.rng('a').next(), host.rng('a').next()], [host.rng('a').next(), host.rng('a').next()]);
});

test('attach runs a Keel module on the battle hook bus', () => {
  const b = new StubBattle();
  const enemy = b.spawnEnemy('target', { pos: [0, 0] });
  const code = {
    hooks: {
      'sim.tick'(_ctx, api) {
        const s = api.state.get();
        api.state.patch({ ticks: (s.ticks ?? 0) + 1 });
        api.damage({ target: enemy.id, amount: 10 });
      },
    },
  };
  const handle = attachKeel(b, { manifest: manifest(), modules: [{ kind: 'sim', entry: 'sim/index.js', permissions: ['sim.read', 'sim.damage.write'], code }] });
  b.start();
  b.step();
  b.step();
  assert.equal(enemy.hp, 80);
  assert.equal(handle.runtime.snapshot().state['demo:sim:sim/index.js'].value.ticks, 2);
  assert.equal(handle.runtime.errors.length, 0);
  handle.detach();
  b.step();
  assert.equal(enemy.hp, 80);
});

test('a sim.hit module can change the damage before the engine applies it', () => {
  const b = new StubBattle();
  const enemy = b.spawnEnemy('target', { pos: [0, 0] });
  const code = {
    hooks: {
      'sim.hit'(ctx) { ctx.dmg.amount *= 0.5; },
    },
  };
  attachKeel(b, { manifest: manifest(['sim.read', 'sim.damage.write']), modules: [{ kind: 'sim', entry: 'sim/index.js', permissions: ['sim.read', 'sim.damage.write'], code }] });
  b.start();
  b.dealDamage(null, enemy, b.makeDamage({ amount: 20, type: 'true' }));
  assert.equal(enemy.hp, 90);
});

test('the bridge maps the documented Battle events', () => {
  assert.equal(BATTLE_HOOKS.hit, 'sim.hit');
  assert.equal(BATTLE_HOOKS.battleEnd, 'sim.battleEnd');
  assert.equal(BATTLE_HOOKS.tick, 'sim.tick');
});

test('the host reads live bond state and adds layers through the battle', () => {
  const b = new StubBattle();
  const host = createStrongholdHost(b, { drive: false });
  assert.equal(host.bonds.get('bond_x_demo').layers, 1);
  assert.equal(host.bonds.addLayers('bond_x_demo', 2).layers, 3);
  assert.equal(host.bonds.get('bond_x_demo').layers, 3);
  assert.deepEqual(host.bonds.list().map((x) => x.id), ['bond_x_demo']);
  assert.equal(host.bonds.get('missing'), null);
});
