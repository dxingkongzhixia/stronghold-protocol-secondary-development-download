// public/js/ui/codex.js — 资料库 (CODEX): a read-only, data-driven browser of 盟约 (bonds), 策略 (strategies/bands) and
// the 悬赏 / 敌人池 (the two leader phases + the 悬赏决策 card drafts).
//
// Everything it shows comes from the generated data the game already loads (public/js/ui/codexModel.js — bonds.json,
// bands.json, items.json, chess.json, bosses.json, enemies.json, choices.json, config.json), so adding a bond / strategy
// / boss / bounty card needs no change here. Reached from the 设置 dialog (ui/settings.js `set-codex`), the single entry
// point every screen's settings gear opens — the same global-host pattern as 玩法说明 (ui/guide.js) and bug提交
// (ui/community.js); mounted once by main.js as <CodexHost/> and above the settings modal.
//
// The 悬赏 finding (docs/CONTENT-AUTHORING.md §4): the hunt runs in two phases with a pool each — 最终攻势 (FINAL_ASSAULT,
// config `bossWeights`) and 隐秘核心 (HIDDEN_CORE, `hiddenBossWeights`); the mapping is DATA (config modes + bosses.json
// `hidden`), applied by server/match/waves.js. The 悬赏决策 draft pools (initial / boss / hunter) are a separate,
// card-based mechanic and are shown next to them.

import { useEffect, useRef, useState } from '../../vendor/hooks.module.js';
import { html, Icon, MicroLabel, Spinner, TierChip, roman, Fragment } from './components.js';
import { BondGlyph, BandIcon, RichText, UnitThumb, ItemIcon } from './gameComponents.js';
import { createStore, useStore } from '../store.js';
import { data, useData } from '../data.js';
import { ensureStylesheet } from './ensureStylesheet.js';
import { t, N_ } from '../../../shared/i18n.js';
import {
  bondView, filterBonds, bondKind, bondScope,
  filterBands, bandView,
  bossPhasePools, bossPoolModes, bountyDraftPools, enemyStats,
} from './codexModel.js';

const cx = (...p) => p.flat().filter(Boolean).join(' ');

const CX_CSS = '/css/screens/codex.css';

/** Which data files the codex reads (kept together for openCodex / useData). */
export const CODEX_FILES = Object.freeze([
  'bonds', 'bands', 'items', 'chess', 'bosses', 'enemies', 'choices', 'config', 'assets',
]);

const TABS = Object.freeze([
  { id: 'bonds', label: N_('盟约') },
  { id: 'bands', label: N_('策略') },
  { id: 'bounty', label: N_('悬赏') },
]);

const BOND_KINDS = Object.freeze([['all', N_('全部')], ['core', N_('核心盟约')], ['addon', N_('附加盟约')]]);
const BOND_SCOPES = Object.freeze([['all', N_('全部')], ['battle', N_('战斗中生效')], ['alltime', N_('全程生效')]]);
const BAND_MODES = Object.freeze([['all', N_('全部')], ['SINGLE', N_('独立模拟')], ['MULTI', N_('同盟模拟')]]);
const DRAFT_KIND_NAMES = Object.freeze({ initial: N_('前期悬赏'), boss: N_('领袖悬赏'), hunter: N_('猎头悬赏') });
/** `modeTypeList` codes → msgids (a strategy's usable mode types). */
const MODE_NAMES = Object.freeze({ LOCAL: N_('本地模拟'), SINGLE: N_('独立模拟'), MULTI: N_('同盟模拟') });

/** Open/closed, active tab and the current picks (kept across a close → open). */
export const codexStore = createStore({ open: false, tab: 'bonds', bondId: null, bandId: null, modeId: null });

/** Open the codex (optionally at a tab) and start loading its data. */
export function openCodex(tab = 'bonds') {
  ensureStylesheet(CX_CSS);
  try { data.loadAll(CODEX_FILES).catch(() => {}); } catch { /* load is best-effort */ }
  codexStore.set((s) => ({ ...s, open: true, tab: typeof tab === 'string' ? tab : s.tab }));
}
export const closeCodex = () => codexStore.set({ open: false });

