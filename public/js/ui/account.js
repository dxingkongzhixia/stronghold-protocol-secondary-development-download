// ui/account.js — the shared account form + dialog (docs/MATCHMAKING.md §8).
//
// 博士代号 = 账号名, so the form never asks for a name of its own: the caller passes `name` (the title's callsign
// field, or the dialog's own field). Used by the title screen and, as a modal, by the lobby so a guest already in
// the game can upgrade to a real account without losing the session (the server binds the account to the live
// session — see Lobby.bindAccount).
//
// Validation philosophy: the submit button is only disabled when the *name* is unusable or we are offline; a short
// password is refused on click with a toast + a hint, so the button is never silently dead.

import { useEffect, useRef, useState } from '../../vendor/hooks.module.js';
import { AUTH_NAME_MIN, AUTH_NAME_MAX, AUTH_PASS_MIN, AUTH_PASS_MAX, AVATAR_MAX_BYTES } from '../../../shared/constants.js';
import { html, Button, Icon, TextField, RoleTag, AvatarFrame } from './components.js';
import { toast, toastError } from './toasts.js';
import { net } from '../net.js';
import { store, useStore, shallowEqual, savePref } from '../store.js';
import { data, useData } from '../data.js';
import { avatarUrl, seatArtUrl } from './assetUrls.js';
import { ArtPicker } from './artPicker.js';
import { t, N_ } from '../../../shared/i18n.js';

/** Server error code → Chinese message. */
export const AUTH_ERR_TEXT = {
  BAD_NAME: N_('代号需 2–12 个字符'), BAD_PASSWORD: N_('密码至少 6 位'), NAME_TAKEN: N_('该代号已被使用'),
  BAD_CREDENTIALS: N_('代号或密码错误'), SESSION_EXPIRED: N_('登录已过期，请重新登录'),
};

/** Trim + cap like the server (the server re-sanitizes authoritatively). */
const cleanName = (raw) => String(raw ?? '').trim().slice(0, AUTH_NAME_MAX);

/** Clear the stored account session (logout) — and unbind it server-side, freeing the single-session slot. */
export function logoutAccount() {
  net.request('auth.logout').catch(() => {});
  net.setAccountToken(null);
  savePref('authToken', null);
  store.patch('auth', { account: null, error: null });
}

/**
 * The 登录 / 注册 form (tabs + password + submit + hints). The account name comes from `name`.
 * @param {{ name: string, onDone?: () => void }} props
 */
