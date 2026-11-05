// public/dev/sandbox/panels.js — the scenario panel of the admin sandbox: operator/skill/loadout, the deploy tile, the
// spawn groups, the map/wave and the global multipliers. Plain DOM + event delegation (no framework); every change
// updates the panel's own state and calls back so the caller can rebuild the battle and rewrite the URL.
//
// The catalogs come from the loaded data files (public/dev/sandbox.js): operators are deduped by charId (a 自选 pick is
// a charId + skill + module, not a chess row), enemies/stages/waves are the raw records.

import { DIRS, autoPlace, cleanGroup } from './state.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nf = (v) => Number(v).toLocaleString('zh-CN');
const SKILL_LABEL = (i) => `S${i + 1}`;

/**
 * @param {{
 *   root: HTMLElement, catalogs: object, initial: object,
 *   onChange: (state: object, opts: { rebuild: boolean }) => void
 * }} opts onChange is called after every accepted change; `rebuild: false` for a list filter only.
 */
export function createPanel({ root, catalogs, initial, onChange }) {
  let state = { ...initial };
  const filter = { op: '', enemy: '' };
  let opLimit = 40;
  let enemyLimit = 40;
  const opById = new Map(catalogs.operators.map((o) => [o.charId, o]));
  const enemyByKey = new Map(catalogs.enemies.map((e) => [e.key, e]));
  const stage = () => catalogs.stages.find((s) => s.id === state.stage) ?? catalogs.stages[0];
  const wave = () => catalogs.waves.find((w) => w.id === state.wave) ?? catalogs.waves[0];
  const op = () => opById.get(state.unit) ?? catalogs.operators[0];

  function commit(patch, { rebuild = true } = {}) {
    state = { ...state, ...patch };
    onChange(state, { rebuild });
    render();
  }

  // ---- operator -----------------------------------------------------------------------------------------------
  const opMatches = () => {
    const q = filter.op.trim().toLowerCase();
    if (!q) return catalogs.operators;
    return catalogs.operators.filter((o) => o.name.toLowerCase().includes(q) || o.charId.toLowerCase().includes(q)
      || (o.profession || '').toLowerCase().includes(q));
  };
  const opListHtml = () => {
    const list = opMatches();
    const rows = list.slice(0, opLimit).map((o) => `
      <button type="button" class="sb-li${o.charId === state.unit ? ' is-on' : ''}" data-op="${esc(o.charId)}" title="${esc(o.charId)}">
        <b>${esc(o.name)}</b><span class="sb-dim">${esc(o.profession || '')}${o.rarity ? ` · ${o.rarity}★` : ''} · ${o.skills.length} 技能</span>
      </button>`).join('');
    const more = list.length > opLimit ? `<button type="button" class="sb-more" data-more="op">还有 ${list.length - opLimit} 个 …</button>` : '';
    return `<div class="sb-count">${list.length} / ${catalogs.operators.length} 个干员</div>${rows}${more}`;
  };

  const skillHtml = () => {
    const o = op();
    if (!o?.skills.length) return '<p class="sb-dim">该干员没有可选技能</p>';
    return o.skills.map((sk) => `
      <button type="button" class="sb-chip${sk.index === state.skill ? ' is-on' : ''}" data-skill="${sk.index}"
        title="${esc(sk.desc || '')}"><b>${SKILL_LABEL(sk.index)}</b> ${esc(sk.name || '')}</button>`).join('');
  };

  const moduleHtml = () => {
    const o = op();
    const mods = o?.modules ?? [];
    return `<select data-field="module"><option value="">无模组</option>${mods.map((m) => `<option value="${esc(m.id)}"${m.id === state.module ? ' selected' : ''}>${esc(m.name || m.id)}</option>`).join('')}</select>`;
  };

  // ---- deploy tile --------------------------------------------------------------------------------------------
  const legalTiles = () => {
    const st = stage();
    const melee = st?.deployTiles?.normal?.melee ?? [];
    const ranged = st?.deployTiles?.normal?.ranged ?? [];
    return new Set([...melee, ...ranged].map(([r, c]) => `${r},${c}`));
  };
  const tileHtml = () => {
    const st = stage();
    const [rows, cols] = Array.isArray(st?.size) ? st.size : [19, 21];
    const legal = legalTiles();
    const cur = state.row != null && state.col != null ? `${state.row},${state.col}` : null;
    let out = '';
    for (let r = 0; r < rows; r++) {
      out += '<div class="sb-tile-row">';
      for (let c = 0; c < cols; c++) {
        const k = `${r},${c}`;
        const cls = `sb-tile${legal.has(k) ? ' is-legal' : ''}${cur === k ? ' is-on' : ''}`;
        out += `<button type="button" class="${cls}" data-tile="${k}" ${legal.has(k) ? '' : 'tabindex="-1"'} title="${k}"></button>`;
      }
      out += '</div>';
    }
    return out;
  };

  const routeOptions = (sel) => {
    const w = wave();
    return (w?.routes ?? []).map((r, i) => {
      const start = Array.isArray(r?.start) ? `${r.start[0]},${r.start[1]}` : '?';
      return `<option value="${i}"${i === sel ? ' selected' : ''}>#${i} ${esc(r?.motion || 'WALK')} 起点 ${esc(start)}</option>`;
    }).join('');
  };

  // ---- enemies ------------------------------------------------------------------------------------------------
  const enemyMatches = () => {
    const q = filter.enemy.trim().toLowerCase();
    if (!q) return catalogs.enemies;
    return catalogs.enemies.filter((e) => e.name.toLowerCase().includes(q) || e.key.toLowerCase().includes(q));
  };
  const enemyListHtml = () => {
    const list = enemyMatches();
    const rows = list.slice(0, enemyLimit).map((e) => `
      <button type="button" class="sb-li" data-enemy="${esc(e.key)}" title="${esc(e.key)}">
        <b>${esc(e.name)}</b>
        <span class="sb-dim">${e.rank ? `${esc(e.rank)} · ` : ''}HP ${nf(e.maxHp)} · ATK ${nf(e.atk)}${e.isFly ? ' · 飞行' : ''}</span>
      </button>`).join('');
    const more = list.length > enemyLimit ? `<button type="button" class="sb-more" data-more="enemy">还有 ${list.length - enemyLimit} 个 …</button>` : '';
    return `<div class="sb-count">${list.length} / ${catalogs.enemies.length} 种敌人</div>${rows}${more}`;
  };
  const groupsHtml = () => {
    if (!state.groups.length) return '<p class="sb-dim">默认：沿波次路线持续刷出该波次的步兵（18 个）。</p>';
    return state.groups.map((g, i) => `
      <div class="sb-group" data-g="${i}">
        <div class="sb-group__head"><b>${esc(enemyByKey.get(g.key)?.name || g.key)}</b><button type="button" class="sb-x" data-del="${i}" title="移除">✕</button></div>
        <label>数量 <input type="number" min="1" max="50" step="1" data-gi="count" value="${g.count}"></label>
        <label>间隔 <input type="number" min="0" max="60" step="0.1" data-gi="interval" value="${g.interval}"></label>
        <label>起始 <input type="number" min="0" max="600" step="0.5" data-gi="time" value="${g.time}"></label>
        <label>路线 <select data-gi="route">${routeOptions(g.route)}</select></label>
        <label>HP× <input type="number" min="0.1" max="100" step="0.1" data-gi="hp" value="${g.hp}"></label>
        <label>ATK× <input type="number" min="0.1" max="100" step="0.1" data-gi="atk" value="${g.atk}"></label>
      </div>`).join('');
  };

  // ---- render -------------------------------------------------------------------------------------------------
  function render() {
    const o = op();
    root.innerHTML = `
      <h1 class="sb-title">沙盒 · 战术演练</h1>
      <p class="sb-sub">真实模拟（/sim）× 真实渲染 · 管理员工作台</p>

      <section class="sb-sec">
        <h2>干员 <span class="sb-dim">${esc(o?.name || state.unit)}</span></h2>
        <input type="search" class="sb-search" data-search="op" placeholder="搜索干员 / 职业 / charId" value="${esc(filter.op)}">
        <div class="sb-list" data-list="op">${opListHtml()}</div>
        <div class="sb-chips">${skillHtml()}</div>
        <div class="sb-loadout">
          <label>形态
            <select data-field="elite">
              <option value="1"${state.elite ? ' selected' : ''}>精英二（E2）</option>
              <option value="0"${state.elite ? '' : ' selected'}>精英一（E1）</option>
            </select>
          </label>
          <label>潜能
            <select data-field="potential">${[1, 2, 3, 4, 5, 6].map((p) => `<option value="${p}"${p === state.potential ? ' selected' : ''}>${p}</option>`).join('')}</select>
          </label>
          <label>练度
            <select data-field="cultivate">${[0, 1, 2, 3].map((c) => `<option value="${c}"${c === state.cultivate ? ' selected' : ''}>${c}</option>`).join('')}</select>
          </label>
          <label>模组 ${moduleHtml()}</label>
        </div>
      </section>

      <section class="sb-sec">
        <h2>部署 <span class="sb-dim">${state.row != null ? `${state.row},${state.col}` : '自动'}</span></h2>
        <div class="sb-tiles">${tileHtml()}</div>
        <div class="sb-loadout">
          <label>朝向
            <select data-field="dir">${DIRS.map((d) => `<option value="${d}"${d === state.dir ? ' selected' : ''}>${d}</option>`).join('')}</select>
          </label>
          <button type="button" class="sb-btn" data-auto="tile">自动选格</button>
        </div>
      </section>

      <section class="sb-sec">
        <h2>敌人${state.foes ? '' : ' <span class="sb-dim">已关闭</span>'}</h2>
        <label class="sb-check"><input type="checkbox" data-field="foes"${state.foes ? ' checked' : ''}> 刷出敌人</label>
        <input type="search" class="sb-search" data-search="enemy" placeholder="搜索敌人（名称 / key）" value="${esc(filter.enemy)}">
        <div class="sb-list" data-list="enemy">${enemyListHtml()}</div>
        <div class="sb-groups">${groupsHtml()}</div>
        <div class="sb-rowbtns">
          <button type="button" class="sb-btn" data-preset="wave">载入原波次</button>
          <button type="button" class="sb-btn" data-preset="clear">清空（默认步兵流）</button>
        </div>
      </section>

      <section class="sb-sec">
        <h2>地图 / 波次</h2>
        <label>地图
          <select data-field="stage">${catalogs.stages.map((s) => `<option value="${esc(s.id)}"${s.id === state.stage ? ' selected' : ''}>${esc(s.name || s.id)}</option>`).join('')}</select>
        </label>
        <label>波次
          <select data-field="wave">${catalogs.waves.map((w) => `<option value="${esc(w.id)}"${w.id === state.wave ? ' selected' : ''}>${esc(w.id)}${w.kind === 'boss' ? ' · BOSS' : ''}${w.bossId ? ` · ${esc(w.bossId)}` : ''}</option>`).join('')}</select>
        </label>
        <label class="sb-check"><input type="checkbox" data-field="mix"${state.mix ? ' checked' : ''}> 整波刷出（?mix=1）</label>
      </section>

      <section class="sb-sec">
        <h2>全局</h2>
        <div class="sb-loadout">
          <label>敌人 HP× <input type="number" min="0.1" max="100" step="0.5" data-field="hp" value="${state.hp}"></label>
          <label>敌人 ATK× <input type="number" min="0.1" max="100" step="0.5" data-field="atk" value="${state.atk}"></label>
          <label>种子 <input type="number" min="1" step="1" data-field="seed" value="${state.seed}"></label>
        </div>
      </section>

      <p class="sb-note">地址栏就是场景：改任何项都会同步；复制链接即可分享。管理员入口 <code>/admin/sandbox?token=…</code>。</p>
      <div class="sb-err" id="sbError"></div>`;
  }

  // ---- events -------------------------------------------------------------------------------------------------
  root.addEventListener('input', (e) => {
    const t = e.target;
    if (t.matches('[data-search]')) {
      filter[t.dataset.search] = t.value;
      if (t.dataset.search === 'op') opLimit = 40; else enemyLimit = 40;
      const list = t.dataset.search === 'op' ? opListHtml() : enemyListHtml();
      const box = root.querySelector(`[data-list="${t.dataset.search}"]`);
      if (box) box.innerHTML = list;
    }
  });

  root.addEventListener('change', (e) => {
    const t = e.target;
    if (t.matches('[data-field]')) {
      const f = t.dataset.field;
      const v = t.type === 'checkbox' ? t.checked
        : t.type === 'number' ? Number(t.value)
          : f === 'elite' ? t.value === '1' : t.value;
      const patch = { [f]: f === 'module' && v === '' ? null : v };
      if (f === 'stage') { patch.row = null; patch.col = null; }
      if (f === 'wave') {
        patch.route = 0;
        for (const g of state.groups) if (g.route >= (catalogs.waves.find((w) => w.id === v)?.routes?.length ?? 0)) g.route = 0;
      }
      commit(patch);
      return;
    }
    if (t.matches('[data-gi]')) {
      const row = t.closest('[data-g]');
      const i = Number(row?.dataset.g);
      if (!Number.isInteger(i) || !state.groups[i]) return;
      const gi = t.dataset.gi;
      const raw = t.type === 'number' || gi === 'route' ? Number(t.value) : t.value;
      const groups = state.groups.map((g, k) => (k === i ? { ...g, [gi]: raw } : g));
      commit({ groups });
      return;
    }
  });

  root.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t || !root.contains(t)) return;
    if (t.dataset.op) {
      const next = opById.get(t.dataset.op);
      const idx = (next?.skills ?? []).map((sk) => sk.index);
      const skill = idx.includes(state.skill) ? state.skill : (idx.filter((i) => i <= state.skill).pop() ?? idx[0] ?? 0);
      const module = next?.modules?.some((m) => m.id === state.module) ? state.module : null;
      commit({ unit: t.dataset.op, skill, module });
      return;
    }
    if (t.dataset.skill) { commit({ skill: Number(t.dataset.skill) }); return; }
    if (t.dataset.tile) {
      const [r, c] = t.dataset.tile.split(',').map(Number);
      if (Number.isInteger(r) && Number.isInteger(c)) commit({ row: r, col: c });
      return;
    }
    if (t.dataset.enemy) {
      const g = cleanGroup({ key: t.dataset.enemy, count: 1, interval: 2, time: 2, route: 0, hp: 1, atk: 1 });
      if (g) commit({ groups: [...state.groups, g] });
      return;
    }
    if (t.dataset.del != null) {
      const i = Number(t.dataset.del);
      commit({ groups: state.groups.filter((_, k) => k !== i) });
      return;
    }
    if (t.dataset.more === 'op') { opLimit += 40; root.querySelector('[data-list="op"]').innerHTML = opListHtml(); return; }
    if (t.dataset.more === 'enemy') { enemyLimit += 40; root.querySelector('[data-list="enemy"]').innerHTML = enemyListHtml(); return; }
    if (t.dataset.auto === 'tile') {
      const [r, c] = autoPlace(stage(), wave()?.routes ?? []);
      commit({ row: r, col: c });
      return;
    }
    if (t.dataset.preset === 'wave') { commit({ mix: true, groups: [] }); return; }
    if (t.dataset.preset === 'clear') { commit({ mix: false, groups: [] }); }
  });

  render();
  return {
    get state() { return state; },
    /** Apply a patch from outside (the battlefield click): same path as a panel control. */
    set(patch) { commit(patch); },
    /** Show a message in the panel (errors from the sim). */
    error(err) { const el = root.querySelector('#sbError'); if (el) el.textContent = String(err?.stack || err?.message || err); },
    render,
  };
}
