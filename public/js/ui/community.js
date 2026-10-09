// Lobby community panels (docs/MATCHMAKING.md §36):
//   · 更新日志  — the persisted changelog (server/community.js), read from GET /community/api/changelog (newest first);
//   · bug提交   — a player bug report: a title + a description + up to BUG_IMAGES_MAX images. The images upload one by
//                 one to POST /community/api/bug/upload (raw bytes, magic-byte checked), then the report itself goes over
//                 the WebSocket (`bug.report`, shared/protocol.js) so it carries the session's account / guest identity.
//   · 公开房间  — a full-screen directory (screens/rooms.js), not a panel here: the lobby's 公开房间 button swaps it in
//                 for the lobby body (screens/lobby.js).
// 玩家留言 (the guestbook) is deliberately NOT here: the owner dropped it.
//
// Text goes through t(); module-level tables hold msgids (N_).

import { useEffect, useRef, useState } from '../../vendor/hooks.module.js';
import { html, Button, Icon, MicroLabel } from './components.js';
import { toast, toastError } from './toasts.js';
import { net } from '../net.js';
import { t } from '../../../shared/i18n.js';
import { BUG_TITLE_MAX, BUG_BODY_MAX, BUG_IMAGES_MAX, BUG_IMAGE_MAX_BYTES, BUG_IMAGE_MIMES } from '../../../shared/constants.js';

/** The panel ids the bar opens. */
export const COMMUNITY_PANELS = Object.freeze(['changelog', 'bug', 'rooms']);

/**
 * The lobby's left-side community buttons: 更新日志 / bug提交 / 公开房间.
 * @param {{ onOpen: (panel: string) => void }} props
 */
export function CommunityBar({ onOpen }) {
  return html`<div class="lobby-tools">
    <button type="button" class="lobby-tool" onClick=${() => onOpen('changelog')}>
      <${Icon} name="book" /><span>${t('更新日志')}</span>
    </button>
    <button type="button" class="lobby-tool" onClick=${() => onOpen('bug')}>
      <${Icon} name="edit" /><span>${t('bug提交')}</span>
    </button>
    <button type="button" class="lobby-tool" onClick=${() => onOpen('rooms')}>
      <${Icon} name="users" /><span>${t('公开房间')}</span>
    </button>
  </div>`;
}

/** A modal shell shared by the three panels (same chrome as the lobby's 在线 overlay). */
function Modal({ title, en, onClose, children }) {
  return html`<div class="online-modal" onClick=${(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div class="online-modal__card brackets">
      <div class="online-modal__head">
        <div class="online-modal__title"><${MicroLabel} tone="mint">${en}<//><h2>${title}</h2></div>
        <button type="button" class="online-modal__close" onClick=${onClose} aria-label=${t('关闭')}><${Icon} name="close" /><//>
      </div>
      ${children}
    </div>
  </div>`;
}

/** ① 更新日志: the persisted changelog, newest first (version, date, markdown body as plain text). */
export function ChangelogOverlay({ onClose }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    let alive = true;
    fetch('/community/api/changelog', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null)).then((j) => { if (alive) setData(j); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  const list = (data && Array.isArray(data.changelog) ? data.changelog : []);
  return html`<${Modal} title=${t('更新日志')} en="CHANGELOG" onClose=${onClose}>
    <div class="changelog-list">
      ${list.length ? list.map((e) => html`<article class="changelog-item" key=${e.id}>
        <header><b class="num">${e.version}</b><time class="num">${e.released_at ? new Date(e.released_at).toISOString().slice(0, 10) : ''}</time></header>
        <div class="changelog-body">${e.body}</div>
      </article>`) : html`<div class="online-modal__empty">${data ? t('暂无更新日志') : t('加载中…')}</div>`}
    </div>
  <//>`;
}

/** POST one image's raw bytes; resolves `{ id, mime, bytes }`. */
async function uploadImage(file) {
  const headers = { 'Content-Type': file.type || 'application/octet-stream' };
  if (net.accountToken) headers['X-Account-Token'] = net.accountToken;
  const r = await fetch('/community/api/bug/upload', { method: 'POST', headers, body: file });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || `HTTP ${r.status}`), { code: j.error });
  return j;
}