// ---- small pieces ---------------------------------------------------------------------------------

/** A row of one-of filter chips. */
function Chips({ items, value, onChange, label }) {
  return html`<div class="cx-chips" role="group" aria-label=${label}>
    ${items.map(([id, name]) => html`<button key=${id} type="button" class=${cx('cx-chip', id === value && 'is-on')}
      aria-pressed=${id === value ? 'true' : 'false'} data-chip=${id} onClick=${() => onChange(id)}>${t(name)}</button>`)}
  </div>`;
}

/** A labelled field of a detail pane. */
function Field({ micro, label, children }) {
  return html`<div class="cx-field">
    ${micro ? html`<${MicroLabel}>${micro}<//>` : null}
    <span class="cx-field__label">${label}</span>
    <span class="cx-field__value">${children}</span>
  </div>`;
}

// ---- 盟约 ------------------------------------------------------------------------------------------

function BondCard({ bond, memberCount, equipCount, selected, onOpen }) {
  const kind = bondKind(bond);
  const scope = bondScope(bond);
  return html`<button type="button" class=${cx('cx-card', selected && 'is-on')} data-bond=${bond.bondId}
      onClick=${() => onOpen(bond.bondId)} title=${bond.name}>
    <span class="cx-card__icon"><${BondGlyph} bondId=${bond.bondId} /></span>
    <span class="cx-card__body">
      <span class="cx-card__name">${bond.name}</span>
      <span class="cx-card__micro">
        <${MicroLabel} tone=${kind === 'core' ? 'mint' : undefined}>${kind === 'core' ? t('核心盟约') : t('附加盟约')}<//>
        <em class=${cx('cx-scope', scope === 'alltime' && 'is-all')}>${scope === 'alltime' ? t('全程生效') : t('战斗中生效')}</em>
      </span>
      <span class="cx-card__facts">
        <span class="num">${memberCount}</span> <small>${t('成员')}</small>
        ${equipCount ? html`<span class="num">${equipCount}</span> <small>${t('相关装备')}</small>` : null}
        ${bond.noStack ? html`<small>${t('层数不显示')}</small>` : null}
      </span>
    </span>
  </button>`;
}

/** Layer stepper for the effect text (the per-layer values). */
function LayerPicker({ layers, onSet }) {
  return html`<div class="cx-layers">
    <span class="cx-layers__label">${t('层数')}</span>
    ${[0, 10, 25, 50, 100].map((n) => html`<button key=${n} type="button" class=${cx('cx-chip', n === layers && 'is-on')} onClick=${() => onSet(n)}>${n}</button>`)}
    <input type="range" min="0" max="300" step="5" value=${layers} aria-label=${t('层数')} onInput=${(e) => onSet(Number(e.currentTarget.value))} />
    <b class="num">${layers}</b>
  </div>`;
}

function BondDetail({ b, chess, items }) {
  const [layers, setLayers] = useState(0);
  // A different bond resets the stepper.
  useEffect(() => { setLayers(0); }, [b.bondId]);
  const v = bondView(b, { items, chess, layers });
  const kind = v.kind;
  return html`<div class="cx-detail" data-bond-detail=${v.bondId}>
    <header class="cx-detail__head">
      <span class="cx-detail__icon"><${BondGlyph} bondId=${v.bondId} /></span>
      <div class="cx-detail__titles">
        <${MicroLabel} tone="mint">${kind === 'core' ? t('核心盟约') : t('附加盟约')}<//>
        <h3>${v.name}</h3>
        <div class="cx-tags">
          <span class="cx-tag">${v.scope === 'alltime' ? t('全程生效') : t('战斗中生效')}</span>
          ${v.countsHand ? html`<span class="cx-tag">${t('（含整备区）')}</span>` : null}
          ${v.noStack ? html`<span class="cx-tag">${t('层数不显示')}</span>` : null}
        </div>
      </div>
    </header>

    ${v.stages.length ? html`<section class="cx-sec">
      <h4>${t('激活阈值')}</h4>
      <div class="cx-stages">
        ${v.stages.map((st) => html`<div key=${st.index} class="cx-stage">
          <span class="cx-stage__tier"><${TierChip} tier=${st.index} size="sm" /><b>${t('阶段')} ${roman(st.index)}</b></span>
          <span class="cx-stage__need num">${st.threshold}${st.maxCount != null ? html` <small>${t('名及以下')}</small>` : html` <small>${t('名')}</small>`}</span>
          ${st.effect ? html`<span class="cx-stage__spec">${st.effect}</span>` : null}
        </div>`)}
      </div>
    </section>` : null}

    <section class="cx-sec">
      <h4>${t('盟约效果')} <small class="num">${t('（{layers} 层）', { layers })}</small></h4>
      <${LayerPicker} layers=${layers} onSet=${setLayers} />
      <p class="cx-effect"><${RichText} text=${v.effectAt} /></p>
      ${v.effectBase !== v.effectAt ? html`<p class="cx-effect cx-effect--base"><${MicroLabel}>${t('基础')}<//> <${RichText} text=${v.effectBase} /></p>` : null}
    </section>

    <section class="cx-sec">
      <h4>${t('完整描述')}</h4>
      <${RichText} as="p" text=${v.desc} class="cx-desc" />
    </section>

    ${v.milestones.length ? html`<section class="cx-sec">
      <h4>${t('层数里程碑')}</h4>
      <ul class="cx-milestones">
        ${v.milestones.map((m) => html`<li key=${m.index}>
          <b class="num">${m.mode === 'every' ? t('每 {n} 层', { n: m.layer }) : m.mode === 'first' ? t('首次达到 {n} 层', { n: m.layer }) : t('达到 {n} 层', { n: m.layer })}</b>
          <span>${m.effect}</span>
        </li>`)}
      </ul>
    </section>` : null}

    <section class="cx-sec">
      <h4>${t('相关装备')}</h4>
      ${(v.equipment.grants.length || v.equipment.requires.length) ? html`<div class="cx-items">
        ${v.equipment.grants.map((x) => html`<span key=${x.family} class="cx-item is-grant" title=${x.item.name}>
          <${ItemIcon} itemId=${x.item.id} size="sm" /><span>${x.item.name}</span></span>`)}
        ${v.equipment.requires.map((x) => html`<span key=${x.family} class="cx-item is-require" title=${x.item.name}>
          <${ItemIcon} itemId=${x.item.id} size="sm" /><span>${x.item.name}</span></span>`)}
      </div>` : html`<p class="cx-empty t-lo">${t('暂无')}</p>`}
    </section>

    <section class="cx-sec">
      <h4>${t('成员')} <small class="num">${v.members.length}</small></h4>
      ${v.members.length ? html`<div class="cx-members">
        ${v.members.map((c) => html`<span key=${c.chessId} class="cx-member" title=${c.name}>
          <${UnitThumb} kind="chess" id=${c.chessId} size="sm" /><span>${c.name}</span></span>`)}
      </div>` : html`<p class="cx-empty t-lo">${t('暂无')}</p>`}
    </section>

    ${v.spec && Array.isArray(v.spec.tiers) && v.spec.tiers.length ? html`<details class="cx-spec">
      <summary>${t('数据规格')}</summary>
      <ol>${v.spec.tiers.map((x, i) => html`<li key=${i}><b>${x.need}</b> — ${x.effect}</li>`)}</ol>
      ${v.spec.formulas ? html`<dl>${Object.entries(v.spec.formulas).map(([k, val]) => html`<div key=${k}><dt>${k}</dt><dd>${val}</dd></div>`)}</dl>` : null}
    </details>` : null}
  </div>`;
}

// ---- 策略 ------------------------------------------------------------------------------------------

function BandRow({ band, bondNames, selected, onOpen }) {
  return html`<button type="button" class=${cx('cx-row', selected && 'is-on')} data-band=${band.bandId} onClick=${() => onOpen(band.bandId)}>
    <span class="cx-row__icon"><${BandIcon} bandId=${band.bandId} size="sm" /></span>
    <span class="cx-row__body">
      <span class="cx-row__name">${band.name}</span>
      <span class="cx-row__sub">${band.effectName}</span>
    </span>
    <span class="cx-row__facts">${bondNames.length ? html`<small>${bondNames.join(' · ')}</small>` : null}</span>
  </button>`;
}

function BandDetail({ b, bondNames, onOpenBond }) {
  const v = bandView(b);
  return html`<div class="cx-detail" data-band-detail=${v.bandId}>
    <header class="cx-detail__head">
      <span class="cx-detail__icon"><${BandIcon} bandId=${v.bandId} /></span>
      <div class="cx-detail__titles">
        <${MicroLabel} tone="mint">STRATEGY // ${t('策略')}<//>
        <h3>${v.name}</h3>
        <div class="cx-tags"><span class="cx-tag">${v.effectName}</span></div>
      </div>
    </header>

    <section class="cx-sec">
      <h4>${t('策略效果')}</h4>
      <${RichText} as="p" text=${v.effect} class="cx-desc" />
    </section>

    <section class="cx-sec cx-facts">
      <${Field} micro="HP" label=${t('初始目标生命')}>${html`<b class="num">${v.hp}</b>`}<//>
      ${v.victorCount != null ? html`<${Field} micro="VICTORY" label=${t('胜利条件')}>${html`<span class="num">${v.victorCount}</span>`}<//>` : null}
      ${v.rewardModulus != null ? html`<${Field} micro="REWARD" label=${t('奖励系数')}>${html`<span class="num">×${v.rewardModulus}</span>`}<//>` : null}
      <${Field} micro="MODE" label=${t('可用模式')}>${v.modes.length ? v.modes.map((m) => t(MODE_NAMES[m] || m)) : t('全部')}<//>
      ${v.unlock ? html`<${Field} micro="UNLOCK" label=${t('解锁条件')}>${v.unlock}<//>` : null}
    </section>

    <section class="cx-sec">
      <h4>${t('相关盟约')}</h4>
      ${v.bondIds.length ? html`<div class="cx-chips">
        ${v.bondIds.map((id, i) => html`<button key=${id} type="button" class="cx-chip is-bond" onClick=${() => onOpenBond(id)}>${bondNames[i] || id}</button>`)}
      </div>` : html`<p class="cx-empty t-lo">${t('暂无')}</p>`}
    </section>

    ${v.buffKeys.length ? html`<details class="cx-spec">
      <summary>${t('数据规格')}</summary>
      <ul>${v.buffKeys.map((k, i) => html`<li key=${i}><code>${k}</code></li>`)}</ul>
    </details>` : null}
  </div>`;
}

// ---- 悬赏 / 敌人池 ---------------------------------------------------------------------------------

function EnemyThumb({ enemyKey, enemy }) {
  return html`<${UnitThumb} kind="enemy" id=${enemyKey} size="sm" showTier=${false} title=${(enemy && enemy.name) || enemyKey} />`;
}

function EnemyStats({ enemy }) {
  const st = enemyStats(enemy);
  return html`<span class="cx-stats num">
    <span title=${t('生命值')}>${Math.round(st.maxHp).toLocaleString()}</span>
    <span title=${t('攻击力')}>${st.atk}</span>
    <span title=${t('防御力')}>${st.def}</span>
    <span title=${t('法抗')}>${st.res}</span>
  </span>`;
}

function BossPool({ phase }) {
  return html`<section class="cx-phase" data-phase=${phase.phase} data-round=${phase.round}>
    <header class="cx-phase__head">
      <${MicroLabel} tone="mint">${phase.micro}<//>
      <h4>${phase.phase === 'HIDDEN_CORE' ? t('隐秘核心') : t('最终攻势')} <small class="num">R${phase.round}</small></h4>
      <span class="cx-phase__src">config.json <code>modes[${phase.modeId}].${phase.weightsKey}</code> · bosses.json <code>hidden:${String(phase.hidden)}</code></span>
    </header>
    ${phase.pool.length ? html`<div class="cx-bosses">
      ${phase.pool.map((x) => html`<article key=${x.bossId} class="cx-boss" data-boss=${x.bossId} data-weight=${x.weight}>
        <header class="cx-boss__head">
          <${EnemyThumb} enemyKey=${x.boss.enemyKey} enemy=${x.enemy} />
          <div class="cx-boss__titles">
            <b>${x.boss.name}</b>
            <small class="num">${x.boss.enemyKey} · ${t('权重')} ${x.weight}</small>
          </div>
          ${x.enemy ? html`<${EnemyStats} enemy=${x.enemy} />` : null}
        </header>
        ${x.enemy && x.enemy.descRaw ? html`<p class="cx-boss__desc"><${RichText} text=${x.enemy.descRaw} /></p>` : null}
        <div class="cx-boss__facts">
          ${x.template ? html`<span><${MicroLabel}>WAVE<//> <code>${x.template.template}</code> <small class="num">R${x.template.round}</small></span>` : null}
          ${x.enemy ? html`<span><${MicroLabel}>LPR<//> <b class="num">${enemyStats(x.enemy).lpr}</b></span>` : null}
          <span><${MicroLabel}>ABILITIES<//> <b class="num">${(x.boss.abilities || []).length}</b> · PARTS <b class="num">${(x.boss.parts || []).length}</b></span>
        </div>
        ${x.escorts.length ? html`<div class="cx-escorts">
          <span class="cx-escorts__label">${t('护卫')}</span>
          ${x.escorts.map((e) => html`<span key=${e.key} class="cx-escort" title=${(e.enemy && e.enemy.name) || e.key}>
            <${EnemyThumb} enemyKey=${e.key} enemy=${e.enemy} />
            <span>${(e.enemy && e.enemy.name) || e.key}<small class="num"> ×${e.count}</small></span>
          </span>`)}
        </div>` : null}
      </article>`)}
    </div>` : html`<p class="cx-empty t-lo">${t('本阶段无该池数据')}</p>`}
  </section>`;
}

function BountyDrafts({ choices, getEnemy }) {
  const pools = bountyDraftPools(choices);
  if (!pools.length) return html`<p class="cx-empty t-lo">${t('暂无')}</p>`;
  return html`<div class="cx-drafts">
    ${pools.map((p) => html`<section key=${p.kind} class="cx-draft" data-draft=${p.kind}>
      <header class="cx-draft__head">
        <${MicroLabel} tone="mint">${p.kind.toUpperCase()}<//>
        <h4>${t(DRAFT_KIND_NAMES[p.kind] || p.kind)}</h4>
        <span class="cx-phase__src">choices.json <code>bountyDrafts.${p.kind}</code> · ${p.cards.length} ${t('卡牌')} · ${p.enemies.length} ${t('敌人')}</span>
      </header>
      <div class="cx-draft__cards">
        ${p.cards.map((c) => html`<article key=${c.effectId} class="cx-bounty" data-enemy=${c.enemyKey}>
          <${EnemyThumb} enemyKey=${c.enemyKey} enemy=${getEnemy(c.enemyKey)} />
          <div class="cx-bounty__titles">
            <b>${c.name}</b>
            <small class="num">${c.enemyKey} ×${c.count} · T${c.tier} · ${c.coin}${c.payout === 'perfect' ? ` · ${t('完美作战')}` : ''}</small>
          </div>
        </article>`)}
      </div>
    </section>`)}
  </div>`;
}

function BountyTab({ modeId, onMode }) {
  const config = data.get('config');
  const bosses = data.list('bosses');
  const choices = data.get('choices');
  const modes = bossPoolModes(config);
  const fallback = modes.find((m) => m.modeId === 'mode_multi_hard') || modes[0];
  const active = modes.some((m) => m.modeId === modeId) ? modeId : (fallback && fallback.modeId) || 'mode_multi_hard';
  const getEnemy = (k) => data.lookup('enemies', k);
  const phases = bossPhasePools(config, bosses, getEnemy, active);
  return html`<div class="cx-bountypane">
    ${modes.length > 1 ? html`<div class="cx-chips cx-bounty__modes" role="group" aria-label=${t('模拟难度')}>
      ${modes.map((m) => html`<button key=${m.modeId} type="button" class=${cx('cx-chip', m.modeId === active && 'is-on')}
        data-mode=${m.modeId} onClick=${() => onMode(m.modeId)}>${m.name || m.modeId}</button>`)}
    </div>` : null}
    <div class="cx-phases">${phases.map((ph) => html`<${BossPool} key=${ph.phase} phase=${ph} />`)}</div>
    <section class="cx-sec">
      <h4>${t('悬赏敌人池')} <small>${t('两阶段：最终攻势 / 隐秘核心')}</small></h4>
    </section>
    <section class="cx-sec">
      <h4>${t('悬赏决策')} <small>${t('卡牌悬赏的目标敌人')}</small></h4>
      <${BountyDrafts} choices=${choices} getEnemy=${getEnemy} />
    </section>
  </div>`;
}

// ---- host ------------------------------------------------------------------------------------------

/** The codex overlay (mounted once near the root; open via openCodex). */
export function CodexHost() {
  const st = useStore((s) => s, Object.is, codexStore);
  const ready = useData(...CODEX_FILES);
  const boxRef = useRef(null);
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('all');
  const [scope, setScope] = useState('all');
  const [bandMode, setBandMode] = useState('all');

  useEffect(() => {
    if (!st.open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeCodex(); }
    };
    window.addEventListener('keydown', onKey, true);
    const timer = setTimeout(() => boxRef.current?.focus?.(), 30);
    return () => { window.removeEventListener('keydown', onKey, true); clearTimeout(timer); };
  }, [st.open]);

  if (!st.open) return null;

  const chess = data.list('chess');
  const bonds = data.list('bonds');
  const bands = data.list('bands');
  const items = data.list('items');
  const membersOf = (bondId) => chess.filter((c) => (c.bonds || []).includes(bondId)).map((c) => c.name);
  const bondNamesOf = (bandId) => {
    const b = bands.find((x) => x.bandId === bandId);
    return (b && b.bondIds || []).map((id) => (bonds.find((x) => x.bondId === id) || {}).name || id);
  };

  const shownBonds = filterBonds(bonds, { kind, scope, query, membersOf });
  const shownBands = filterBands(bands, { query, modeType: bandMode === 'all' ? null : bandMode, bondNamesOf });

  const activeTab = TABS.some((x) => x.id === st.tab) ? st.tab : 'bonds';
  const setTab = (tab) => { codexStore.set({ tab }); };
  const bondId = (st.bondId && shownBonds.some((b) => b.bondId === st.bondId) ? st.bondId : null)
    || (shownBonds[0] && shownBonds[0].bondId) || null;
  const bandId = (st.bandId && shownBands.some((b) => b.bandId === st.bandId) ? st.bandId : null)
    || (shownBands[0] && shownBands[0].bandId) || null;
  const bond = bonds.find((b) => b.bondId === bondId) || null;
  const band = bands.find((b) => b.bandId === bandId) || null;

  return html`<div class="cx" role="presentation" onMouseDown=${(e) => { if (e.target === e.currentTarget) closeCodex(); }}>
    <div class="cx__box brackets" role="dialog" aria-modal="true" aria-label=${t('资料库')} tabindex="-1" ref=${boxRef}>
      <header class="cx__head">
        <div class="cx__titles">
          <${MicroLabel} tone="mint">CODEX // STRONGHOLD PROTOCOL<//>
          <h2 class="cx__title">${t('资料库')}</h2>
        </div>
        <nav class="cx__tabs" role="tablist" aria-label=${t('资料库')}>
          ${TABS.map((tab) => html`<button key=${tab.id} type="button" role="tab" aria-selected=${tab.id === activeTab ? 'true' : 'false'}
            class=${cx('cx__tab', tab.id === activeTab && 'is-on')} data-tab=${tab.id} onClick=${() => setTab(tab.id)}>${t(tab.label)}</button>`)}
        </nav>
        <button type="button" class="cx__close" aria-label=${t('关闭')} title=${t('关闭 (Esc)')} onClick=${closeCodex}><${Icon} name="close" /></button>
      </header>

      ${!ready ? html`<div class="cx__loading"><${Spinner} size="lg" label=${t('加载中…')} /></div>` : html`<${Fragment}>
        ${activeTab === 'bonds' ? html`<div class="cx__toolbar">
          <label class="cx-search"><${Icon} name="search" /><input type="search" value=${query} placeholder=${t('搜索盟约、效果或成员…')}
            aria-label=${t('搜索')} onInput=${(e) => setQuery(e.currentTarget.value)} /></label>
          <${Chips} items=${BOND_KINDS} value=${kind} onChange=${setKind} label=${t('核心盟约')} />
          <${Chips} items=${BOND_SCOPES} value=${scope} onChange=${setScope} label=${t('战斗中生效')} />
          <span class="cx-count num">${t('已收录 {n}', { n: shownBonds.length })} / ${bonds.length}</span>
        </div>` : null}
        ${activeTab === 'bands' ? html`<div class="cx__toolbar">
          <label class="cx-search"><${Icon} name="search" /><input type="search" value=${query} placeholder=${t('搜索策略或盟约…')}
            aria-label=${t('搜索')} onInput=${(e) => setQuery(e.currentTarget.value)} /></label>
          <${Chips} items=${BAND_MODES} value=${bandMode} onChange=${setBandMode} label=${t('策略')} />
          <span class="cx-count num">${t('已收录 {n}', { n: shownBands.length })} / ${bands.length}</span>
        </div>` : null}

        <div class="cx__body" data-tab=${activeTab}>
          ${activeTab === 'bonds' ? html`<${Fragment}>
            <div class="cx__list">
              ${shownBonds.length ? shownBonds.map((b) => html`<${BondCard} key=${b.bondId} bond=${b}
                memberCount=${membersOf(b.bondId).length}
                equipCount=${items.filter((i) => (i.giveBondId === b.bondId && !i.canGiveBond) || i.requiresBondId === b.bondId).length}
                selected=${b.bondId === bondId} onOpen=${(id) => codexStore.set({ bondId: id })} />`) : html`<p class="cx-empty">${t('未找到匹配的盟约')}</p>`}
            </div>
            <div class="cx__detail">${bond ? html`<${BondDetail} b=${bond} chess=${chess} items=${items} />` : null}</div>
          <//>` : null}

          ${activeTab === 'bands' ? html`<${Fragment}>
            <div class="cx__list cx__list--rows">
              ${shownBands.length ? shownBands.map((b) => html`<${BandRow} key=${b.bandId} band=${b} bondNames=${bondNamesOf(b.bandId)}
                selected=${b.bandId === bandId} onOpen=${(id) => codexStore.set({ bandId: id })} />`) : html`<p class="cx-empty">${t('未找到匹配的策略')}</p>`}
            </div>
            <div class="cx__detail">${band ? html`<${BandDetail} b=${band} bondNames=${bondNamesOf(band.bandId)}
              onOpenBond=${(id) => codexStore.set({ tab: 'bonds', bondId: id })} />` : null}</div>
          <//>` : null}

          ${activeTab === 'bounty' ? html`<${BountyTab} modeId=${st.modeId} onMode=${(id) => codexStore.set({ modeId: id })} />` : null}
        </div>
      <//>`}
    </div>
  </div>`;
}
