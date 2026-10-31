// 资料库 / CODEX (public/js/ui/codex.js + codexModel.js): the pure data mapping behind the 盟约 / 策略 / 干员 browses, the
// 悬赏决策 card pools, the two leader phases (最终攻势 / 隐秘核心) and the enemy / item detail views, plus the overlay
// store and the settings / lobby / main / index wiring.
//
// The mapping is derived from the real generated data (bonds.json / bands.json / items.json / chess.json / garrisons.json /
// bosses.json / enemies.json / choices.json / config.json / assets.json) read here with readFileSync — no hardcoded
// lists. The 悬赏 finding pinned here: the two phases are FINAL_ASSAULT (config `bossWeights`) and HIDDEN_CORE
// (`hiddenBossWeights`), and the mapping is DATA (config modes + bosses.json `hidden`); the 悬赏决策 drafts are separate.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  bondKind, bondScope, bondStages, bondMilestones, bondEquipment, bondMembers, chessCarryingBond, baseChessId,
  bondMatches, filterBonds, bondView,
  bandView, bandBondIds, bandBuffKeys, filterBands, bandsForBonds, itemsForBonds,
  chessRoster, chessRosterFacets, chessIsCustom, chessMatches, filterChess, chessView, skillIconUrl,
  itemView,
  enemyStats, enemyView, enemySources, bossPhasePools, bossPoolModes, bountyDraftPools, bossEscorts,
} from '../../public/js/ui/codexModel.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const load = (f) => JSON.parse(readFileSync(join(ROOT, 'data', `${f}.json`), 'utf8'));
const src = (p) => readFileSync(join(ROOT, p), 'utf8');

const bonds = Object.values(load('bonds'));
const bands = Object.values(load('bands'));
const items = Object.values(load('items'));
const chess = Object.values(load('chess'));
const garrisons = Object.values(load('garrisons'));
const bosses = Object.values(load('bosses'));
const enemies = load('enemies');
const choices = load('choices');
const config = load('config');
const assets = load('assets');
const getEnemy = (k) => enemies[k] || null;
const byBond = new Map(bonds.map((b) => [b.bondId, b]));
const byBand = new Map(bands.map((b) => [b.bandId, b]));
const byChess = new Map(chess.map((c) => [c.chessId, c]));

const baseSet = (list) => new Set(list.map((c) => baseChessId(c.chessId || c.id)));

