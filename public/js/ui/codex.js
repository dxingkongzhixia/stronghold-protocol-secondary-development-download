// public/js/ui/codex.js — 资料库 (CODEX): a read-only, data-driven browser of 盟约 (bonds), 策略 (bands), 干员
// (operators), the 悬赏决策 card drafts, and the two leader phases of the hunt (最终攻势 / 隐秘核心).
//
// Everything it shows comes from the generated data the game already loads (public/js/ui/codexModel.js — bonds.json,
// bands.json, items.json, chess.json, garrisons.json, bosses.json, enemies.json, choices.json, config.json,
// assets.json), so adding a bond / strategy / operator / boss / enemy / bounty card needs no change here.
//
// Entry points (both, for reachability): the lobby top bar's 资料库 button (screens/lobby.js, left of 统计) and the
// 设置 dialog's action row (ui/settings.js `set-codex`), which every screen's gear opens. The overlay itself is mounted
// once by main.js as <CodexHost/> above the settings modal — the same global-host pattern as 玩法说明 (ui/guide.js)
// and bug提交 (ui/community.js).
//
// The 悬赏 finding (docs/CONTENT-AUTHORING.md §4): the hunt runs in two phases with a pool each — 最终攻势 (FINAL_ASSAULT,
// config `bossWeights`) and 隐秘核心 (HIDDEN_CORE, `hiddenBossWeights`); the mapping is DATA (config modes + bosses.json
// `hidden`), applied by server/match/waves.js. The 悬赏决策 draft pools (initial / boss / hunter) are a separate,
// card-based mechanic and have their own tab; the leader phases never share a pane with them.
//
// Every enemy row opens a read-only enemy detail (enemies.json: stats / description / abilities / tags / the pools it
// comes from); bond members link to an operator detail, and related equipment links to an item detail.

import { useEffect, useRef, useState } from '../../vendor/hooks.module.js';
import { html, Icon, MicroLabel, Spinner, TierChip, roman, Fragment, Tabs, DifficultyIcon } from './components.js';
import { BondGlyph, BandIcon, RichText, UnitThumb, ItemIcon } from './gameComponents.js';
import { createStore, useStore } from '../store.js';
import { data, useData } from '../data.js';
import { ensureStylesheet } from './ensureStylesheet.js';
import { t, N_ } from '../../../shared/i18n.js';
import {
  bondView, filterBonds, bondKind, bondScope,
  filterBands, bandView,
  chessRoster, chessRosterFacets, filterChess, chessView, chessIsCustom,
  itemView,
  bossPhasePools, bossPoolModes, bountyDraftPools, enemyStats, enemyView, enemySources,
} from './codexModel.js';

const cx = (...p) => p.flat().filter(Boolean).join(' ');

const CX_CSS = '/css/screens/codex.css';

/** Which data files the codex reads (kept together for openCodex / useData). */
export const CODEX_FILES = Object.freeze([
  'bonds', 'bands', 'items', 'chess', 'garrisons', 'bosses', 'enemies', 'choices', 'config', 'assets',
]);

/** The tab layout: 盟约 · 策略 · 干员 · 悬赏（决策卡池）· 最终攻势 · 隐秘核心. */
export const TABS = Object.freeze([
  { id: 'bonds', label: N_('盟约'), micro: 'BONDS' },
  { id: 'bands', label: N_('策略'), micro: 'STRATEGIES' },
  { id: 'operators', label: N_('干员'), micro: 'OPERATORS' },
  { id: 'bounty', label: N_('悬赏'), micro: 'BOUNTY CARDS' },
  { id: 'final', label: N_('最终攻势'), micro: 'FINAL ASSAULT' },
  { id: 'hidden', label: N_('隐秘核心'), micro: 'HIDDEN CORE' },
]);

const BOND_KINDS = Object.freeze([['all', N_('全部')], ['core', N_('核心盟约')], ['addon', N_('附加盟约')]]);
const BOND_SCOPES = Object.freeze([['all', N_('全部')], ['battle', N_('战斗中生效')], ['alltime', N_('全程生效')]]);
const BAND_MODES = Object.freeze([['all', N_('全部')], ['SINGLE', N_('独立模拟')], ['MULTI', N_('同盟模拟')]]);
const DRAFT_KIND_NAMES = Object.freeze({ initial: N_('前期悬赏'), boss: N_('领袖悬赏'), hunter: N_('猎头悬赏') });
/** `modeTypeList` codes → msgids (a strategy's usable mode types). */
const MODE_NAMES = Object.freeze({ LOCAL: N_('本地模拟'), SINGLE: N_('独立模拟'), MULTI: N_('同盟模拟') });
const PROFESSION_NAMES = Object.freeze({
  PIONEER: N_('先锋'), WARRIOR: N_('近卫'), TANK: N_('重装'), SNIPER: N_('狙击'),
  CASTER: N_('术师'), MEDIC: N_('医疗'), SUPPORT: N_('辅助'), SPECIAL: N_('特种'),
});
const POSITION_NAMES = Object.freeze({ MELEE: N_('近战'), RANGED: N_('远程'), ALL: N_('全部') });

/** Open/closed, active tab and the current picks (kept across a close → open). */
export const codexStore = createStore({ open: false, tab: 'bonds', bondId: null, bandId: null, chessId: null, modeId: null, pop: null });

/** Open the codex (optionally at a tab) and start loading its data. */
export function openCodex(tab = 'bonds') {
  ensureStylesheet(CX_CSS);
  try { data.loadAll(CODEX_FILES).catch(() => {}); } catch { /* load is best-effort */ }
  codexStore.set((s) => ({ ...s, open: true, tab: typeof tab === 'string' ? tab : s.tab }));
}
export const closeCodex = () => codexStore.set({ open: false, pop: null });
export const openEnemy = (key) => codexStore.set({ pop: { kind: 'enemy', id: String(key || '') } });
export const openItem = (id) => codexStore.set({ pop: { kind: 'item', id: String(id || '') } });
export const closePop = () => codexStore.set({ pop: null });

// ---- small pieces ---------------------------------------------------------------------------------

/** A row of one-of filter chips. `items` are `[value, label]` (value null = 全部). */
function Chips({ items, value, onChange, label, testid }) {
  return html`<div class="cx-chips" role="group" aria-label=${label} data-filter=${testid}>
    ${items.map(([id, name]) => html`<button key=${id == null ? '__all' : String(id)} type="button"
      class=${cx('cx-chip', id === value && 'is-on')} aria-pressed=${id === value ? 'true' : 'false'}
      data-chip=${id == null ? 'all' : String(id)} onClick=${() => onChange(id)}>${name}</button>`)}
  </div>`;
}

