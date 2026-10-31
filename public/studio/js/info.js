// public/studio/js/info.js — a plugin's other tabs in the studio (DESIGN §32.9): 信息 (the basic fields — name, description,
// version, authors, licence, credits for where the art comes from, homepage, who may switch it on: POST …/meta), 文件
// (every file of the folder, the ones nothing uses marked, each removable), 清单 (plugin.json itself, for those who
// prefer to write it — PUT …/manifest; the same checks answer).

import { useEffect, useState } from '../../vendor/hooks.module.js';
import { html, Button } from '../../js/ui/components.js';
import { getLang, t } from '../../../shared/i18n.js';
import { IssueList, issuesAt } from './issues.js';
import { sizeText } from './labels.js';
import { LICENSES } from './create.js';

const cx = (...p) => p.filter(Boolean).join(' ');
const textIn = (v, lang) => (v && typeof v === 'object' ? v[lang] ?? v.zh ?? Object.values(v)[0] ?? '' : typeof v === 'string' ? v : '');

/**
 * The basic fields (see the header).
 * @param {{ state: any, busy: boolean, onSave: (fields: Record<string, unknown>, lang: string) => void, onFix: (issue: any) => void }} props
 */
export function InfoForm({ state, busy, onSave, onFix }) {
  const m = state.manifest || {};
  const lang = /^zh/.test(getLang()) ? 'zh' : 'en';
  const init = () => ({
    name: textIn(m.name, lang), description: textIn(m.description, lang), version: String(m.version ?? ''),
    authors: Array.isArray(m.authors) ? m.authors.join(', ') : String(m.authors ?? ''), license: String(m.license ?? ''),
    credits: String(m.credits ?? ''), homepage: String(m.homepage ?? ''),
    room: Array.isArray(m.scope) ? m.scope.includes('room') : true, personal: Array.isArray(m.scope) ? m.scope.includes('personal') : true,
  });
  const [f, setF] = useState(init);
  const [was, setWas] = useState(init);
  useEffect(() => { const v = init(); setF(v); setWas(v); }, [state.text]);
  const set = (k) => (e) => setF({ ...f, [k]: e.currentTarget.type === 'checkbox' ? e.currentTarget.checked : e.currentTarget.value });
  const fieldsOf = (v) => ({
    name: v.name, description: v.description, version: v.version, authors: v.authors, license: v.license, credits: v.credits, homepage: v.homepage,
    scope: [...(v.room ? ['room'] : []), ...(v.personal ? ['personal'] : [])],
  });
  // only the fields the author changed: a name shown from another language is not written into this one, and a version
  // that is not right yet does not hold back the other fields
  const save = () => {
    const now = fieldsOf(f);
    const before = fieldsOf(was);
    onSave(Object.fromEntries(Object.entries(now).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(before[k]))), lang);
  };
  const at = (k) => issuesAt(state.check.issues, { at: [k] });
  const row = (k, label, input, hint = '') => html`<div class="st-field-row">
    <span>${label}</span>${input}${hint ? html`<small>${hint}</small>` : null}
    <${IssueList} issues=${at(k)} onFix=${onFix} busy=${busy} compact=${true} />
  </div>`;
  return html`<div class="st-form" data-testid="info-form">
    ${row('name', t('名字'), html`<input class="st-input" value=${f.name} maxLength="60" onInput=${set('name')} />`)}
    ${row('description', t('简介'), html`<textarea class="st-input" rows="3" maxLength="500" onInput=${set('description')}>${f.description}</textarea>`)}
    ${row('version', t('版本'), html`<input class="st-input" value=${f.version} maxLength="40" onInput=${set('version')} />`, t('三段数字，每次发布前调大，例如 1.0.1'))}
    ${row('authors', t('作者'), html`<input class="st-input" value=${f.authors} maxLength="300" onInput=${set('authors')} />`, t('多个作者用逗号分开'))}
    ${row('license', t('许可证'), html`<span class="st-inline">
      <input class="st-input" list="st-licenses" value=${f.license} maxLength="100" onInput=${set('license')} />
      <datalist id="st-licenses">${LICENSES.filter(Boolean).map((l) => html`<option value=${l} />`)}</datalist></span>`, t('别人能怎样使用你的素材，例如 CC-BY-4.0（署名即可转载）'))}
    ${row('credits', t('素材来源'), html`<textarea class="st-input" rows="2" maxLength="500" onInput=${set('credits')}>${f.credits}</textarea>`, t('谁画的、从哪里来；用了别人的作品请写明出处'))}
    ${row('homepage', t('主页'), html`<input class="st-input" value=${f.homepage} maxLength="300" onInput=${set('homepage')} placeholder="https://" />`)}
    ${row('scope', t('谁能开启'), html`<span class="st-inline">
      <label class="st-check"><input type="checkbox" checked=${f.room} onChange=${set('room')} /> ${t('房主给整个房间开')}</label>
      <label class="st-check"><input type="checkbox" checked=${f.personal} onChange=${set('personal')} /> ${t('玩家在设置里只给自己开')}</label></span>`)}
    <div class="st-form__actions"><${Button} variant="primary" onClick=${save} loading=${busy} disabled=${!f.room && !f.personal} data-testid="info-save">${t('保存信息')}<//></div>
  </div>`;
}