describe('盟约 (bonds) mapping', () => {
  test('every bond is exactly core or addon; the two partition the roster', () => {
    const core = bonds.filter((b) => bondKind(b) === 'core');
    const addon = bonds.filter((b) => bondKind(b) === 'addon');
    assert.equal(core.length + addon.length, bonds.length);
    assert.ok(core.length > 0 && addon.length > 0);
    assert.ok(core.every((b) => b.isCore === true));
    assert.ok(addon.every((b) => !b.isCore));
  });

  test('scope is battle or alltime; ALL (`activeType`) is 全程生效, everything else 战斗中生效', () => {
    for (const b of bonds) {
      const want = String(b.activeType).toUpperCase() === 'ALL' ? 'alltime' : 'battle';
      assert.equal(bondScope(b), want, b.bondId);
    }
    assert.ok(bonds.some((b) => bondScope(b) === 'alltime') && bonds.some((b) => bondScope(b) === 'battle'));
  });

  test('a stage per threshold, with the spec need/effect when the bond carries a spec', () => {
    const yan = byBond.get('yanShip');
    const stages = bondStages(yan);
    assert.deepEqual(stages.map((s) => s.threshold), yan.thresholds);
    assert.deepEqual(stages.map((s) => s.index), [1, 2, 3]);
    assert.ok(stages.every((s) => s.effect.length > 0), 'the spec gives each stage an effect');
    assert.ok(stages.every((s) => s.maxCount === null), 'null maxCount is not read as 0');
    // a bond without a spec still lists its thresholds (the official text is in descRaw)
    const noSpec = bonds.find((b) => !b.spec || !b.spec.tiers);
    if (noSpec) assert.equal(bondStages(noSpec).length, (noSpec.thresholds || []).length);
  });

  test('layer milestones map to layer/mode/effect rows', () => {
    const vic = byBond.get('victoriaShip');
    const ms = bondMilestones(vic);
    assert.ok(ms.length >= 1);
    assert.ok(ms.every((m) => m.layer > 0 && m.mode));
  });

  test('equipment: grants are items with giveBondId, requires with requiresBondId (one row per family, no 变形同构体)', () => {
    for (const bondId of ['victoriaShip', 'lateranoShip', 'yanShip']) {
      const eq = bondEquipment(items, bondId);
      assert.ok(eq.grants.length > 0, `${bondId} has granting equipment`);
      assert.ok(eq.grants.every((x) => x.item.giveBondId === bondId && !x.item.canGiveBond));
      assert.ok(eq.requires.every((x) => !x.item.canGiveBond && x.item.requiresBondId === bondId));
      const fams = eq.grants.map((x) => x.family);
      assert.equal(new Set(fams).size, fams.length, 'one row per item family');
    }
  });

  test('members: bond.members and chess.json `bonds` carry the same operators (base-deduped, visible roster)', () => {
    for (const b of bonds) {
      const fromBond = baseSet(bondMembers(b, chess));
      // the 9 custom shop operators are hidden in vanilla (their built-in 阵营加强 plugin adds them back), so compare
      // against every non-custom record (hidden official chess stay listed, as before)
      const fromChess = baseSet(chessCarryingBond(chess.filter((c) => !chessIsCustom(c)), b.bondId));
      assert.deepEqual([...fromBond].sort(), [...fromChess].sort(), b.bondId);
    }
  });

  test('bondView resolves the per-layer effect text (基础 ≠ a stacked layer)', () => {
    const yan = byBond.get('yanShip');
    const v0 = bondView(yan, { items, chess, layers: 0 });
    const v10 = bondView(yan, { items, chess, layers: 10 });
    assert.notEqual(v0.effectAt, v10.effectAt, 'the layer-scaled number changes with the layer count');
    assert.ok(v0.effectAt.includes('23%'), 'base_atk 0.23 at 0 layers');
    assert.ok(v10.effectAt.includes('32%'), '0.23 + 0.009*10 at 10 layers');
    assert.equal(v0.effectBase, v0.effectAt);
    assert.ok(v0.members.length > 0 && v0.desc.length > 0);
  });
});

describe('盟约 filter / search', () => {
  test('kind and scope filters are subsets that partition the roster', () => {
    const core = filterBonds(bonds, { kind: 'core' });
    const addon = filterBonds(bonds, { kind: 'addon' });
    assert.equal(core.length + addon.length, bonds.length);
    const battle = filterBonds(bonds, { scope: 'battle' });
    const alltime = filterBonds(bonds, { scope: 'alltime' });
    assert.equal(battle.length + alltime.length, bonds.length);
    assert.equal(filterBonds(bonds, {}).length, bonds.length);
  });

  test('search matches name, effect text and member names', () => {
    assert.ok(bondMatches(byBond.get('yanShip'), '炎'));
    assert.ok(bondMatches(byBond.get('yanShip'), 'yanShip'));
    const yan = byBond.get('yanShip');
    const memberName = chess.find((c) => c.chessId === yan.members[0]).name;
    const membersOf = (id) => chess.filter((c) => (c.bonds || []).includes(id)).map((c) => c.name);
    const found = filterBonds(bonds, { query: memberName, membersOf });
    assert.ok(found.some((b) => b.bondId === 'yanShip'), `searching 「${memberName}」 finds 炎`);
    assert.deepEqual(filterBonds(bonds, { query: 'zzz-no-such-bond' }), []);
  });
});