/** A labelled filter group: a MICROLABEL english header over its chips. */
function FilterGroup({ micro, children }) {
  return html`<div class="cx-fgroup">
    <${MicroLabel}>${micro}<//>
    ${children}
  </div>`;
}

/** A titled detail section: a Chinese header with its MICROLABEL english sub-line. */
function Section({ title, micro, count, bodyClass, class: cls, children }) {
  return html`<section class=${cx('cx-sec', cls)}>
    <header class="cx-sec__head">
      <span class="cx-sec__title">${title}</span>
      ${micro ? html`<${MicroLabel}>${micro}<//>` : null}
      ${count != null ? html`<span class="cx-sec__count num">${count}</span>` : null}
    </header>
    <div class=${cx('cx-sec__body', bodyClass)}>${children}</div>
  </section>`;
}

/** A tonal pill; `onClick` turns it into a link button. */
function Pill({ tone, title, onClick, children }) {
  if (onClick) {
    return html`<button type="button" class=${cx('cx-pill', tone && `cx-pill--${tone}`, 'is-link')} title=${title}
      onClick=${onClick}>${children}</button>`;
  }
  return html`<span class=${cx('cx-pill', tone && `cx-pill--${tone}`)} title=${title}>${children}</span>`;
}

/** A labelled field of a detail pane. */
function Field({ micro, label, children }) {
  return html`<div class="cx-field">
    ${micro ? html`<${MicroLabel}>${micro}<//>` : null}
    <span class="cx-field__label">${label}</span>
    <span class="cx-field__value">${children}</span>
  </div>`;
}

/** An honest empty state: a small glyph, the message and an optional hint. */
function Empty({ text, hint }) {
  return html`<div class="cx-empty">
    <${Icon} name="info" />
    <p>${text}</p>
    ${hint ? html`<small>${hint}</small>` : null}
  </div>`;
}

/** An enemy thumbnail / icon. */
function EnemyThumb({ enemyKey, enemy, size = 'sm' }) {
  return html`<${UnitThumb} kind="enemy" id=${enemyKey} size=${size} showTier=${false} title=${(enemy && enemy.name) || enemyKey} />`;
}

/** Life / ATK / DEF / RES of an enemy, compact. */
function EnemyStats({ enemy }) {
  const st = enemyStats(enemy);
  return html`<span class="cx-stats num">
    <span title=${t('生命')}>${Math.round(st.maxHp).toLocaleString()}</span>
    <span title=${t('攻击')}>${st.atk}</span>
    <span title=${t('防御')}>${st.def}</span>
    <span title=${t('法抗')}>${st.res}</span>
  </span>`;
}

/** The mode picker for the leader phases: a difficulty glyph + mode name per chip. */
function ModePicker({ modes, value, onChange }) {
  return html`<div class="cx-chips cx-modes" role="group" aria-label=${t('模拟难度')}>
    ${modes.map((m) => html`<button key=${m.modeId} type="button" class=${cx('cx-chip cx-chip--mode', m.modeId === value && 'is-on')}
      data-mode=${m.modeId} onClick=${() => onChange(m.modeId)}>
      ${m.difficulty ? html`<${DifficultyIcon} difficulty=${m.difficulty} class="cx-chip__icon" />` : null}
      <span>${m.name || m.modeId}</span>
    </button>`)}
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

function BondDetail({ b, chess, items, onOpenChess, onOpenItem }) {
  const [layers, setLayers] = useState(0);
  // A different bond resets the stepper.
  useEffect(() => { setLayers(0); }, [b.bondId]);
  const v = bondView(b, { items, chess, layers });
  const kind = v.kind;
  return html`<div class="cx-detail" data-bond-detail=${v.bondId}>
    <header class="cx-detail__head">
      <span class="cx-detail__icon"><${BondGlyph} bondId=${v.bondId} /></span>
      <div class="cx-detail__titles">
        <${MicroLabel} tone="mint">BOND // ${kind === 'core' ? t('核心盟约') : t('附加盟约')}<//>
        <h3>${v.name}</h3>
        <div class="cx-tags">
          <${Pill} tone=${v.scope === 'alltime' ? 'mint' : undefined}>${v.scope === 'alltime' ? t('全程生效') : t('战斗中生效')}<//>
          ${v.countsHand ? html`<${Pill}>${t('（含整备区）')}<//>` : null}
          ${v.noStack ? html`<${Pill}>${t('层数不显示')}<//>` : null}
        </div>
      </div>
    </header>

    ${v.stages.length ? html`<${Section} title=${t('激活阈值')} micro="THRESHOLDS">
      <div class="cx-stages">
        ${v.stages.map((st) => html`<div key=${st.index} class="cx-stage">
          <span class="cx-stage__tier"><${TierChip} tier=${st.index} size="sm" /><b>${t('阶段')} ${roman(st.index)}</b></span>
          <span class="cx-stage__need num">${st.threshold}${st.maxCount != null ? html` <small>${t('名及以下')}</small>` : html` <small>${t('名')}</small>`}</span>
          ${st.effect ? html`<span class="cx-stage__spec">${st.effect}</span>` : null}
        </div>`)}
      </div>
    <//>` : null}

    <${Section} title=${t('盟约效果')} micro="EFFECT" count=${t('（{layers} 层）', { layers })}>
      <${LayerPicker} layers=${layers} onSet=${setLayers} />
      <p class="cx-effect"><${RichText} text=${v.effectAt} /></p>
      ${v.effectBase !== v.effectAt ? html`<p class="cx-effect cx-effect--base"><${MicroLabel}>${t('基础')}<//> <${RichText} text=${v.effectBase} /></p>` : null}
    <//>

    <${Section} title=${t('完整描述')} micro="DESCRIPTION">
      <${RichText} as="p" text=${v.desc} class="cx-desc" />
    <//>

    ${v.milestones.length ? html`<${Section} title=${t('层数里程碑')} micro="MILESTONES">
      <ul class="cx-milestones">
        ${v.milestones.map((m) => html`<li key=${m.index}>
          <b class="num">${m.mode === 'every' ? t('每 {n} 层', { n: m.layer }) : m.mode === 'first' ? t('首次达到 {n} 层', { n: m.layer }) : t('达到 {n} 层', { n: m.layer })}</b>
          <span>${m.effect}</span>
        </li>`)}
      </ul>
    <//>` : null}

    <${Section} title=${t('相关装备')} micro="EQUIPMENT" count=${v.equipment.grants.length + v.equipment.requires.length}>
      ${(v.equipment.grants.length || v.equipment.requires.length) ? html`<div class="cx-items">
        ${v.equipment.grants.map((x) => html`<button key=${x.family} type="button" class="cx-item is-grant is-link"
          data-item=${x.item.id} onClick=${() => onOpenItem(x.item.id)} title=${x.item.name}>
          <${ItemIcon} itemId=${x.item.id} size="sm" /><span>${x.item.name}</span></button>`)}
        ${v.equipment.requires.map((x) => html`<button key=${x.family} type="button" class="cx-item is-require is-link"
          data-item=${x.item.id} onClick=${() => onOpenItem(x.item.id)} title=${x.item.name}>
          <${ItemIcon} itemId=${x.item.id} size="sm" /><span>${x.item.name}</span></button>`)}
      </div>` : html`<p class="cx-muted">${t('暂无')}</p>`}
    <//>

    <${Section} title=${t('成员')} micro="MEMBERS" count=${v.members.length}>
      ${v.members.length ? html`<div class="cx-members">
        ${v.members.map((c) => html`<button key=${c.chessId} type="button" class="cx-member is-link"
          data-chess=${c.chessId} onClick=${() => onOpenChess(c.chessId)} title=${c.name}>
          <${UnitThumb} kind="chess" id=${c.chessId} size="sm" /><span>${c.name}</span></button>`)}
      </div>` : html`<p class="cx-muted">${t('暂无')}</p>`}
    <//>

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
        <div class="cx-tags"><${Pill} tone="mint">${v.effectName}<//></div>
      </div>
    </header>

    <${Section} title=${t('策略效果')} micro="EFFECT">
      <${RichText} as="p" text=${v.effect} class="cx-desc" />
    <//>

    <${Section} title=${t('策略参数')} micro="PARAMETERS" bodyClass="cx-facts">
      <${Field} micro="HP" label=${t('初始目标生命')}>${html`<b class="num">${v.hp}</b>`}<//>
      ${v.victorCount != null ? html`<${Field} micro="VICTORY" label=${t('胜利条件')}>${html`<span class="num">${v.victorCount}</span>`}<//>` : null}
      ${v.rewardModulus != null ? html`<${Field} micro="REWARD" label=${t('奖励系数')}>${html`<span class="num">×${v.rewardModulus}</span>`}<//>` : null}
      <${Field} micro="MODE" label=${t('可用模式')}>${v.modes.length ? v.modes.map((m) => t(MODE_NAMES[m] || m)) : t('全部')}<//>
      ${v.unlock ? html`<${Field} micro="UNLOCK" label=${t('解锁条件')}>${v.unlock}<//>` : null}
    <//>

    <${Section} title=${t('相关盟约')} micro="BONDS" count=${v.bondIds.length}>
      ${v.bondIds.length ? html`<div class="cx-chips">
        ${v.bondIds.map((id, i) => html`<button key=${id} type="button" class="cx-chip is-bond is-link" onClick=${() => onOpenBond(id)}>${bondNames[i] || id}</button>`)}
      </div>` : html`<p class="cx-muted">${t('暂无')}</p>`}
    <//>

    ${v.buffKeys.length ? html`<details class="cx-spec">
      <summary>${t('数据规格')}</summary>
      <ul>${v.buffKeys.map((k, i) => html`<li key=${i}><code>${k}</code></li>`)}</ul>
    </details>` : null}
  </div>`;
}

// ---- 干员 ------------------------------------------------------------------------------------------

function OperatorCard({ c, selected, onOpen, bondNames }) {
  const cost = c.stats && Number.isFinite(Number(c.stats.cost)) ? Number(c.stats.cost) : null;
  return html`<button type="button" class=${cx('cx-op', selected && 'is-on', chessIsCustom(c) && 'is-custom')}
      data-chess=${c.chessId} onClick=${() => onOpen(c.chessId)} title=${c.name}>
    <span class="cx-op__thumb"><${UnitThumb} kind="chess" id=${c.chessId} size="md" /></span>
    <span class="cx-op__body">
      <span class="cx-op__name">${c.name}${c.appellation ? html`<em>${c.appellation}</em>` : null}</span>
      <span class="cx-op__meta">
        <${TierChip} tier=${c.tier} size="sm" />
        ${c.rarity ? html`<span class="cx-rarity t-gold">${'★'.repeat(Math.max(1, Math.min(6, c.rarity | 0)))}</span>` : null}
        <span>${t(PROFESSION_NAMES[c.profession] || c.profession)}${c.subProfessionName ? html` · ${c.subProfessionName}` : null}</span>
        ${cost != null ? html`<span class="num">${cost} ${t('费用')}</span>` : null}
      </span>
      <span class="cx-op__bonds">${bondNames.length ? bondNames.join(' · ') : ''}</span>
    </span>
    ${chessIsCustom(c) ? html`<span class="cx-op__badge">${t('自造')}</span>` : null}
  </button>`;
}

function OperatorDetail({ v, onOpenBond, onOpenBand, onOpenItem }) {
  const stats = v.stats;
  const statRows = [
    ['maxHp', t('生命'), 'HP'], ['atk', t('攻击'), 'ATK'], ['def', t('防御'), 'DEF'], ['res', t('法抗'), 'RES'],
    ['cost', t('部署费用'), 'COST'], ['blockCnt', t('阻挡'), 'BLOCK'], ['aspd', t('攻速'), 'ASPD'],
    ['bat', t('攻击间隔'), 'INTERVAL'], ['moveSpeed', t('移速'), 'SPEED'], ['respawnTime', t('再部署'), 'REDEPLOY'],
  ];
  return html`<div class="cx-detail" data-chess-detail=${v.chessId}>
    <header class="cx-detail__head">
      <span class="cx-detail__icon cx-detail__icon--op"><${UnitThumb} kind="chess" id=${v.chessId} size="lg" /></span>
      <div class="cx-detail__titles">
        <${MicroLabel} tone="mint">OPERATOR // ${t('干员')}<//>
        <h3>${v.name}</h3>
        ${v.appellation ? html`<span class="cx-detail__app">${v.appellation}</span>` : null}
        <div class="cx-tags">
          ${v.rarity ? html`<${Pill} tone="gold">${'★'.repeat(Math.max(1, Math.min(6, v.rarity | 0)))}<//>` : null}
          <${Pill} tone="mint"><${TierChip} tier=${v.tier} size="sm" /> ${t('{tier}阶', { tier: v.tier })}<//>
          <${Pill}>${t(PROFESSION_NAMES[v.profession] || v.profession)}${v.subProfessionName ? html` / ${v.subProfessionName}` : null}<//>
          ${v.position ? html`<${Pill}>${t(POSITION_NAMES[v.position] || v.position)}<//>` : null}
          ${v.nationId ? html`<${Pill}>${v.nationId}<//>` : null}
          ${v.custom ? html`<${Pill} tone="ice">${t('自造')}<//>` : null}
        </div>
      </div>
    </header>

    <${Section} title=${t('数值')} micro="STATS" bodyClass="cx-facts">
      ${statRows.map(([k, label, micro]) => html`<${Field} key=${k} micro=${micro} label=${label}>${html`<b class="num">${stats[k]}</b>`}<//>`)}
      ${v.price != null ? html`<${Field} micro="PRICE" label=${t('价格')}>${html`<b class="num">${v.price}</b>`}<//>` : null}
    <//>

    <${Section} title=${t('盟约')} micro="BONDS" count=${v.bonds.length}>
      ${v.bonds.length ? html`<div class="cx-chips">
        ${v.bonds.map((b) => html`<button key=${b.id} type="button" class=${cx('cx-chip is-link', b.isCore && 'is-core')}
          data-bond=${b.id} onClick=${() => onOpenBond(b.id)}>${b.name}</button>`)}
      </div>` : html`<p class="cx-muted">${t('暂无')}</p>`}
    <//>

    ${(v.trait || v.garrisons.length) ? html`<${Section} title=${t('特质与整备')} micro="TRAIT / GARRISON">
      ${v.trait ? html`<div class="cx-trait"><${MicroLabel}>${t('特质')}<//><p><${RichText} text=${v.trait} /></p></div>` : null}
      ${v.garrisons.map((g) => html`<div key=${g.id} class="cx-trait"><${MicroLabel} tone="mint">${g.eventTypeDesc || t('整备能力')}<//><p><${RichText} text=${g.desc} /></p></div>`)}
    <//>` : null}

    ${v.talents.length ? html`<${Section} title=${t('天赋')} micro="TALENTS">
      <ul class="cx-talents">
        ${v.talents.map((tl, i) => html`<li key=${i}>
          <b>${tl.name}${tl.fromModule ? html` <span class="cx-pill cx-pill--mint">${t('模组')}</span>` : null}</b>
          <p><${RichText} text=${tl.desc} /></p>
        </li>`)}
      </ul>
    <//>` : null}

    ${v.skills.length ? html`<${Section} title=${t('技能')} micro="SKILLS">
      <div class="cx-skills">
        ${v.skills.map((sk) => html`<article key=${sk.skillId} class="cx-skill" data-skill=${sk.skillId}>
          <span class="cx-skill__icon">${sk.iconUrl
            ? html`<img src=${sk.iconUrl} alt="" draggable=${false} />`
            : html`<${Icon} name="sword" />`}</span>
          <div class="cx-skill__body">
            <b>${sk.name}${sk.isDefault ? html` <span class="cx-pill cx-pill--amber">${t('默认')}</span>` : null}</b>
            <small class="num">${sk.skillType}${sk.spCost ? html` · SP ${sk.initSp}/${sk.spCost}` : null}${sk.durationType ? html` · ${sk.durationType}` : null}</small>
            ${sk.desc ? html`<p><${RichText} text=${sk.desc} /></p>` : null}
          </div>
        </article>`)}
      </div>
    <//>` : null}

    ${v.bands.length ? html`<${Section} title=${t('所属策略')} micro="STRATEGIES">
      <div class="cx-chips">
        ${v.bands.map((b) => html`<button key=${b.id} type="button" class="cx-chip is-link" onClick=${() => onOpenBand(b.id)}>${b.name}</button>`)}
      </div>
    <//>` : null}

    ${v.equipment.length ? html`<${Section} title=${t('相关装备')} micro="EQUIPMENT">
      <div class="cx-items">
        ${v.equipment.map((x) => html`<button key=${x.id} type="button" class=${cx('cx-item is-link', x.relation === 'grant' ? 'is-grant' : 'is-require')}
          onClick=${() => onOpenItem(x.id)} title=${x.name}>
          <${ItemIcon} itemId=${x.id} size="sm" /><span>${x.name}</span></button>`)}
      </div>
    <//>` : null}

    ${(v.module || v.rangeId || v.tokens.length) ? html`<details class="cx-spec">
      <summary>${t('数据规格')}</summary>
      <dl>
        <div><dt>id</dt><dd><code>${v.chessId}</code></dd></div>
        ${v.module ? html`<div><dt>${t('模组')}</dt><dd>${v.module.name || v.module.id} <code>${v.module.type || ''}</code></dd></div>` : null}
        ${v.rangeId ? html`<div><dt>${t('攻击范围')}</dt><dd><code>${v.rangeId}</code></dd></div>` : null}
        ${v.tokens.length ? html`<div><dt>token</dt><dd>${v.tokens.map((x) => html`<code key=${x}>${x}</code>`)}</dd></div>` : null}
      </dl>
    </details>` : null}
  </div>`;
}

// ---- 悬赏决策卡池 -----------------------------------------------------------------------------------

function BountyTab({ choices, getEnemy, onOpenEnemy }) {
  const pools = bountyDraftPools(choices);
  if (!pools.length) return html`<div class="cx-pane"><${Empty} text=${t('暂无')} /></div>`;
  return html`<div class="cx-pane">
    ${pools.map((p) => html`<section key=${p.kind} class="cx-draft" data-draft=${p.kind}>
      <header class="cx-draft__head">
        <div class="cx-draft__titles">
          <${MicroLabel} tone="mint">${p.kind.toUpperCase()}<//>
          <h4>${t(DRAFT_KIND_NAMES[p.kind] || p.kind)}</h4>
        </div>
        <span class="cx-phase__src">choices.json <code>bountyDrafts.${p.kind}</code> · ${p.cards.length} ${t('卡牌')} · ${p.enemies.length} ${t('敌人')}</span>
      </header>
      <div class="cx-draft__cards">
        ${p.cards.map((c) => html`<button key=${c.effectId} type="button" class="cx-bounty is-link" data-enemy=${c.enemyKey}
          data-effect=${c.effectId} onClick=${() => onOpenEnemy(c.enemyKey)} title=${c.name}>
          <${EnemyThumb} enemyKey=${c.enemyKey} enemy=${getEnemy(c.enemyKey)} />
          <span class="cx-bounty__titles">
            <b>${c.name}</b>
            <small class="num">${c.enemyKey} ×${c.count} · T${c.tier} · ${c.coin}${c.payout === 'perfect' ? ` · ${t('完美作战')}` : ''}</small>
          </span>
        </button>`)}
      </div>
    </section>`)}
  </div>`;
}

// ---- 领袖阶段（最终攻势 / 隐秘核心） ----------------------------------------------------------------

function BossPool({ phase, onOpenEnemy }) {
  return html`<section class="cx-phase" data-phase=${phase.phase} data-round=${phase.round}>
    <header class="cx-phase__head">
      <div class="cx-phase__titles">
        <${MicroLabel} tone="mint">${phase.micro}<//>
        <h4>${phase.phase === 'HIDDEN_CORE' ? t('隐秘核心') : t('最终攻势')} <small class="num">R${phase.round}</small></h4>
      </div>
      <span class="cx-phase__src">config.json <code>modes[${phase.modeId}].${phase.weightsKey}</code> · bosses.json <code>hidden:${String(phase.hidden)}</code></span>
    </header>
    ${phase.pool.length ? html`<div class="cx-bosses">
      ${phase.pool.map((x) => html`<article key=${x.bossId} class="cx-boss" data-boss=${x.bossId} data-weight=${x.weight}>
        <header class="cx-boss__head">
          <button type="button" class="cx-boss__open" data-enemy=${x.boss.enemyKey} onClick=${() => onOpenEnemy(x.boss.enemyKey)} title=${x.boss.name}>
            <${EnemyThumb} enemyKey=${x.boss.enemyKey} enemy=${x.enemy} size="md" />
            <span class="cx-boss__titles">
              <b>${x.boss.name}</b>
              <small class="num">${x.boss.enemyKey} · ${t('权重')} <b>${x.weight}</b></small>
            </span>
          </button>
          ${x.enemy ? html`<${EnemyStats} enemy=${x.enemy} />` : null}
        </header>
        ${x.enemy && x.enemy.descRaw ? html`<p class="cx-boss__desc"><${RichText} text=${x.enemy.descRaw} /></p>` : null}
        <div class="cx-boss__facts">
          ${x.template ? html`<span><${MicroLabel}>WAVE<//> <code>${x.template.template}</code> <small class="num">R${x.template.round}</small></span>` : null}
          ${x.enemy ? html`<span><${MicroLabel}>LPR<//> <b class="num">${enemyStats(x.enemy).lpr}</b></span>` : null}
          <span><${MicroLabel}>ABILITIES<//> <b class="num">${(x.boss.abilities || []).length}</b></span>
          <span><${MicroLabel}>PARTS<//> <b class="num">${(x.boss.parts || []).length}</b></span>
        </div>
        ${x.escorts.length ? html`<div class="cx-escorts">
          <span class="cx-escorts__label">${t('护卫')}</span>
          ${x.escorts.map((e) => html`<button key=${e.key} type="button" class="cx-escort is-link" data-enemy=${e.key}
            onClick=${() => onOpenEnemy(e.key)} title=${(e.enemy && e.enemy.name) || e.key}>
            <${EnemyThumb} enemyKey=${e.key} enemy=${e.enemy} />
            <span>${(e.enemy && e.enemy.name) || e.key}<small class="num"> ×${e.count}</small></span>
          </button>`)}
        </div>` : null}
      </article>`)}
    </div>` : html`<${Empty} text=${t('本阶段无该池数据')} hint=${t('该难度没有此回合的领袖池')} />`}
  </section>`;
}

function PhaseView({ config, bosses, modeId, phaseKey, onMode, onOpenEnemy }) {
  const modes = bossPoolModes(config);
  const fallback = modes.find((m) => m.modeId === 'mode_multi_hard') || modes[0];
  const active = modes.some((m) => m.modeId === modeId) ? modeId : (fallback && fallback.modeId) || null;
  const getEnemy = (k) => data.lookup('enemies', k);
  const phase = bossPhasePools(config, bosses, getEnemy, active).find((p) => p.phase === phaseKey);
  return html`<div class="cx-pane">
    ${modes.length > 1 ? html`<div class="cx-pane__bar"><${ModePicker} modes=${modes} value=${active} onChange=${onMode} /></div>` : null}
    ${phase ? html`<${BossPool} phase=${phase} onOpenEnemy=${onOpenEnemy} />` : null}
  </div>`;
}

// ---- 敌人 / 装备详情弹层 ---------------------------------------------------------------------------

/** A compact "出现于" row: what a pool/escort/draft is. */
function SourceRow({ children }) {
  return html`<li class="cx-source">${children}</li>`;
}

function EnemyPop({ enemy, onClose, onOpenEnemy }) {
  const v = enemyView(enemy.enemy, enemy.key);
  const config = data.get('config');
  const bosses = data.list('bosses');
  const choices = data.get('choices');
  const src = enemySources(v.key, { config, bosses, choices });
  const poolRows = src.pools;
  const statRows = [
    ['maxHp', t('生命'), 'HP'], ['atk', t('攻击'), 'ATK'], ['def', t('防御'), 'DEF'], ['res', t('法抗'), 'RES'],
    ['moveSpeed', t('移速'), 'SPEED'], ['aspd', t('攻速'), 'ASPD'], ['bat', t('攻击间隔'), 'INTERVAL'],
    ['blockCnt', t('阻挡'), 'BLOCK'], ['lpr', t('漏怪扣血'), 'LPR'], ['rangeRadius', t('攻击半径'), 'RANGE'],
  ];
  return html`<div class="cx-pop" role="presentation" onMouseDown=${(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div class="cx-pop__panel brackets" role="dialog" aria-modal="true" aria-label=${t('敌人详情')} data-enemy-detail=${v.key}>
      <header class="cx-pop__head">
        <span class="cx-pop__icon"><${EnemyThumb} enemyKey=${v.key} enemy=${v.enemy} size="lg" /></span>
        <div class="cx-pop__titles">
          <${MicroLabel} tone="red">ENEMY // ${t('敌人')}<//>
          <h3>${v.name || v.key}</h3>
          <div class="cx-tags">
            <${Pill}>${v.key}<//>
            ${v.rank ? html`<${Pill} tone="amber">${t('位阶')} ${v.rank}<//>` : null}
            ${v.level ? html`<${Pill}>Lv ${v.level}<//>` : null}
            ${v.handbookIndex ? html`<${Pill}>${t('图鉴')} ${v.handbookIndex}<//>` : null}
            ${v.fly ? html`<${Pill} tone="ice">${t('飞行单位')}<//>` : null}
          </div>
        </div>
        <button type="button" class="cx-pop__close" aria-label=${t('关闭')} title=${t('关闭 (Esc)')} onClick=${onClose}><${Icon} name="close" /></button>
      </header>
      <div class="cx-pop__body">
        <${Section} title=${t('数值')} micro="STATS" bodyClass="cx-facts">
          ${statRows.map(([k, label, micro]) => html`<${Field} key=${k} micro=${micro} label=${label}>${html`<b class="num">${k === 'maxHp' ? v.stats[k].toLocaleString() : v.stats[k]}</b>`}<//>`)}
        <//>

        ${v.desc ? html`<${Section} title=${t('描述')} micro="DESCRIPTION">
          <${RichText} as="p" text=${v.desc} class="cx-desc" />
        <//>` : null}

        ${v.abilities.length ? html`<${Section} title=${t('能力')} micro="ABILITIES">
          <ul class="cx-abilities">${v.abilities.map((a, i) => html`<li key=${i}><${RichText} text=${a} /></li>`)}</ul>
        <//>` : null}

        ${(v.tags.length || v.immunities.length || v.acType) ? html`<${Section} title=${t('标签与免疫')} micro="TAGS / IMMUNITY">
          <div class="cx-chips">
            ${v.acType ? html`<${Pill} tone="mint">${v.acType}<//>` : null}
            ${v.tags.map((x) => html`<${Pill} key=${x}>${x}<//>`)}
            ${v.immunities.map((x) => html`<${Pill} key=${x} tone="ice">${x}<//>`)}
          </div>
        <//>` : null}

        ${src.references.some((r) => r.abilities.length || r.parts.length) ? html`<${Section} title=${t('领袖能力与部件')} micro="LEADER">
          ${src.references.map((r) => html`<div key=${r.bossId} class="cx-leader">
            <div class="cx-leader__head"><b>${r.name}</b>${r.hidden ? html`<${Pill} tone="ice">${t('隐秘核心')}<//>` : null}</div>
            ${r.abilities.length ? html`<ul class="cx-abilities">${r.abilities.map((a, i) => html`<li key=${i}><${RichText} text=${a} /></li>`)}</ul>` : null}
            ${r.parts.length ? html`<div class="cx-parts">
              <span class="cx-escorts__label">${t('部件')}</span>
              ${r.parts.map((k) => html`<button key=${k} type="button" class="cx-escort is-link" data-enemy=${k} onClick=${() => onOpenEnemy(k)}>
                <${EnemyThumb} enemyKey=${k} enemy=${data.lookup('enemies', k)} />
                <span>${(data.lookup('enemies', k) || {}).name || k}</span></button>`)}
            </div>` : null}
          </div>`)}
        <//>` : null}

        ${(poolRows.length || src.escorts.length || src.drafts.length) ? html`<${Section} title=${t('出现于')} micro="SOURCES">
          <ul class="cx-sources">
            ${poolRows.map((p, i) => html`<${SourceRow} key=${`p${i}`}>
              <${Pill} tone=${p.phase === 'HIDDEN_CORE' ? 'ice' : 'mint'}>${p.phase === 'HIDDEN_CORE' ? t('隐秘核心') : t('最终攻势')}<//>
              <span>${t('领袖权重 {n}', { n: p.weight })}</span>
              <small class="num">${p.modes.join(' · ')}</small>
            <//>`)}
            ${src.escorts.map((e, i) => html`<${SourceRow} key=${`e${i}`}>
              <${Pill} tone="amber">${t('护卫')}<//>
              <span>${e.bossName} ×${e.count}</span>
              <small class="num">${e.modes.join(' · ')}</small>
            <//>`)}
            ${src.drafts.map((d, i) => html`<${SourceRow} key=${`d${i}`}>
              <${Pill} tone="gold">${t('悬赏决策')}<//>
              <span>${t(DRAFT_KIND_NAMES[d.kind] || d.kind)} ×${d.count}</span>
            <//>`)}
          </ul>
        <//>` : html`<${Section} title=${t('出现于')} micro="SOURCES">
          <p class="cx-muted">${t('未收录于任一悬赏敌人池')}</p>
        <//>`}
      </div>
    </div>
  </div>`;
}

function ItemPop({ item, onClose, onOpenBond }) {
  const v = itemView(item);
  return html`<div class="cx-pop" role="presentation" onMouseDown=${(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div class="cx-pop__panel brackets" role="dialog" aria-modal="true" aria-label=${t('装备详情')} data-item-detail=${v.id}>
      <header class="cx-pop__head">
        <span class="cx-pop__icon"><${ItemIcon} itemId=${v.id} size="lg" /></span>
        <div class="cx-pop__titles">
          <${MicroLabel} tone="mint">ITEM // ${t('装备')}<//>
          <h3>${v.name || v.id}</h3>
          <div class="cx-tags">
            <${Pill}>${v.id}<//>
            ${v.tier ? html`<${Pill} tone="gold"><${TierChip} tier=${v.tier} size="sm" /> ${t('{tier}阶', { tier: v.tier })}<//>` : null}
            ${v.itemType ? html`<${Pill}>${v.itemType}<//>` : null}
            ${v.category ? html`<${Pill}>${v.category}<//>` : null}
            ${v.kind ? html`<${Pill}>${v.kind}<//>` : null}
          </div>
        </div>
        <button type="button" class="cx-pop__close" aria-label=${t('关闭')} title=${t('关闭 (Esc)')} onClick=${onClose}><${Icon} name="close" /></button>
      </header>
      <div class="cx-pop__body">
        ${v.desc ? html`<${Section} title=${t('效果')} micro="EFFECT">
          <${RichText} as="p" text=${v.desc} class="cx-desc" />
          ${v.implFormula ? html`<p class="cx-muted">${v.implFormula}</p>` : null}
        <//>` : null}

        <${Section} title=${t('数值')} micro="STATS" bodyClass="cx-facts">
          ${v.price != null ? html`<${Field} micro="PRICE" label=${t('价格')}>${html`<b class="num">${v.price}</b>`}<//>` : null}
          ${v.buffKeys.length ? html`<${Field} micro="BUFFS" label=${t('效果键')}>${v.buffKeys.map((k) => html`<code key=${k}>${k}</code>`)}<//>` : null}
        <//>

        ${(v.giveBondId || v.requiresBondId) ? html`<${Section} title=${t('相关盟约')} micro="BONDS">
          <div class="cx-chips">
            ${v.giveBondId ? html`<button type="button" class="cx-chip is-bond is-link" onClick=${() => onOpenBond(v.giveBondId)}>${bondName(v.giveBondId)}</button>` : null}
            ${v.requiresBondId ? html`<button type="button" class="cx-chip is-bond is-link" onClick=${() => onOpenBond(v.requiresBondId)}>${bondName(v.requiresBondId)}</button>` : null}
          </div>
        <//>` : null}

        ${v.flavor ? html`<${Section} title=${t('风味文本')} micro="FLAVOR">
          <p class="cx-desc cx-flavor">${v.flavor}</p>
        <//>` : null}

        ${v.note ? html`<p class="cx-muted">${v.note}</p>` : null}
      </div>
    </div>
  </div>`;
}

/** The bond name from bonds.json (id fallback); a module-level helper so ItemPop stays small. */
function bondName(id) {
  const b = data.lookup('bonds', id);
  return (b && b.name) || id;
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
  const [opRarity, setOpRarity] = useState(null);
  const [opTier, setOpTier] = useState(null);
  const [opProfession, setOpProfession] = useState(null);
  const [opCustom, setOpCustom] = useState(null);

  useEffect(() => {
    if (!st.open) return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault(); e.stopPropagation();
      if (st.pop) closePop(); else closeCodex();
    };
    window.addEventListener('keydown', onKey, true);
    const timer = setTimeout(() => boxRef.current?.focus?.(), 30);
    return () => { window.removeEventListener('keydown', onKey, true); clearTimeout(timer); };
  }, [st.open, st.pop]);

  if (!st.open) return null;

  const chess = data.list('chess');
  const bonds = data.list('bonds');
  const bands = data.list('bands');
  const items = data.list('items');
  const config = data.get('config');
  const choices = data.get('choices');
  const roster = chessRoster(chess);
  const facets = chessRosterFacets(chess);
  const membersOf = (bondId) => chess.filter((c) => (c.bonds || []).includes(bondId)).map((c) => c.name);
  const bondNamesOf = (bandId) => {
    const b = bands.find((x) => x.bandId === bandId);
    return (b && b.bondIds || []).map((id) => (bonds.find((x) => x.bondId === id) || {}).name || id);
  };
  const opBondNamesOf = (c) => (c.bonds || []).map((id) => (bonds.find((x) => x.bondId === id) || {}).name || id);

  const shownBonds = filterBonds(bonds, { kind, scope, query, membersOf });
  const shownBands = filterBands(bands, { query, modeType: bandMode === 'all' ? null : bandMode, bondNamesOf });
  const shownOps = filterChess(chess, {
    query, rarity: opRarity, tier: opTier, profession: opProfession, custom: opCustom, bondNamesOf: opBondNamesOf,
  });

  const activeTab = TABS.some((x) => x.id === st.tab) ? st.tab : 'bonds';
  const setTab = (tab) => { setQuery(''); codexStore.set({ tab, pop: null }); };
  const bond = bonds.find((b) => b.bondId === st.bondId) || shownBonds[0] || null;
  const band = bands.find((b) => b.bandId === st.bandId) || shownBands[0] || null;
  const opId = (st.chessId && roster.some((c) => c.chessId === st.chessId) ? st.chessId : null)
    || (shownOps[0] && shownOps[0].chessId) || null;
  const op = roster.find((c) => c.chessId === opId) || null;
  const opView = op ? chessView(op, { bonds, bands, garrisons: data.list('garrisons'), items, assets: data.get('assets') }) : null;

  const draftCount = bountyDraftPools(choices).reduce((n, p) => n + p.cards.length, 0);
  const poolModes = bossPoolModes(config);
  const fallbackMode = poolModes.find((m) => m.modeId === 'mode_multi_hard') || poolModes[0];
  const activeMode = poolModes.some((m) => m.modeId === st.modeId) ? st.modeId : (fallbackMode && fallbackMode.modeId) || null;
  const pools = bossPhasePools(config, data.list('bosses'), (k) => data.lookup('enemies', k), activeMode);
  const poolCount = (phaseKey) => { const p = pools.find((x) => x.phase === phaseKey); return p ? p.pool.length : 0; };
  const badges = {
    bonds: bonds.length, bands: bands.length, operators: roster.length,
    bounty: draftCount, final: poolCount('FINAL_ASSAULT'), hidden: poolCount('HIDDEN_CORE'),
  };

  const pop = st.pop;
  const popEnemy = pop && pop.kind === 'enemy' ? data.lookup('enemies', pop.id) : null;
  const popEnemies = pop && pop.kind === 'enemy' ? { key: pop.id, enemy: popEnemy } : null;
  const popItem = pop && pop.kind === 'item' ? { id: pop.id, item: data.lookup('items', pop.id) } : null;

  return html`<div class="cx" role="presentation" onMouseDown=${(e) => { if (e.target === e.currentTarget) closeCodex(); }}>
    <div class="cx__box brackets" role="dialog" aria-modal="true" aria-label=${t('资料库')} tabindex="-1" ref=${boxRef}>
      <header class="cx__head">
        <div class="cx__titles">
          <${MicroLabel} tone="mint">CODEX // STRONGHOLD PROTOCOL<//>
          <h2 class="cx__title">${t('资料库')}</h2>
        </div>
        <${Tabs} class="cx__tabs" value=${activeTab} onChange=${setTab}
          items=${TABS.map((tab) => ({ id: tab.id, label: t(tab.label), badge: badges[tab.id] }))} />
        <button type="button" class="cx__close" aria-label=${t('关闭')} title=${t('关闭 (Esc)')} onClick=${closeCodex}><${Icon} name="close" /></button>
      </header>

      ${!ready ? html`<div class="cx__loading"><${Spinner} size="lg" label=${t('加载中…')} /></div>` : html`<${Fragment}>
        ${activeTab === 'bonds' ? html`<div class="cx__toolbar">
          <label class="cx-search"><${Icon} name="search" /><input type="search" value=${query} placeholder=${t('搜索盟约、效果或成员…')}
            aria-label=${t('搜索')} onInput=${(e) => setQuery(e.currentTarget.value)} /></label>
          <${FilterGroup} micro="KIND"><${Chips} items=${BOND_KINDS} value=${kind} onChange=${setKind} label=${t('核心盟约')} testid="bond-kind" /><//>
          <${FilterGroup} micro="SCOPE"><${Chips} items=${BOND_SCOPES} value=${scope} onChange=${setScope} label=${t('战斗中生效')} testid="bond-scope" /><//>
          <span class="cx-count num">${t('已收录 {n}', { n: shownBonds.length })} / ${bonds.length}</span>
        </div>` : null}

        ${activeTab === 'bands' ? html`<div class="cx__toolbar">
          <label class="cx-search"><${Icon} name="search" /><input type="search" value=${query} placeholder=${t('搜索策略或盟约…')}
            aria-label=${t('搜索')} onInput=${(e) => setQuery(e.currentTarget.value)} /></label>
          <${FilterGroup} micro="MODE"><${Chips} items=${BAND_MODES} value=${bandMode} onChange=${setBandMode} label=${t('策略')} testid="band-mode" /><//>
          <span class="cx-count num">${t('已收录 {n}', { n: shownBands.length })} / ${bands.length}</span>
        </div>` : null}

        ${activeTab === 'operators' ? html`<div class="cx__toolbar">
          <label class="cx-search"><${Icon} name="search" /><input type="search" value=${query} placeholder=${t('搜索干员、称号或盟约…')}
            aria-label=${t('搜索')} onInput=${(e) => setQuery(e.currentTarget.value)} /></label>
          <${FilterGroup} micro="RARITY"><${Chips} items=${[[null, t('全部')], ...facets.rarities.map((r) => [r, `${r}★`])]} value=${opRarity} onChange=${setOpRarity} label=${t('稀有度')} testid="op-rarity" /><//>
          <${FilterGroup} micro="TIER"><${Chips} items=${[[null, t('全部')], ...facets.tiers.map((n) => [n, roman(n)])]} value=${opTier} onChange=${setOpTier} label=${t('阶数')} testid="op-tier" /><//>
          <${FilterGroup} micro="CLASS"><${Chips} items=${[[null, t('全部')], ...facets.professions.map((p) => [p.id, t(PROFESSION_NAMES[p.id] || p.id)])]} value=${opProfession} onChange=${setOpProfession} label=${t('职业')} testid="op-class" /><//>
          <${FilterGroup} micro="SOURCE"><${Chips} items=${[[null, t('全部')], [true, t('仅自造')]]} value=${opCustom} onChange=${setOpCustom} label=${t('仅自造')} testid="op-source" /><//>
          <span class="cx-count num">${t('已收录 {n}', { n: shownOps.length })} / ${roster.length}</span>
        </div>` : null}

        <div class="cx__body" data-tab=${activeTab}>
          ${activeTab === 'bonds' ? html`<${Fragment}>
            <div class="cx__list">
              ${shownBonds.length ? shownBonds.map((b) => html`<${BondCard} key=${b.bondId} bond=${b}
                memberCount=${membersOf(b.bondId).length}
                equipCount=${items.filter((i) => (i.giveBondId === b.bondId && !i.canGiveBond) || i.requiresBondId === b.bondId).length}
                selected=${bond && b.bondId === bond.bondId} onOpen=${(id) => codexStore.set({ bondId: id })} />`)
                : html`<${Empty} text=${t('未找到匹配的盟约')} />`}
            </div>
            <div class="cx__detail">${bond ? html`<${BondDetail} b=${bond} chess=${chess} items=${items}
              onOpenChess=${(id) => codexStore.set({ tab: 'operators', chessId: id, pop: null })}
              onOpenItem=${openItem} />` : null}</div>
          <//>` : null}

          ${activeTab === 'bands' ? html`<${Fragment}>
            <div class="cx__list cx__list--rows">
              ${shownBands.length ? shownBands.map((b) => html`<${BandRow} key=${b.bandId} band=${b} bondNames=${bondNamesOf(b.bandId)}
                selected=${band && b.bandId === band.bandId} onOpen=${(id) => codexStore.set({ bandId: id })} />`)
                : html`<${Empty} text=${t('未找到匹配的策略')} />`}
            </div>
            <div class="cx__detail">${band ? html`<${BandDetail} b=${band} bondNames=${bondNamesOf(band.bandId)}
              onOpenBond=${(id) => codexStore.set({ tab: 'bonds', bondId: id, pop: null })} />` : null}</div>
          <//>` : null}

          ${activeTab === 'operators' ? html`<${Fragment}>
            <div class="cx__list cx__list--ops">
              ${shownOps.length ? shownOps.map((c) => html`<${OperatorCard} key=${c.chessId} c=${c} bondNames=${opBondNamesOf(c)}
                selected=${op && c.chessId === op.chessId} onOpen=${(id) => codexStore.set({ chessId: id })} />`)
                : html`<${Empty} text=${t('未找到匹配的干员')} />`}
            </div>
            <div class="cx__detail">${opView ? html`<${OperatorDetail} v=${opView}
              onOpenBond=${(id) => codexStore.set({ tab: 'bonds', bondId: id, pop: null })}
              onOpenBand=${(id) => codexStore.set({ tab: 'bands', bandId: id, pop: null })}
              onOpenItem=${openItem} />` : null}</div>
          <//>` : null}

          ${activeTab === 'bounty' ? html`<${BountyTab} choices=${choices} getEnemy=${(k) => data.lookup('enemies', k)} onOpenEnemy=${openEnemy} />` : null}
          ${activeTab === 'final' ? html`<${PhaseView} config=${config} bosses=${data.list('bosses')} modeId=${st.modeId}
            phaseKey="FINAL_ASSAULT" onMode=${(id) => codexStore.set({ modeId: id }) } onOpenEnemy=${openEnemy} />` : null}
          ${activeTab === 'hidden' ? html`<${PhaseView} config=${config} bosses=${data.list('bosses')} modeId=${st.modeId}
            phaseKey="HIDDEN_CORE" onMode=${(id) => codexStore.set({ modeId: id })} onOpenEnemy=${openEnemy} />` : null}
        </div>
      <//>`}

      ${ready && pop && pop.kind === 'enemy' ? html`<${EnemyPop} enemy=${popEnemies} onClose=${closePop} onOpenEnemy=${openEnemy} />` : null}
      ${ready && pop && pop.kind === 'item' ? html`<${ItemPop} item=${popItem.item} onClose=${closePop}
        onOpenBond=${(id) => codexStore.set({ tab: 'bonds', bondId: id, pop: null })} />` : null}
    </div>
  </div>`;
}