export function AccountForm({ name, onDone }) {
  const auth = useStore((s) => s.auth, shallowEqual);
  const conn = useStore((s) => s.connection, shallowEqual);
  const [mode, setMode] = useState('login');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const online = conn.status === 'online' || conn.status === 'connected';
  const accountName = cleanName(name);
  const nameOk = accountName.length >= AUTH_NAME_MIN && accountName.length <= AUTH_NAME_MAX;
  // Enabled whenever the name is usable and we are online — a short password is answered with a toast, not silence.
  const canSubmit = nameOk && online && !busy;
  // A stale error stops being relevant once the account name is edited.
  useEffect(() => { setError(null); }, [accountName]);
  const fail = (message) => { setError(message); toast(message, 'warn'); };
  const submit = async () => {
    setError(null);
    if (!online) return fail(t('正在连接服务器，请稍候…'));
    if (!nameOk) return fail(t('代号需 {AUTH_NAME_MIN}–{AUTH_NAME_MAX} 个字符', { AUTH_NAME_MIN, AUTH_NAME_MAX }));
    if (pw.length < AUTH_PASS_MIN) return fail(t('密码至少 {AUTH_PASS_MIN} 位', { AUTH_PASS_MIN }));
    setBusy(true);
    try {
      if (mode === 'register') await net.authRegister(accountName, pw);
      else await net.authLogin(accountName, pw);
      setPw('');
      toast(mode === 'register' ? t('注册成功，已登录') : t('登录成功'), 'success');
      onDone?.();
    } catch (err) {
      // Duplicate names get called out explicitly (the server enforces case-insensitive uniqueness).
      const message = err?.code === 'NAME_TAKEN'
        ? t('代号「{accountName}」重名，已被占用 —— 请换一个', { accountName })
        : (t(AUTH_ERR_TEXT[err?.code]) || err?.message || t('登录失败'));
      setError(message);
      toast(message, 'error');
    } finally { setBusy(false); }
  };
  return html`<div class="account-form">
    <div class="account-form__tabs" role="tablist">
      <button type="button" role="tab" aria-selected=${mode === 'login'} class=${mode === 'login' ? 'is-on' : ''} onClick=${() => setMode('login')}>${t('登录')}</button>
      <button type="button" role="tab" aria-selected=${mode === 'register'} class=${mode === 'register' ? 'is-on' : ''} onClick=${() => setMode('register')}>${t('注册')}</button>
    </div>
    <${TextField} size="md" icon="key" type="password" value=${pw} maxLength=${AUTH_PASS_MAX}
      placeholder=${t('密码（≥{AUTH_PASS_MIN} 位）', { AUTH_PASS_MIN })} onInput=${(v) => { setPw(v); if (error) setError(null); }} onEnter=${submit} />
    <${Button} variant="primary" size="lg" block=${true} loading=${busy} disabled=${!canSubmit} onClick=${submit}>${mode === 'register' ? t('注册并进入') : t('登录并进入')}<//>
    ${error ? html`<span class="account-form__err">${error}</span>`
      : (auth?.error ? html`<span class="account-form__err">${t(AUTH_ERR_TEXT[auth.error]) || auth.error}</span>` : null)}
    <span class="account-form__hint">${!nameOk
      ? t('请填写 {AUTH_NAME_MIN}–{AUTH_NAME_MAX} 个字符的代号', { AUTH_NAME_MIN, AUTH_NAME_MAX })
      : (pw.length >= AUTH_PASS_MIN ? t('代号即账号名 · 登录后可参与「搜寻队友」野排') : t('密码至少 {AUTH_PASS_MIN} 位', { AUTH_PASS_MIN }))}</span>
  </div>`;
}

/** The logged-in summary + 退出 (shared by the title panel and the dialog). */
export function AccountWho({ account }) {
  return html`<div class="account-who">
    <${AvatarFrame} size="sm" src=${avatarUrl(account.avatar)} name=${account.name} seat=${0} self=${true} />
    <span class="account-who__line"><${Icon} name="user" />${t('已登录 ·')} <b>${account.name}</b><${RoleTag} role=${account.role} /></span>
    <${Button} variant="secondary" onClick=${logoutAccount}>${t('退出登录')}<//>
  </div>`;
}

/** Merge an auth.profile / avatar response into the store's account (the same shape main.js keeps on auth.ok). */
export function patchAccount(account) {
  if (!account || !Number.isFinite(account.id)) return;
  store.patch('auth', {
    account: {
      id: account.id, name: String(account.name || ''), role: typeof account.role === 'string' ? account.role : null,
      art: typeof account.art === 'string' && account.art ? account.art : null,
      avatar: typeof account.avatar === 'string' && account.avatar ? account.avatar : null,
    },
    error: null,
  });
}

/**
 * The logged-in profile editor (schema v6, owner 2026-10-24): the uploaded avatar and the default seat-card 立绘.
 * Both are the account's, so every later seat shows them; the room's 更换立绘 picker can override the 立绘 for a room.
 */