describe('策略 (bands) mapping', () => {
  test('bandView exposes effect, hp, modes and the related bonds / handler keys', () => {
    const v = bandView(byBand.get('band_pith'));
    assert.equal(v.bandId, 'band_pith');
    assert.ok(v.name && v.effect.length > 0);
    assert.ok(v.hp > 0);
    assert.ok(v.modes.includes('SINGLE') || v.modes.includes('MULTI'));
    assert.deepEqual(v.bondIds, bandBondIds(byBand.get('band_pith')));
    assert.ok(Array.isArray(v.buffKeys));
  });

  test('every band that names bonds has them in bonds.json (no dangling relation)', () => {
    for (const b of bands) {
      for (const id of bandBondIds(b)) assert.ok(byBond.has(id), `${b.bandId} → ${id}`);
    }
  });

  test('filterBands filters by mode type and searches the effect / related bonds', () => {
    const multi = filterBands(bands, { modeType: 'MULTI' });
    assert.ok(multi.length > 0 && multi.length <= bands.length);
    assert.ok(multi.every((b) => !b.modeTypeList || !b.modeTypeList.length || b.modeTypeList.includes('MULTI')));
    for (const b of bands) {
      if (Array.isArray(b.modeTypeList) && b.modeTypeList.length && !b.modeTypeList.includes('MULTI')) assert.ok(!multi.includes(b));
    }
    const names = (bandId) => bandBondIds(byBand.get(bandId)).map((id) => byBond.get(id)?.name || id);
    const found = filterBands(bands, { query: '维多利亚', bondNamesOf: names });
    assert.ok(found.some((b) => b.bandId === 'band_harold'));
  });

  test('buff handler keys are read from bands.json (server/sim/content/bands/** keys)', () => {
    const bldsk = byBand.get('band_bldsk');
    assert.deepEqual(bandBuffKeys(bldsk), bldsk.buffs.map((x) => x.key));
  });
});

describe('悬赏敌人池 (bounty / leader pools)', () => {
  test('the two phases are FINAL_ASSAULT then HIDDEN_CORE, pools from config modes', () => {
    const phases = bossPhasePools(config, bosses, getEnemy, 'mode_multi_normal');
    assert.deepEqual(phases.map((p) => p.phase), ['FINAL_ASSAULT', 'HIDDEN_CORE']);
    const mode = config.modes.mode_multi_normal;
    assert.deepEqual(phases[0].pool.map((p) => p.bossId), Object.keys(mode.bossWeights));
    assert.deepEqual(phases[1].pool.map((p) => p.bossId), Object.keys(mode.hiddenBossWeights));
    assert.equal(phases[0].round, mode.bossRound);
    assert.equal(phases[1].round, mode.hiddenRound);
    assert.ok(phases[0].pool.length > 0 && phases[1].pool.length > 0);
  });

  test('a pool entry carries its weight, enemy (stats/name), wave template and escorts, and matches bosses.json `hidden`', () => {
    const phases = bossPhasePools(config, bosses, getEnemy, 'mode_multi_normal');
    for (const ph of phases) {
      for (const x of ph.pool) {
        assert.equal(x.boss.hidden, ph.hidden, `${x.bossId} hidden flag matches its phase`);
        assert.ok(x.weight > 0);
        assert.ok(x.enemy && x.enemy.name, `${x.bossId} enemy resolved`);
        assert.equal(x.enemy.key, x.boss.enemyKey);
        assert.ok(Array.isArray(x.escorts) && x.escorts.length > 0, `${x.bossId} has escorts`);
        assert.ok(x.escorts.every((e) => e.enemy && e.enemy.key === e.key));
        const st = enemyStats(x.enemy);
        assert.ok(st.maxHp > 0 && Number.isFinite(st.atk));
      }
    }
  });

  test('a mode without a hidden round has an empty HIDDEN_CORE pool (honest, not invented)', () => {
    const phases = bossPhasePools(config, bosses, getEnemy, 'mode_multi_funny');
    assert.equal(phases[1].pool.length, 0);
    assert.equal(config.modes.mode_multi_funny.hiddenRound, null);
  });

  test('bossPoolModes lists every mode with a boss pool, in config order', () => {
    const modes = bossPoolModes(config);
    const want = Object.entries(config.modes).filter(([, m]) => m.bossWeights && Object.keys(m.bossWeights).length).map(([id]) => id);
    assert.deepEqual(modes.map((m) => m.modeId), want);
    assert.ok(modes.length > 1);
  });

  test('bossEscorts merges the templates and sums each escort’s count', () => {
    const rows = bossEscorts(byBondId('boss_1'));
    const total = rows.reduce((n, r) => n + r.count, 0);
    const raw = Object.values(byBondId('boss_1').escortsByTemplate).reduce((n, list) => n + list.reduce((m, e) => m + (e.count || 0), 0), 0);
    assert.equal(total, raw);
    assert.ok(rows.every((r) => r.key && r.count > 0 && Array.isArray(r.slots)));
  });

  function byBondId(id) { return bosses.find((b) => b.bossId === id); }
});