/**
 * The modules of a manifest 3 (Keel, N2 studio C): kind / entry / files / permissions, add, remove, reorder. Deeper
 * module fields (content parts, provides/consumes, slots, assets) stay in the Manifest tab's JSON, which saves through
 * the same validation. `onSave(modules)` posts the whole list to POST /modules.
 * @param {{ state: any, busy: boolean, onSave: (modules: any[]) => void }} props
 */
export function KeelModules({ state, busy, onSave }) {
  const KINDS = ['content', 'asset', 'sim', 'match', 'policy', 'ui', 'lang'];
  const listOf = () => (Array.isArray(state.manifest?.modules) ? state.manifest.modules : []).map((m) => ({ ...m }));
  const [rows, setRows] = useState(listOf);
  const [was, setWas] = useState(() => JSON.stringify(listOf()));
  const [open, setOpen] = useState(-1);
  const [raw, setRaw] = useState({});
  const [err, setErr] = useState('');
  useEffect(() => { const v = listOf(); setRows(v); setWas(JSON.stringify(v)); setOpen(-1); setRaw({}); setErr(''); }, [state.text]);
  const change = (n, patch) => setRows(rows.map((m, i) => (i === n ? { ...m, ...patch } : m)));
  const csv = (v) => (Array.isArray(v) ? v.join(', ') : '');
  const list = (v) => String(v).split(/[,，\n]/).map((x) => x.trim()).filter(Boolean);
  const move = (n, d) => {
    const next = [...rows];
    const [x] = next.splice(n, 1);
    next.splice(n + d, 0, x);
    setRows(next);
  };
  const jsonText = (n, key) => {
    const k = `${n}:${key}`;
    if (Object.hasOwn(raw, k)) return raw[k];
    return rows[n]?.[key] === undefined ? '' : JSON.stringify(rows[n][key], null, 2);
  };
  const setJson = (n, key, text) => {
    const k = `${n}:${key}`;
    setRaw({ ...raw, [k]: text });
    try {
      change(n, { [key]: text.trim() ? JSON.parse(text) : undefined });
      setErr('');
    } catch { setErr(`${key}：不是有效 JSON`); }
  };
  const providers = new Map();
  for (const [n, m] of rows.entries()) for (const ref of m.provides ?? []) providers.set(ref, n);
  const consumers = [];
  for (const [n, m] of rows.entries()) for (const ref of m.consumes ?? []) consumers.push({ ref, n });
  for (const id of Object.keys(state.manifest?.requires ?? {})) consumers.push({ ref: `plugin:${id}`, n: -1 });
  const dirty = JSON.stringify(rows) !== was;
  const field = (label, input) => html`<label class="st-field-row"><span>${label}</span>${input}</label>`;
  const jsonField = (n, key, label) => field(label, html`<textarea class="st-input st-code" rows="3" value=${jsonText(n, key)} disabled=${busy} onInput=${(e) => setJson(n, key, e.currentTarget.value)}></textarea>`);
  return html`<div class="st-form" data-testid="keel-modules">
    <h3 class="st-subhead">${t('Keel 模块')}</h3>
    <p class="st-note">${t('清单 3 的模块：种类、入口、文件、能力；「编辑」打开该模块的字段（content parts、provides/consumes、ui slots、asset assets、state）。')}</p>
    <table class="st-table">
      <thead><tr><th>${t('种类')}</th><th>${t('入口')}</th><th>${t('文件')}</th><th>${t('能力')}</th><th></th></tr></thead>
      <tbody>${rows.map((m, n) => [
        html`<tr key=${n}>
          <td><select class="st-input" value=${m.kind} disabled=${busy} onChange=${(e) => change(n, { kind: e.currentTarget.value })}>
            ${KINDS.map((k) => html`<option value=${k} selected=${m.kind === k}>${k}</option>`)}</select></td>
          <td><input class="st-input" value=${m.entry || ''} disabled=${busy} placeholder="sim/index.js" onInput=${(e) => change(n, { entry: e.currentTarget.value.trim() || undefined })} /></td>
          <td><input class="st-input" value=${csv(m.files)} disabled=${busy} placeholder="content/a.json, content/b.json" onInput=${(e) => change(n, { files: list(e.currentTarget.value) })} /></td>
          <td><input class="st-input" value=${csv(m.permissions)} disabled=${busy} placeholder="sim.read, sim.spawn" onInput=${(e) => change(n, { permissions: list(e.currentTarget.value) })} /></td>
          <td class="st-inline">
            <button type="button" class="st-link-btn" disabled=${busy} onClick=${() => setOpen(open === n ? -1 : n)}>${open === n ? t('收起') : t('编辑')}</button>
            <button type="button" class="st-link-btn" disabled=${busy || n === 0} onClick=${() => move(n, -1)} aria-label=${t('上移')}>↑</button>
            <button type="button" class="st-link-btn" disabled=${busy || n === rows.length - 1} onClick=${() => move(n, 1)} aria-label=${t('下移')}>↓</button>
            <button type="button" class="st-link-btn is-danger" disabled=${busy} onClick=${() => setRows(rows.filter((_, i) => i !== n))}>${t('删除')}</button>
          </td>
        </tr>`,
        open === n ? html`<tr key=${`e${n}`}><td colSpan="5">
          <div class="st-form" data-testid="keel-module-fields">
            ${m.kind === 'content' ? jsonField(n, 'parts', t('content parts（part → 文件列表）')) : null}
            ${m.kind === 'asset' ? jsonField(n, 'assets', t('asset assets（覆盖对象）')) : null}
            ${m.kind === 'sim' || m.kind === 'match' || m.kind === 'policy' ? jsonField(n, 'state', t('模块 state')) : null}
            ${field(t('provides（逗号分隔）'), html`<input class="st-input" value=${csv(m.provides)} disabled=${busy} placeholder="enemy:enemy_x_demo" onInput=${(e) => change(n, { provides: list(e.currentTarget.value) })} />`)}
            ${field(t('consumes（逗号分隔）'), html`<input class="st-input" value=${csv(m.consumes)} disabled=${busy} placeholder="enemy:enemy_x_other" onInput=${(e) => change(n, { consumes: list(e.currentTarget.value) })} />`)}
            ${m.kind === 'ui' ? field(t('slots（逗号分隔）'), html`<input class="st-input" value=${csv(m.slots)} disabled=${busy} placeholder="hud.right" onInput=${(e) => change(n, { slots: list(e.currentTarget.value) })} />`) : null}
            ${field(t('notes'), html`<input class="st-input" value=${m.notes || ''} disabled=${busy} onInput=${(e) => change(n, { notes: e.currentTarget.value || undefined })} />`)}
          </div>
        </td></tr>` : null,
      ])}</tbody>
    </table>
    ${err ? html`<pre class="st-error">${err}</pre>` : null}
    <div class="st-form__actions">
      <${Button} variant="secondary" icon="plus" disabled=${busy} onClick=${() => setRows([...rows, { kind: 'content', files: [], permissions: [] }])}>${t('添加模块')}<//>
      <${Button} variant="primary" disabled=${busy || !dirty} onClick=${() => onSave(rows)} data-testid="keel-modules-save">${t('保存模块')}<//>
    </div>
    <div data-testid="keel-graph">
      <h4 class="st-subhead">${t('provides / consumes')}</h4>
      <ul class="st-note">
        ${[...providers.entries()].map(([ref, n]) => html`<li key=${`p:${ref}`}><code>${ref}</code> ← ${rows[n]?.kind}${t('（提供）')}</li>`)}
        ${consumers.map((c) => {
          const ok = providers.has(c.ref);
          return html`<li key=${`c:${c.ref}:${c.n}`} class=${cx(!ok && 'is-bad')}><code>${c.ref}</code> ${ok ? `→ ${rows[providers.get(c.ref)]?.kind ?? ''}` : t('（没有模块提供）')}</li>`;
        })}
      </ul>
    </div>
  </div>`;
}


