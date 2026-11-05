// public/dev/sandbox/panels.js — the scenario panel of the admin sandbox: operator/skill/loadout, the deploy tile, the
// spawn groups, the map/wave and the global multipliers. Plain DOM + event delegation (no framework); every change
// updates the panel's own state and calls back so the caller can rebuild the battle and rewrite the URL.
//
// The catalogs come from the loaded data files (public/dev/sandbox.js): operators are deduped by charId (a 自选 pick is
// a charId + skill + module, not a chess row), enemies/stages/waves are the raw records.

import { DIFFICULTIES, DIRS, autoPlace, cleanGroup } from './state.js';

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
  let tab = 'op';
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
    const more = list.length > opLimit ? `<button type="button" class="sb-more" data-more="op">展开另外 ${list.length - opLimit} 个 …</button>` : '';
    return `${rows}${more}`;
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
    const pts = [...legal].map((k) => k.split(',').map(Number));
    if (!pts.length) return '<p class="sb-dim">这张地图没有普通部署格</p>';
    const minR = Math.max(0, Math.min(...pts.map((p) => p[0])) - 1);
    const maxR = Math.min(rows - 1, Math.max(...pts.map((p) => p[0])) + 1);
    const minC = Math.max(0, Math.min(...pts.map((p) => p[1])) - 1);
    const maxC = Math.min(cols - 1, Math.max(...pts.map((p) => p[1])) + 1);
    const cur = state.row != null && state.col != null ? `${state.row},${state.col}` : null;
    let out = '';
    for (let r = minR; r <= maxR; r++) {
      out += '<div class="sb-tile-row">';
      for (let c = minC; c <= maxC; c++) {
        const k = `${r},${c}`;
        const cls = `sb-tile${legal.has(k) ? ' is-legal' : ''}${cur === k ? ' is-on' : ''}`;
        out += `<button type="button" class="${cls}" data-tile="${k}" ${legal.has(k) ? '' : 'tabindex="-1"'} title="${k}"></button>`;
      }
      out += '</div>';
    }
    return `<div class="sb-tiles">${out}
      <div class="sb-tiles__foot"><span>行 ${minR}–${maxR} · 列 ${minC}–${maxC}</span><span>${cur ? `当前 <i>${cur}</i>` : '自动选格'}</span></div>
    </div>`;
  };

  const routeOptions = (sel) => {
    const w = wave();
    return (w?.routes ?? []).map((r, i) => {
      const start = Array.isArray(r?.start) ? `${r.start[0]},${r.start[1]}` : '?';
      return `<option value="${i}"${i === sel ? ' selected' : ''}>#${i} ${esc(r?.motion || 'WALK')} · ${esc(start)}</option>`;
    }).join('');
  };

  // ---- boss ----------------------------------------------------------------------------------------------------
  const boss = () => (state.boss ? catalogs.bosses.find((b) => b.id === state.boss) ?? null : null);
  const bossBaseHp = (b, diff) => Number(b?.bloodPoint?.[diff]) || Number(Object.values(b?.bloodPoint ?? {})[0]) || 0;
  const bossTemplate = (b, diff) => b?.templates?.[`mode_multi_${String(diff).toLowerCase()}`]?.template
    ?? Object.values(b?.templates ?? {})[0]?.template ?? null;

  // ---- team ----------------------------------------------------------------------------------------------------
  const skillOptions = (charId, sel) => {
    const o = opById.get(charId);
    return (o?.skills ?? []).map((sk) => `<option value="${sk.index}"${sk.index === sel ? ' selected' : ''}>S${sk.index + 1} ${esc(sk.name || '')}</option>`).join('');
  };
  const teamHtml = () => {
    if (!state.team.length) return '<p class="sb-dim">只有一名干员。可以再添加最多 3 名队友，各自选技能。</p>';
    return state.team.map((m, i) => `
      <div class="sb-member" data-m="${i}">
        <select data-tm="unit" title="队友干员">${catalogs.operators.map((o) => `<option value="${esc(o.charId)}"${o.charId === m.unit ? ' selected' : ''}>${esc(o.name)}</option>`).join('')}</select>
        <select data-tm="skill" title="技能">${skillOptions(m.unit, m.skill)}</select>
        <span class="sb-dim">${m.row != null ? `${m.row},${m.col}` : '自动'}</span>
        <button type="button" class="sb-x" data-delmember="${i}" title="移除">✕</button>
      </div>`).join('');
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
      <button type="button" class="sb-li" data-enemy="${esc(e.key)}" title="点击添加一组：${esc(e.key)}">
        <b>${esc(e.name)}</b>
        <span class="sb-dim">${e.rank ? `${esc(e.rank)} · ` : ''}HP ${nf(e.maxHp)} · ATK ${nf(e.atk)}${e.isFly ? ' · 飞行' : ''}</span>
      </button>`).join('');
    const more = list.length > enemyLimit ? `<button type="button" class="sb-more" data-more="enemy">展开另外 ${list.length - enemyLimit} 个 …</button>` : '';
    return `${rows}${more}`;
  };
  const groupsHtml = () => {
    if (!state.groups.length) return '<p class="sb-dim">默认：沿波次路线持续刷出该波次的步兵（18 个）。</p>';
    return state.groups.map((g, i) => `
      <div class="sb-group" data-g="${i}">
        <div class="sb-group__head"><b>${esc(enemyByKey.get(g.key)?.name || g.key)}</b>
          <span>${esc(g.key)}</span><button type="button" class="sb-x" data-del="${i}" title="移除">✕</button></div>
        <label><span>数量</span><input type="number" min="1" max="50" step="1" data-gi="count" value="${g.count}"></label>
        <label><span>间隔</span><input type="number" min="0" max="60" step="0.1" data-gi="interval" value="${g.interval}"></label>
        <label><span>起始</span><input type="number" min="0" max="600" step="0.5" data-gi="time" value="${g.time}"></label>
        <label><span>路线</span><select data-gi="route">${routeOptions(g.route)}</select></label>
        <label><span>HP×</span><input type="number" min="0.1" max="100" step="0.1" data-gi="hp" value="${g.hp}"></label>
        <label><span>ATK×</span><input type="number" min="0.1" max="100" step="0.1" data-gi="atk" value="${g.atk}"></label>
      </div>`).join('');
  };

  // ---- tabs ---------------------------------------------------------------------------------------------------
  const blocker = (html, hint) => `<div class="sb-block">${html}${hint ? `<p class="sb-note">${hint}</p>` : ''}</div>`;

  const opTab = () => `
    ${blocker(`<div class="sb-searchrow"><h2 class="micro">干员</h2><span class="sb-count">${opMatches().length} / ${catalogs.operators.length}</span></div>
      <div class="sb-searchrow"><input type="search" class="sb-search" data-search="op" placeholder="搜索名称 / 职业 / charId" value="${esc(filter.op)}"></div>
      <div class="sb-list" data-list="op">${opListHtml()}</div>`)}
    ${blocker(`<h2 class="micro">技能</h2><div class="sb-chips">${skillHtml()}</div>`)}
    ${blocker(`<h2 class="micro">练度</h2>
      <div class="sb-grid2">
        <label><span>形态</span><select data-field="elite">
          <option value="1"${state.elite ? ' selected' : ''}>精英二 E2</option>
          <option value="0"${state.elite ? '' : ' selected'}>精英一 E1</option></select></label>
        <label><span>潜能</span><select data-field="potential">${[1, 2, 3, 4, 5, 6].map((p) => `<option value="${p}"${p === state.potential ? ' selected' : ''}>${p}</option>`).join('')}</select></label>
        <label><span>练度</span><select data-field="cultivate">${[0, 1, 2, 3].map((c) => `<option value="${c}"${c === state.cultivate ? ' selected' : ''}>${c}</option>`).join('')}</select></label>
        <label><span>模组</span>${moduleHtml()}</label>
      </div>`)}
    ${blocker(`<h2 class="micro">队伍 <span>${state.team.length + 1} / 4</span></h2>
      <div class="sb-team">${teamHtml()}</div>
      <div class="sb-rowbtns" style="margin-top:7px"><button type="button" class="sb-btn" data-addmember="1"${state.team.length >= 3 ? ' disabled' : ''}>+ 添加当前干员</button></div>`,
    '队友默认精英二、潜能 6、无模组；位置自动避开已占格。')}
    ${blocker(`<h2 class="micro">部署 <span>${state.row != null ? `${state.row},${state.col}` : '自动'}</span></h2>
      ${tileHtml()}
      <div class="sb-grid2" style="margin-top:8px">
        <label><span>朝向</span><select data-field="dir">${DIRS.map((d) => `<option value="${d}"${d === state.dir ? ' selected' : ''}>${d}</option>`).join('')}</select></label>
        <button type="button" class="sb-btn" data-auto="tile">自动选格</button>
      </div>`)}`;

  const foeTab = () => `
    ${blocker(`<label class="sb-switch"><input type="checkbox" data-field="foes"${state.foes ? ' checked' : ''}> 刷出敌人</label>
      <div class="sb-searchrow"><h2 class="micro">敌人</h2><span class="sb-count">${enemyMatches().length} / ${catalogs.enemies.length}</span></div>
      <div class="sb-searchrow"><input type="search" class="sb-search" data-search="enemy" placeholder="搜索名称 / key" value="${esc(filter.enemy)}"></div>
      <div class="sb-list" data-list="enemy">${enemyListHtml()}</div>`)}
    ${blocker(`<h2 class="micro">编组 <span>${state.groups.length} 组</span></h2>
      <div class="sb-groups">${groupsHtml()}</div>
      <div class="sb-rowbtns"><button type="button" class="sb-btn" data-preset="wave">载入原波次</button>
      <button type="button" class="sb-btn" data-preset="clear">清空（默认步兵流）</button></div>`, '点上面的敌人 = 新增一组；改组内数值会立即重建战斗。')}`;

  const bossTab = () => {
    const b = boss();
    const diff = state.bossDifficulty;
    const baseHp = b ? bossBaseHp(b, diff) : 0;
    const tpl = b ? bossTemplate(b, diff) : null;
    return `
      ${blocker(`<h2 class="micro">BOSS</h2>
        <label class="sb-field"><span class="micro">目标</span>
          <select data-field="boss"><option value="">无（普通战斗）</option>${catalogs.bosses.map((x) => `<option value="${esc(x.id)}"${x.id === state.boss ? ' selected' : ''}>${esc(x.name)} · ${esc(x.id)}</option>`).join('')}</select>
        </label>
        <div class="sb-grid2" style="margin-top:8px">
          <label><span>难度</span><select data-field="bossDifficulty">${DIFFICULTIES.map((d) => `<option value="${d}"${d === diff ? ' selected' : ''}>${d}</option>`).join('')}</select></label>
          <label><span>血池×</span><input type="number" min="0.001" max="100" step="0.01" data-field="bossHpMul" value="${state.bossHpMul}"></label>
        </div>`)}
      ${b ? blocker(`<div class="sb-boss">
          <div class="sb-boss__name">${esc(b.name)}</div>
          <dl class="sb-boss__dl">
            <dt>敌方</dt><dd>${esc(b.enemyKey)}</dd>
            <dt>基础血池</dt><dd>${nf(baseHp)}</dd>
            <dt>实际血池</dt><dd>${nf(Math.round(baseHp * state.bossHpMul))}</dd>
            <dt>波次模板</dt><dd>${esc(tpl || '—')}</dd>
          </dl>
          <div class="sb-rowbtns" style="margin-top:8px"><button type="button" class="sb-btn" data-boss-wave="1">载入该 BOSS 波次</button></div>
        </div>`, '领袖按 enemyKey 刷出，护卫来自模板波次；右上角的 BOSS 血池就是这一条。') : blocker('<p class="sb-dim">选一个 BOSS 会自动带出它的模板波次与护卫。</p>')}`;
  };

  const mapTab = () => `
    ${blocker(`<h2 class="micro">地图 / 波次</h2>
      <label class="sb-field"><span class="micro">地图</span>
        <select data-field="stage">${catalogs.stages.map((s) => `<option value="${esc(s.id)}"${s.id === state.stage ? ' selected' : ''}>${esc(s.name || s.id)}</option>`).join('')}</select></label>
      <label class="sb-field" style="margin-top:8px"><span class="micro">波次</span>
        <select data-field="wave">${catalogs.waves.map((w) => `<option value="${esc(w.id)}"${w.id === state.wave ? ' selected' : ''}>${esc(w.id)}${w.kind === 'boss' ? ' · BOSS' : ''}${w.bossId ? ` · ${esc(w.bossId)}` : ''}</option>`).join('')}</select></label>
      <label class="sb-switch" style="margin-top:10px"><input type="checkbox" data-field="mix"${state.mix ? ' checked' : ''}> 整波刷出（?mix=1）</label>`)}
    ${blocker(`<h2 class="micro">路线 <span>${(wave()?.routes ?? []).length} 条</span></h2>
      <ul class="sb-routes">${(wave()?.routes ?? []).map((r, i) => {
        const a = Array.isArray(r?.start) ? r.start.join(',') : '?';
        const b = Array.isArray(r?.end) ? r.end.join(',') : '?';
        return `<li><i>#${i}</i> ${esc(r?.motion || 'WALK')}<span>${esc(a)} → ${esc(b)}</span></li>`;
      }).join('') || '<li class="sb-dim">这个波次没有路线</li>'}</ul>`,
    `地图 ${esc(stage()?.name || state.stage)} · 合法部署格 ${legalTiles().size} 个`)}`;

  const globalTab = () => `
    ${blocker(`<h2 class="micro">数值</h2>
      <div class="sb-grid2">
        <label><span>敌人 HP×</span><input type="number" min="0.1" max="100" step="0.5" data-field="hp" value="${state.hp}"></label>
        <label><span>敌人 ATK×</span><input type="number" min="0.1" max="100" step="0.5" data-field="atk" value="${state.atk}"></label>
        <label><span>随机种子</span><input type="number" min="1" step="1" data-field="seed" value="${state.seed}"></label>
      </div>`)}
    ${blocker(`<h2 class="micro">说明</h2>
      <p class="sb-note">同一种子 + 同一场景永远得到同一次战斗；每次改参数都会从 0 秒重建。速度与单步在底部工具栏。</p>`,
    `管理员入口 <code>/admin/sandbox?token=…</code>`)}`;

  const TABS = [['op', '干员'], ['foe', '敌人'], ['boss', 'BOSS'], ['map', '地图'], ['global', '全局']];

  function render() {
    const o = op();
    const nowSkill = o?.skills.find((s) => s.index === state.skill);
    root.innerHTML = `
      <header class="sb-head">
        <div class="sb-head__meta"><span class="micro">Tactical Workbench</span><b>·</b><span class="micro">Admin</span></div>
        <h1>沙盒 <span>战术演练</span></h1>
        <div class="sb-head__now"><b>${esc(o?.name || state.unit)}</b><i>${SKILL_LABEL(state.skill)}${nowSkill?.name ? ` ${esc(nowSkill.name)}` : ''}</i>
          <em>${esc(stage()?.name || state.stage)} / ${esc(state.wave)}</em></div>
      </header>
      <nav class="sb-tabs">${TABS.map(([k, label]) => `<button type="button" data-tab="${k}" class="${tab === k ? 'is-on' : ''}">${label}</button>`).join('')}</nav>
      <div class="sb-body">
        ${tab === 'op' ? opTab() : tab === 'foe' ? foeTab() : tab === 'boss' ? bossTab() : tab === 'map' ? mapTab() : globalTab()}
        <div class="sb-err" id="sbError"></div>
      </div>`;
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
    if (t.matches('[data-tm]')) {
      const row = t.closest('[data-m]');
      const i = Number(row?.dataset.m);
      const m = state.team[i];
      if (!m) return;
      const f = t.dataset.tm;
      const patch = { [f]: f === 'skill' ? Number(t.value) : t.value };
      if (f === 'unit') {
        const idx = (opById.get(t.value)?.skills ?? []).map((s) => s.index);
        patch.skill = idx.includes(m.skill) ? m.skill : (idx[0] ?? 0);
      }
      commit({ team: state.team.map((x, k) => (k === i ? { ...x, ...patch } : x)) });
      return;
    }
    if (t.matches('[data-field]')) {
      const f = t.dataset.field;
      const v = t.type === 'checkbox' ? t.checked
        : t.type === 'number' ? Number(t.value)
          : f === 'elite' ? t.value === '1' : t.value;
      const patch = { [f]: f === 'module' && v === '' ? null : v };
      if (f === 'stage') { patch.row = null; patch.col = null; }
      if (f === 'boss') {
        const b = v ? catalogs.bosses.find((x) => x.id === v) : null;
        const tpl = b ? bossTemplate(b, state.bossDifficulty) : null;
        if (tpl) patch.wave = tpl;
      }
      if (f === 'bossDifficulty' && state.boss) {
        const tpl = bossTemplate(boss(), v);
        if (tpl) patch.wave = tpl;
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
    }
  });

  root.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t || !root.contains(t)) return;
    if (t.dataset.tab) { tab = t.dataset.tab; render(); return; }
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
    if (t.dataset.addmember) {
      if (state.team.length >= 3) return;
      commit({ team: [...state.team, { unit: state.unit, skill: state.skill, row: null, col: null, dir: state.dir }] });
      return;
    }
    if (t.dataset.delmember != null) {
      const i = Number(t.dataset.delmember);
      commit({ team: state.team.filter((_, k) => k !== i) });
      return;
    }
    if (t.dataset.bossWave) {
      const tpl = bossTemplate(boss(), state.bossDifficulty);
      if (tpl) commit({ wave: tpl, mix: false });
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