describe('悬赏决策 card draft pools', () => {
  test('the three kinds (initial / boss / hunter) list their draft cards and enemies', () => {
    const pools = bountyDraftPools(choices);
    assert.deepEqual(pools.map((p) => p.kind), ['initial', 'boss', 'hunter']);
    const draft = choices.cards.bounty.filter((c) => c.draft === true);
    for (const p of pools) {
      const want = draft.filter((c) => c.draftPool === p.kind);
      assert.equal(p.cards.length, want.length, `${p.kind} card count`);
      assert.ok(p.cards.every((c) => c.enemyKey));
      assert.ok(p.enemies.length > 0 && p.enemies.every((e) => e.count > 0));
      assert.ok(p.groups > 0 && p.count > 0);
    }
  });

  test('every draft card names an enemy of enemies.json', () => {
    for (const p of bountyDraftPools(choices)) {
      for (const c of p.cards) assert.ok(enemies[c.enemyKey], `${c.effectId} → ${c.enemyKey}`);
    }
  });
});

describe('干员 (operators) mapping', () => {
  test('chessRoster is the visible base roster (no golden, no hidden, no 甄选)', () => {
    const roster = chessRoster(chess);
    assert.ok(roster.length > 0);
    assert.ok(roster.every((c) => c.visible && !c.isGolden && !c.isDiy && !c.isHidden));
    assert.equal(new Set(roster.map((c) => c.chessId)).size, roster.length, 'no duplicate operator');
    // the 9 custom shop operators are a built-in 阵营加强 plugin: hidden in vanilla, so not in the roster until a room
    // turns their faction on (the data records still exist for the official 自选 picks)
    assert.equal(roster.filter((c) => chessIsCustom(c)).length, 0);
    const tiers = roster.map((c) => c.tier);
    assert.deepEqual(tiers, [...tiers].sort((a, b) => a - b), 'sorted by tier');
  });

  test('facets: rarities desc, tiers asc, professions with counts (data-driven filter options)', () => {
    const f = chessRosterFacets(chess);
    assert.deepEqual(f.rarities, [...f.rarities].sort((a, b) => b - a));
    assert.deepEqual(f.tiers, [...f.tiers].sort((a, b) => a - b));
    assert.ok(f.professions.length >= 6 && f.professions.every((p) => p.id && p.count > 0));
    const total = f.professions.reduce((n, p) => n + p.count, 0);
    assert.equal(total, chessRoster(chess).filter((c) => c.profession).length);
  });

  test('filterChess: rarity / tier / profession / custom / bondId are subsets; the query is case-insensitive', () => {
    const all = chessRoster(chess);
    const six = filterChess(chess, { rarity: 6 });
    assert.ok(six.length > 0 && six.length < all.length && six.every((c) => c.rarity === 6));
    const t3 = filterChess(chess, { tier: 3 });
    assert.ok(t3.length > 0 && t3.every((c) => c.tier === 3));
    const prof = chessRosterFacets(chess).professions[0].id;
    assert.ok(filterChess(chess, { profession: prof }).every((c) => c.profession === prof));
    // the 9 custom shop operators are hidden in vanilla (built-in 阵营加强 plugins), so no operator is "custom" yet
    assert.equal(filterChess(chess, { custom: true }).length, 0);
    assert.equal(filterChess(chess, { custom: false }).length, all.length);
    const bondId = 'lateranoShip';
    assert.ok(filterChess(chess, { bondId }).every((c) => (c.bonds || []).includes(bondId)));
    assert.ok(chessMatches(byChess.get('chess_char_4132_ascln_a'), 'ascalon'), 'an English appellation matches');
    assert.deepEqual(filterChess(chess, { query: '阿斯卡纶' }), [], 'a hidden custom operator is not in the roster');
    assert.ok(filterChess(chess, { query: '隐现' }).some((c) => c.chessId === 'chess_char_1_01_a'));
    assert.deepEqual(filterChess(chess, { query: 'zzz-no-such-operator' }), []);
  });

  test('chessView carries the detail fields (rarity / branch / bonds / talents / skills / stats) and the cross-links', () => {
    const c = byChess.get('chess_char_4132_ascln_a');
    const v = chessView(c, { bonds, bands, garrisons, items, assets });
    assert.equal(v.name, '阿斯卡纶');
    assert.equal(v.appellation, 'Ascalon');
    assert.equal(v.rarity, 6);
    assert.equal(v.subProfessionName, '伏击客');
    assert.equal(v.custom, true);
    assert.deepEqual(v.bonds.map((b) => b.name), ['灵巧', '助力']);
    assert.ok(v.stats.maxHp > 0 && v.stats.cost > 0);
    assert.ok(v.talents.length >= 1 && v.talents.every((t) => t.name && t.desc));
    assert.equal(v.skills.length, c.skills.length);
    assert.ok(v.skills.every((s) => s.name && s.iconUrl), 'every skill has its assets.json icon');
    assert.ok(v.garrisons.length >= 1, 'the garrison / 特质 record resolves');
    // cross-links: bonds → strategies, and the equipment granting / requiring a bond
    const bondIds = v.bondIds;
    assert.equal(bandsForBonds(bands, bondIds).length, v.bands.length);
    assert.ok(v.equipment.every((x) => x.id && (x.relation === 'grant' || x.relation === 'require')));
  });

  test('skillIconUrl reads assets.json skills by iconId (and skillsById when only a skillId is given)', () => {
    const c = byChess.get('chess_char_4132_ascln_a');
    const sk = c.skills[0];
    assert.equal(skillIconUrl(assets, sk), `/assets/skill/${sk.iconId}.png`);
    assert.equal(skillIconUrl(assets, { skillId: sk.skillId }), `/assets/skill/${sk.iconId}.png`);
    assert.equal(skillIconUrl(null, sk), null);
  });

  test('bandsForBonds / itemsForBonds: only the strategies on those bonds, and the items granting / requiring them', () => {
    const found = bandsForBonds(bands, ['victoriaShip']);
    assert.ok(found.length > 0 && found.every((b) => bandBondIds(b).includes('victoriaShip')));
    const eq = itemsForBonds(items, ['victoriaShip']);
    assert.ok(eq.length > 0);
    assert.ok(eq.every((x) => x.item.giveBondId === 'victoriaShip' || x.item.requiresBondId === 'victoriaShip'));
    assert.deepEqual(itemsForBonds(items, ['no-such-bond']), []);
  });
});