/** ② bug提交: title + description + ≤ BUG_IMAGES_MAX images (uploaded first, then the report over the socket). */
export function BugReportOverlay({ onClose }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  /** @type {[Array<{ file: File, url: string, id: number|null }>, Function]} */
  const [images, setImages] = useState([]);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  const imagesRef = useRef(images);
  imagesRef.current = images;
  useEffect(() => () => { for (const im of imagesRef.current) URL.revokeObjectURL(im.url); }, []);

  const addFiles = (files) => {
    const list = [...files];
    setImages((cur) => {
      const next = [...cur];
      for (const file of list) {
        if (next.length >= BUG_IMAGES_MAX) { toast(t('最多 {n} 张图片', { n: BUG_IMAGES_MAX }), 'warn'); break; }
        if (!BUG_IMAGE_MIMES.includes(file.type)) { toast(t('不支持的图片格式'), 'warn'); continue; }
        if (file.size > BUG_IMAGE_MAX_BYTES) { toast(t('图片过大'), 'warn'); continue; }
        next.push({ file, url: URL.createObjectURL(file), id: null });
      }
      return next;
    });
  };
  const removeAt = (i) => {
    setImages((cur) => {
      const im = cur[i];
      if (im) URL.revokeObjectURL(im.url);
      return cur.filter((_, k) => k !== i);
    });
  };
  const submit = async () => {
    const tt = title.trim();
    if (!tt) { toast(t('请填写标题和描述'), 'warn'); return; }
    setBusy(true);
    try {
      const ids = [];
      for (const im of images) {
        const id = im.id || (await uploadImage(im.file)).id;
        ids.push(id);
      }
      await net.request('bug.report', { title: tt, body: body.trim(), images: ids });
      toast(t('提交成功，感谢反馈！'), 'success');
      onClose();
    } catch (err) { toastError(err); } finally { setBusy(false); }
  };

  return html`<${Modal} title=${t('提交 bug')} en="BUG REPORT" onClose=${busy ? () => {} : onClose}>
    <div class="comm-form">
      <label class="comm-field">
        <span class="comm-label">${t('标题')}<em class="num">${title.length}/${BUG_TITLE_MAX}</em></span>
        <input type="text" maxLength=${BUG_TITLE_MAX} value=${title} placeholder=${t('一句话描述问题')}
          onInput=${(e) => setTitle(e.target.value)} />
      </label>
      <label class="comm-field">
        <span class="comm-label">${t('问题描述')}<em class="num">${body.length}/${BUG_BODY_MAX}</em></span>
        <textarea rows="5" maxLength=${BUG_BODY_MAX} value=${body} placeholder=${t('发生了什么？复现步骤越清楚越好')}
          onInput=${(e) => setBody(e.target.value)}></textarea>
      </label>
      <div class="comm-thumbs">
        ${images.map((im, i) => html`<span class="comm-thumb" key=${im.url}>
          <img src=${im.url} alt="" /><button type="button" class="comm-thumb__x" aria-label=${t('移除图片')}
            onClick=${() => removeAt(i)}><${Icon} name="close" /></button>
        </span>`)}
        ${images.length < BUG_IMAGES_MAX ? html`<button type="button" class="comm-add" onClick=${() => fileRef.current?.click()}>
          <${Icon} name="plus" /><span>${t('添加图片（最多 {n} 张）', { n: BUG_IMAGES_MAX })}</span>
        </button>` : null}
      </div>
      <input ref=${fileRef} type="file" class="comm-file" accept="image/png,image/jpeg,image/webp" multiple hidden
        onChange=${(e) => { addFiles(e.target.files || []); e.target.value = ''; }} />
      <div class="comm-note">${t('仅支持 PNG / JPG / WebP，单张不超过 {n} MB', { n: BUG_IMAGE_MAX_BYTES / 1024 / 1024 })}</div>
      <div class="comm-actions">
        <${Button} variant="primary" size="lg" loading=${busy} onClick=${submit}>${busy ? t('正在上传…') : t('提交')}<//>
      </div>
    </div>
  <//>`;
}