/**
 * The folder's files (see the header).
 * @param {{ state: any, busy: boolean, onRemove: (rel: string) => void, onFix: (issue: any) => void }} props
 */
export function FileList({ state, busy, onRemove, onFix }) {
  return html`<div class="st-files" data-testid="file-list">
    <table class="st-table">
      <thead><tr><th>${t('文件')}</th><th>${t('大小')}</th><th>${t('用途')}</th><th></th></tr></thead>
      <tbody>${state.files.map((f) => html`<tr key=${f.rel} class=${cx(!f.used && 'is-unused')}>
        <td><code>${f.rel}</code><${IssueList} issues=${issuesAt(state.check.issues, { file: f.rel })} onFix=${onFix} busy=${busy} compact=${true} /></td>
        <td class="num">${sizeText(f.bytes)}</td>
        <td>${f.rel === 'plugin.json' || f.rel === 'plugin.keel.json' ? t('清单') : f.rel === 'plugin.lock.json' ? t('锁文件（打包生成）') : f.kind === 'doc' ? t('说明文档') : f.used ? t('在用') : t('没用到')}</td>
        <td>${f.rel !== 'plugin.json' && f.rel !== 'plugin.keel.json' ? html`<button type="button" class="st-link-btn is-danger" disabled=${busy} onClick=${() => onRemove(f.rel)}>${t('删除')}</button>` : null}</td>
      </tr>`)}</tbody>
    </table>
    <p class="st-note">${t('一共 {n} 个文件，{size}。插件文件夹里只放插件用到的文件；不要放官方游戏的文件。', { n: state.files.length, size: sizeText(state.bytes) })}</p>
  </div>`;
}