describe('装备 (items) view', () => {
  test('itemView exposes the detail fields a related-equipment link opens', () => {
    const it = items.find((x) => x.giveBondId === 'victoriaShip' && !x.canGiveBond);
    const v = itemView(it);
    assert.equal(v.id, it.id);
    assert.equal(v.name, it.name);
    assert.ok(v.tier > 0 && v.itemType);
    assert.equal(v.giveBondId, 'victoriaShip');
    assert.ok(v.desc.length > 0);
    assert.ok(Array.isArray(v.buffKeys));
  });
});

describe('敌人详情 (enemy detail) mapping', () => {
  test('enemyView normalizes name / key / rank / stats / description / abilities', () => {
    const v = enemyView(enemies.enemy_9013_acstmk, 'enemy_9013_acstmk');
    assert.equal(v.key, 'enemy_9013_acstmk');
    assert.equal(v.name, enemies.enemy_9013_acstmk.name);
    assert.equal(v.rank, 'BOSS');
    assert.ok(v.stats.maxHp > 0 && Number.isFinite(v.stats.atk));
    assert.ok(v.abilities.length > 0, 'the leader enemy lists its abilities');
    assert.ok(v.desc.length > 0);
  });

  test('enemySources: the leader pool, its weight, its escorts and the boss record it belongs to', () => {
    const src1 = enemySources('enemy_9013_acstmk', { config, bosses, choices });
    const final = src1.pools.filter((p) => p.phase === 'FINAL_ASSAULT');
    assert.ok(final.length > 0 && final.every((p) => p.bossId === 'boss_1' && p.weight > 0 && !p.hidden));
    assert.ok(src1.references.some((r) => r.bossId === 'boss_1' && r.abilities.length > 0));
    // the hidden core's own leader enemy and its parts
    const hidden = enemySources('enemy_9013_acstmk_2', { config, bosses, choices });
    assert.ok(hidden.pools.some((p) => p.phase === 'HIDDEN_CORE' && p.bossId === 'boss_8'));
    const boss8 = hidden.references.find((r) => r.bossId === 'boss_8');
    assert.ok(boss8 && boss8.hidden && boss8.parts.length > 0, 'boss_8 fields its parts');
  });

  test('enemySources: an escort and a 悬赏决策 card enemy are found from the same mapping', () => {
    const boss = bosses.find((b) => b.bossId === 'boss_1');
    const escortKey = Object.values(boss.escortsByTemplate)[0][0].key;
    const es = enemySources(escortKey, { config, bosses, choices });
    assert.ok(es.escorts.some((e) => e.bossId === 'boss_1') && es.escorts.every((e) => e.count > 0 && e.modes.length > 0));
    const draftCard = choices.cards.bounty.find((c) => c.draft === true && c.enemyKey);
    const ds = enemySources(draftCard.enemyKey, { config, bosses, choices });
    assert.ok(ds.drafts.length > 0);
  });
});