export function ProfilePanel() {
  useData('assets');
  const auth = useStore((s) => s.auth, shallowEqual);
  const acc = auth?.account;
  const [busy, setBusy] = useState(false);
  const [artOpen, setArtOpen] = useState(false);
  const fileRef = useRef(null);
  if (!acc) return null;
  const avatar = avatarUrl(acc.avatar);
  const art = acc.art ? seatArtUrl(data.get('assets'), acc.art) : null;
  const call = async (method, file = null) => {
    const token = net.accountToken;
    if (!token) throw new Error(t('登录已过期，请重新登录'));
    const r = await fetch('/api/account/avatar', {
      method,
      headers: { 'x-account-token': token, ...(file ? { 'Content-Type': file.type || 'application/octet-stream' } : {}) },
      body: file,
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
    patchAccount(j.account || { ...acc, avatar: j.avatar ?? null });
    return j;
  };
  const pickFile = async (e) => {
    const input = e.currentTarget;
    const file = input.files && input.files[0];
    input.value = '';
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { toast(t('只支持 PNG / JPEG / WebP 图片'), 'warn'); return; }
    if (file.size > AVATAR_MAX_BYTES) { toast(t('图片不能超过 {MB} MB', { MB: Math.round(AVATAR_MAX_BYTES / 1024 / 1024) }), 'warn'); return; }
    setBusy(true);
    try { await call('POST', file); toast(t('头像已更新'), 'success'); } catch (err) { toastError(err); } finally { setBusy(false); }
  };
  const removeAvatar = async () => {
    setBusy(true);
    try { await call('DELETE'); toast(t('已恢复默认头像'), 'success'); } catch (err) { toastError(err); } finally { setBusy(false); }
  };
  const pickArt = (next) => {
    setArtOpen(false);
    net.request('account.setArt', { art: next })
      .then(() => toast(t('默认立绘已保存'), 'success'))
      .catch(toastError);
  };
  return html`<div class="profile" data-testid="profile">
    <div class="profile__row">
      <${AvatarFrame} size="lg" src=${avatar} name=${acc.name} seat=${0} self=${true} />
      <div class="profile__body">
        <b class="profile__title">${t('头像')}</b>
        <span class="set-hint">${t('PNG / JPEG / WebP，最大 {MB} MB；同盟里的博士都会看到。', { MB: Math.round(AVATAR_MAX_BYTES / 1024 / 1024) })}</span>
        <div class="profile__actions">
          <${Button} variant="secondary" size="sm" icon="user" disabled=${busy} onClick=${() => fileRef.current?.click()}>${t('上传头像')}<//>
          ${acc.avatar ? html`<${Button} variant="ghost" size="sm" disabled=${busy} onClick=${removeAvatar}>${t('移除头像')}<//>` : null}
        </div>
        <input ref=${fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange=${pickFile} />
      </div>
    </div>
    <div class="profile__row">
      <button type="button" class="profile__art" onClick=${() => setArtOpen(true)} aria-label=${t('选择默认立绘')}>
        ${art ? html`<img src=${art} alt="" draggable=${false} />` : html`<span>${t('默认')}</span>`}
      </button>
      <div class="profile__body">
        <b class="profile__title">${t('默认立绘')}</b>
        <span class="set-hint">${t('登录后每个房间的座位都先显示这张立绘；房间里的「更换立绘」只改当前座位。')}</span>
        <div class="profile__actions">
          <${Button} variant="secondary" size="sm" icon="edit" onClick=${() => setArtOpen(true)}>${acc.art ? t('更换默认立绘') : t('选择默认立绘')}<//>
        </div>
      </div>
    </div>
    <${ArtPicker} open=${artOpen} current=${acc.art ?? null} onPick=${pickArt} onClose=${() => setArtOpen(false)} />
  </div>`;
}

/**
 * A modal that lets a guest already in the game register / log in, binding the account to the CURRENT session
 * (so the room / match continues). Mount it conditionally so it starts fresh each time.
 * @param {{ onClose: () => void, defaultName?: string }} props
 */
export function AccountDialog({ onClose, defaultName = '' }) {
  const auth = useStore((s) => s.auth, shallowEqual);
  const [name, setName] = useState(defaultName);
  return html`<div class="account-modal" onClick=${(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div class="account-modal__card brackets">
      <div class="account-modal__head"><span>${t('账号')}</span>
        <button type="button" class="account-modal__close" onClick=${onClose} aria-label=${t('关闭')}>✕</button></div>
      ${auth?.account
        ? html`<${AccountWho} account=${auth.account} /><${ProfilePanel} />`
        : html`<div class="account-modal__body">
            <${TextField} size="md" icon="user" value=${name} maxLength=${AUTH_NAME_MAX}
              placeholder=${t('代号（{AUTH_NAME_MIN}–{AUTH_NAME_MAX} 字符）', { AUTH_NAME_MIN, AUTH_NAME_MAX })} onInput=${setName} />
            <${AccountForm} name=${name} onDone=${onClose} />
            <span class="account-modal__note">${t('已是游客？注册或登录后，当前这一局会继续，只是身份升级为正式账号。')}</span>
          </div>`}
    </div>
  </div>`;
}
