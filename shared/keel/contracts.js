// shared/keel/contracts.js — the frozen Keel extension points (docs/keel/CONTRACTS.md).
// (i18n-ignore-file: this is the contract table itself — the readable/writable/budget columns are author-facing
// documentation, not player UI; docs/keel/CONTRACTS.md is the bilingual-adjacent reference and the CLI prints it.)
//
// M0 freezes 24 stable points; the experimental ones are named but carry no compatibility promise yet. The runtime
// (M1) will check these tables against the generated SDK surface.

/** @typedef {'stable' | 'experimental'} KeelStability */
/** @typedef {{ id: string, domain: string, point: string, readable: string, writable: string, capability: string, budget: string, stability: KeelStability }} KeelPoint */

/** The 24 stable extension points. IDs are the contract; do not renumber. */
export const KEEL_STABLE_POINTS = Object.freeze([
  { id: 'C1', domain: 'content', point: 'content.define', readable: '内容图', writable: '新增资源', capability: 'content.define', budget: '构建期 ≤ 200ms/插件', stability: 'stable' },
  { id: 'C2', domain: 'content', point: 'content.extend', readable: '目标资源', writable: '追加/合并', capability: 'content.extend', budget: '构建期', stability: 'stable' },
  { id: 'C3', domain: 'content', point: 'content.patch', readable: '字段路径', writable: '改标量', capability: 'content.patch', budget: '构建期', stability: 'stable' },
  { id: 'C4', domain: 'content', point: 'content.override', readable: '目标资源', writable: '整体替换', capability: 'content.override', budget: '构建期，需审计', stability: 'stable' },

  { id: 'S1', domain: 'sim', point: 'sim.setup', readable: '关卡/编队/种子', writable: '注册 buff/效果', capability: 'sim.read', budget: '1ms/局', stability: 'stable' },
  { id: 'S2', domain: 'sim', point: 'sim.battleStart', readable: '全场', writable: '初始单位/装置', capability: 'sim.spawn', budget: '0.5ms/局', stability: 'stable' },
  { id: 'S3', domain: 'sim', point: 'sim.deploy', readable: '单位/初始/再部署', writable: '初始属性/一次性 buff', capability: 'sim.buff.write', budget: '0.2ms/次', stability: 'stable' },
  { id: 'S4', domain: 'sim', point: 'sim.tick', readable: 'dt/全场视图', writable: '通过句柄改状态', capability: 'sim.read', budget: '0.05ms/帧', stability: 'stable' },
  { id: 'S5', domain: 'sim', point: 'sim.beforeAttack', readable: '攻击者/目标', writable: '过滤/替换目标', capability: 'sim.read', budget: '0.2ms/次', stability: 'stable' },
  { id: 'S6', domain: 'sim', point: 'sim.hit', readable: '伤害包', writable: 'amount/type/tags/取消', capability: 'sim.damage.write', budget: '0.2ms/次', stability: 'stable' },
  { id: 'S7', domain: 'sim', point: 'sim.damaged', readable: '实际伤害', writable: '触发反击（重入防护）', capability: 'sim.damage.write', budget: '0.2ms/次', stability: 'stable' },
  { id: 'S8', domain: 'sim', point: 'sim.heal', readable: '治疗包', writable: '改治疗量', capability: 'sim.heal.write', budget: '0.2ms/次', stability: 'stable' },
  { id: 'S9', domain: 'sim', point: 'sim.kill', readable: '击杀者/死者', writable: '复活/掉落/计数', capability: 'sim.damage.write', budget: '0.2ms/次', stability: 'stable' },
  { id: 'S10', domain: 'sim', point: 'sim.battleEnd', readable: '结果', writable: '追加结算', capability: 'sim.read', budget: '1ms/局', stability: 'stable' },

  { id: 'M1', domain: 'match', point: 'match.onMatchStart', readable: '比赛视图', writable: '受控命令', capability: 'match.read', budget: '1ms/局', stability: 'stable' },
  { id: 'M2', domain: 'match', point: 'match.onRoundStart', readable: '回合/经济/商店', writable: '候选/状态', capability: 'match.economy.write', budget: '0.5ms/回合', stability: 'stable' },
  { id: 'M3', domain: 'match', point: 'match.onRoundEnd', readable: '结算', writable: '奖励/状态', capability: 'match.economy.write', budget: '0.5ms/回合', stability: 'stable' },
  { id: 'M4', domain: 'match', point: 'match.checkEnd', readable: '比赛视图', writable: '返回胜负', capability: 'match.read', budget: '0.2ms/回合', stability: 'stable' },

  { id: 'P1', domain: 'policy', point: 'policy.decide', readable: '观察 + 合法动作', writable: '返回一个动作', capability: 'policy.observe', budget: 'budgetMs（默认 50ms）', stability: 'stable' },
  { id: 'P2', domain: 'policy', point: 'policy.onDraft', readable: '选秀/商店', writable: '返回选择', capability: 'policy.act', budget: '50ms', stability: 'stable' },

  { id: 'U1', domain: 'ui', point: 'ui.render', readable: '只读 pluginView', writable: '声明式组件树', capability: 'ui.frame', budget: '16ms/帧', stability: 'stable' },
  { id: 'U2', domain: 'ui', point: 'ui.slot', readable: '槽位声明', writable: '占用一个槽位', capability: 'ui.frame', budget: '加载期', stability: 'stable' },

  { id: 'A1', domain: 'asset', point: 'asset.add', readable: '资产清单', writable: '新增文件', capability: 'asset.add', budget: '安装期', stability: 'stable' },
  { id: 'A2', domain: 'asset', point: 'asset.override', readable: '官方条目', writable: '替换条目', capability: 'asset.override', budget: '安装期，需审计', stability: 'stable' },
]);

/** Points the runtime may change in a minor release. */
export const KEEL_EXPERIMENTAL_POINTS = Object.freeze([
  'sim.death', 'sim.skillStart', 'sim.skillEnd', 'sim.statusApplied', 'sim.enemySpawn', 'sim.enemyLeak',
  'sim.elementBurst', 'sim.hpDamage', 'match.onPhase', 'match.onSettle', 'policy.review', 'ui.theme',
]);

/** The domain order used by the docs and the CLI. */
export const KEEL_DOMAINS = Object.freeze(['content', 'sim', 'match', 'policy', 'ui', 'asset']);

/** Group the stable points by domain, in KEEL_DOMAINS order. */
export function pointsByDomain() {
  return KEEL_DOMAINS.map((domain) => ({ domain, points: KEEL_STABLE_POINTS.filter((p) => p.domain === domain) }));
}