describe('CODEX overlay store + wiring', () => {
  test('openCodex / closeCodex drive the global store (loaded without a page)', async () => {
    const realFetch = globalThis.fetch;
    const realWarn = console.warn;
    // A definite 404 for every data request: no retry, no timeout — the load settles at once (no net in tests).
    globalThis.fetch = () => Promise.resolve({ ok: false, status: 404 });
    console.warn = () => {};
    try {
      const { codexStore, openCodex, closeCodex, openEnemy, openItem, closePop, CODEX_FILES, TABS } = await import('../../public/js/ui/codex.js');
      assert.ok(CODEX_FILES.includes('bonds') && CODEX_FILES.includes('bosses') && CODEX_FILES.includes('choices') && CODEX_FILES.includes('garrisons'));
      assert.deepEqual(TABS.map((x) => x.id), ['bonds', 'bands', 'operators', 'bounty', 'final', 'hidden'], 'the split tab layout');
      closeCodex();
      assert.equal(codexStore.get().open, false);
      openCodex('bounty');
      assert.equal(codexStore.get().open, true);
      assert.equal(codexStore.get().tab, 'bounty');
      openEnemy('enemy_1');
      assert.deepEqual(codexStore.get().pop, { kind: 'enemy', id: 'enemy_1' });
      openItem('chess_item_1_01_e_a');
      assert.deepEqual(codexStore.get().pop, { kind: 'item', id: 'chess_item_1_01_e_a' });
      closePop();
      assert.equal(codexStore.get().pop, null);
      closeCodex();
      assert.equal(codexStore.get().open, false);
    } finally {
      globalThis.fetch = realFetch;
      console.warn = realWarn;
    }
  });

  test('the 设置 dialog no longer offers 资料库 (set-codex); the codex is reached from the lobby and mounted globally', () => {
    const settings = src('public/js/ui/settings.js');
    assert.ok(!settings.includes('class="set-codex"') && !settings.includes('openCodex') && !settings.includes("t('资料库')"), 'the 资料库 settings action was removed (2026-10-12)');
    const main = src('public/js/main.js');
    assert.ok(main.includes("from './ui/codex.js'") && main.includes('<${CodexHost} />'), 'main.js mounts CodexHost');
    assert.ok(main.indexOf('<${CodexHost} />') > main.indexOf('<${GuideHost} />'), 'codex stacks with the guide');
  });

  test('the lobby top bar offers 资料库 without opening 设置, and the account chip carries 统计', () => {
    const lobby = src('public/js/screens/lobby.js');
    assert.ok(lobby.includes("from '../ui/codex.js'"), 'lobby imports openCodex');
    assert.ok(lobby.includes('class="codex-entry"') && lobby.includes("openCodex('bonds')"), 'the 资料库 entry opens the codex');
    assert.ok(lobby.includes("t('资料库')"), 'the entry is labelled 资料库');
    assert.ok(!lobby.includes('stats-entry'), 'the standalone 统计 button was removed (2026-10-15)');
    assert.ok(lobby.includes('class="me-chip me-chip--btn"') && lobby.includes('onClick=${openStats}'),
      'the account chip is the 统计数据 entry (components.css `.me-chip--btn` styles it)');
    assert.ok(lobby.indexOf('class="codex-entry"') < lobby.indexOf('class="me-chip me-chip--btn"'), 'the chip sits right of 资料库');
  });

  test('bounty decisions and the two leader phases are separate tabs / panes', () => {
    const codex = src('public/js/ui/codex.js');
    assert.ok(codex.includes('function BountyTab(') && codex.includes('function PhaseView('), 'the draft cards and the leader phases have their own views');
    assert.ok(codex.includes('phaseKey="FINAL_ASSAULT"') && codex.includes('phaseKey="HIDDEN_CORE"'), 'each leader phase is its own tab');
    assert.ok(codex.includes("id: 'bounty'") && codex.includes("id: 'final'") && codex.includes("id: 'hidden'"));
  });

  test('index.html links the overlay stylesheet and the overlay re-links it at runtime', () => {
    assert.ok(src('public/index.html').includes('/css/screens/codex.css'), 'index.html links codex.css');
    assert.ok(src('public/js/ui/codex.js').includes("ensureStylesheet(CX_CSS)"), 'codex.js survives a stale index.html');
  });

  test('every new msgid is translated in all four language packs', () => {
    const MSGIDS = [
      '资料库', '悬赏敌人池', '战斗中生效', '全程生效', '激活阈值', '相关装备', '已收录 {n}', '本阶段无该池数据', '本地模拟',
      '干员', '敌人详情', '装备详情', '稀有度', '阶数', '仅自造', '出现于', '领袖权重 {n}', '最终攻势', '隐秘核心', '未找到匹配的干员',
    ];
    for (const lang of ['en', 'ja', 'ko', 'zh-TW']) {
      const pack = JSON.parse(readFileSync(join(ROOT, 'public', 'i18n', `${lang}.json`), 'utf8'));
      for (const id of MSGIDS) assert.ok(id in pack, `${lang} is missing ${id}`);
    }
  });
});