/**
 * plugin.json itself (see the header).
 * @param {{ state: any, busy: boolean, onSave: (text: string) => void }} props
 */
export function ManifestEditor({ state, busy, onSave }) {
  const [text, setText] = useState(state.text || '');
  const [bad, setBad] = useState('');
  useEffect(() => { setText(state.text || ''); setBad(''); }, [state.text]);
  const save = () => {
    try { JSON.parse(text); } catch (e) { setBad(String(e?.message || e)); return; }
    setBad('');
    onSave(text);
  };
  return html`<div class="st-manifest" data-testid="manifest-editor">
    <p class="st-note">${t('高级：直接编辑 {file}。字段说明见 docs/keel/MANIFEST-V3.md；保存时校验 manifest 3 与模块图。', { file: state.manifestFile || 'plugin.json' })}</p>
    <textarea class="st-input st-code" spellcheck="false" rows="22" value=${text} onInput=${(e) => setText(e.currentTarget.value)}></textarea>
    ${bad ? html`<pre class="st-error">${t('不是有效的 JSON：{why}', { why: bad })}</pre>` : null}
    <div class="st-form__actions"><${Button} variant="primary" onClick=${save} loading=${busy} disabled=${text === state.text}>${t('保存清单')}<//></div>
  </div>`;
}
